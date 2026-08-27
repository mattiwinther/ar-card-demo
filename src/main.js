import './style.css';
import initAruco, { ARucoDetector } from '@ar-js-org/aruco-rs';
import * as THREE from 'three';
import {
  ArrowUpRight,
  Box,
  createIcons,
  Focus,
  Hand,
  Info,
  Minus,
  Plus,
  Printer,
  ScanLine,
  ShieldCheck,
  SwitchCamera,
  Upload,
  X,
} from 'lucide';
import { estimateSquarePose, markerArea } from './pose.js';
import { HandGestureController } from './gestures.js';
import { createBeacon, createBot, loadUploadedModel } from './models.js';
import { openPrintableMarker, renderMiniMarker, SAMPLE_MARKER_ID } from './marker.js';

createIcons({
  icons: { ArrowUpRight, Box, Focus, Hand, Info, Minus, Plus, Printer, ScanLine, ShieldCheck, SwitchCamera, Upload, X },
});
renderMiniMarker(document.querySelector('#marker-mini'));

const elements = {
  stage: document.querySelector('#ar-stage'),
  video: document.querySelector('#camera'),
  threeCanvas: document.querySelector('#three-canvas'),
  guideCanvas: document.querySelector('#guide-canvas'),
  detectorCanvas: document.querySelector('#detector-canvas'),
  handCanvas: document.querySelector('#hand-canvas'),
  gestureState: document.querySelector('#gesture-state'),
  startButton: document.querySelector('#start-button'),
  startPrintButton: document.querySelector('#start-print-button'),
  printButton: document.querySelector('#print-button'),
  switchButton: document.querySelector('#camera-switch'),
  zoomOut: document.querySelector('#zoom-out'),
  zoomIn: document.querySelector('#zoom-in'),
  zoomLabel: document.querySelector('#zoom-label'),
  markerId: document.querySelector('#marker-id'),
  markerSize: document.querySelector('#marker-size'),
  modelSelect: document.querySelector('#model-select'),
  modelUpload: document.querySelector('#model-upload'),
  status: document.querySelector('#system-status'),
  statusLabel: document.querySelector('#system-status-label'),
  trackingTitle: document.querySelector('#tracking-title'),
  metricMarker: document.querySelector('#metric-marker'),
  metricDetect: document.querySelector('#metric-detect'),
  metricFps: document.querySelector('#metric-fps'),
  hudText: document.querySelector('#hud-text'),
  aboutDialog: document.querySelector('#about-dialog'),
  aboutButton: document.querySelector('#about-button'),
  aboutClose: document.querySelector('#about-close'),
};

const detectorContext = elements.detectorCanvas.getContext('2d', { willReadFrequently: true });
const guideContext = elements.guideCanvas.getContext('2d');
const renderer = new THREE.WebGLRenderer({ canvas: elements.threeCanvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.005, 20);
camera.position.set(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xe9fff3, 0x1c2823, 2.6));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.5);
keyLight.position.set(-1.5, 2.5, 1.5);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0xc7f04b, 4, 3);
rimLight.position.set(0.7, 0.7, -0.3);
scene.add(rimLight);

const anchor = new THREE.Group();
anchor.visible = false;
scene.add(anchor);

const modelMount = new THREE.Group();
// YXZ keeps the model upright while its local Y rotates around the marker normal.
modelMount.rotation.order = 'YXZ';
modelMount.rotation.x = -Math.PI / 2;
anchor.add(modelMount);

let activeModel = createBot();
modelMount.add(activeModel);

let detector = null;
let handGestures = null;
let handInitialization = null;
let cameraStream = null;
let facingMode = 'environment';
let cameraStarted = false;
let detectorBusy = false;
let processingWidth = 640;
let processingHeight = 480;
let intrinsics = { fx: 500, fy: 500, cx: 320, cy: 240 };
let lastDetectionAt = 0;
let lastMarkerAt = 0;
let hasPose = false;
let tracking = false;
let frameHandle = 0;
let gestureRotation = 0;
let gestureScale = 1;
let sizeScaler = 1;
let handAttached = false;
let zoomHover = null;
const handTargetPosition = new THREE.Vector3();
const handRaycaster = new THREE.Raycaster();
const handNdc = new THREE.Vector2();
const markerPlane = new THREE.Plane();
const markerNormal = new THREE.Vector3();
const markerWorldPosition = new THREE.Vector3();
const markerWorldQuaternion = new THREE.Quaternion();
const handIntersection = new THREE.Vector3();
const modelVisualOffset = new THREE.Vector3();
const detectionTimes = [];
const detectionStamps = [];
const clock = new THREE.Clock();

function setStatus(label, type = 'ready') {
  elements.statusLabel.textContent = label;
  elements.status.classList.toggle('is-error', type === 'error');
}

function setHud(message) {
  elements.hudText.textContent = message;
}

function setTracking(next, force = false) {
  if (tracking === next && !force) return;
  tracking = next;
  elements.stage.classList.toggle('is-tracking', tracking);
  elements.stage.classList.toggle('scanning', !tracking && cameraStarted);
  elements.trackingTitle.textContent = tracking ? 'Anchor locked' : 'Searching for marker';
  setStatus(tracking ? 'Tracking locked' : 'Tracker active');
  setHud(tracking ? `Marker #${Number(elements.markerId.value)} locked · hold steady` : `Looking for marker #${Number(elements.markerId.value)}`);
}

function disposeObject(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material?.dispose?.());
  });
}

function installModel(nextModel, label) {
  if (activeModel) {
    modelMount.remove(activeModel);
    disposeObject(activeModel);
  }
  activeModel = nextModel;
  modelMount.add(activeModel);
  elements.modelSelect.value = label || '';
  setHud(`${label ? 'Loaded' : 'Custom model loaded'} · point at marker #${elements.markerId.value}`);
}

function markerSizeMeters() {
  const millimeters = Math.min(300, Math.max(20, Number(elements.markerSize.value) || 50));
  return millimeters / 1000;
}

function resizeStage() {
  const rect = elements.stage.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();

  const aspect = rect.width / rect.height;
  if (aspect >= 1) {
    processingWidth = 640;
    processingHeight = Math.max(240, Math.round(640 / aspect));
  } else {
    processingHeight = 640;
    processingWidth = Math.max(240, Math.round(640 * aspect));
  }

  elements.detectorCanvas.width = processingWidth;
  elements.detectorCanvas.height = processingHeight;
  elements.guideCanvas.width = processingWidth;
  elements.guideCanvas.height = processingHeight;
  elements.handCanvas.width = processingWidth;
  elements.handCanvas.height = processingHeight;

  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const focal = (processingHeight * 0.5) / Math.tan(verticalFov * 0.5);
  intrinsics = {
    fx: focal,
    fy: focal,
    cx: processingWidth * 0.5,
    cy: processingHeight * 0.5,
  };
}

function drawCameraFrame() {
  const videoWidth = elements.video.videoWidth;
  const videoHeight = elements.video.videoHeight;
  if (!videoWidth || !videoHeight) return false;

  const sourceAspect = videoWidth / videoHeight;
  const destinationAspect = processingWidth / processingHeight;
  let sx = 0;
  let sy = 0;
  let sw = videoWidth;
  let sh = videoHeight;

  if (sourceAspect > destinationAspect) {
    sw = videoHeight * destinationAspect;
    sx = (videoWidth - sw) * 0.5;
  } else {
    sh = videoWidth / destinationAspect;
    sy = (videoHeight - sh) * 0.5;
  }

  detectorContext.drawImage(elements.video, sx, sy, sw, sh, 0, 0, processingWidth, processingHeight);
  return true;
}

function drawMarkerGuide(marker, isTarget) {
  guideContext.clearRect(0, 0, processingWidth, processingHeight);
  if (!marker) return;

  const corners = marker.corners;
  guideContext.save();
  guideContext.lineWidth = 2;
  guideContext.strokeStyle = isTarget ? '#c7f04b' : 'rgba(255,255,255,.55)';
  guideContext.fillStyle = isTarget ? '#c7f04b' : '#ffffff';
  guideContext.shadowColor = isTarget ? '#c7f04b' : 'transparent';
  guideContext.shadowBlur = isTarget ? 10 : 0;
  guideContext.beginPath();
  guideContext.moveTo(corners[0].x, corners[0].y);
  corners.slice(1).forEach((corner) => guideContext.lineTo(corner.x, corner.y));
  guideContext.closePath();
  guideContext.stroke();

  corners.forEach((corner, index) => {
    guideContext.fillRect(corner.x - 3, corner.y - 3, 6, 6);
    if (index === 0) {
      guideContext.font = '500 10px "DM Mono", monospace';
      guideContext.fillText(`#${marker.id}`, corner.x + 9, corner.y - 8);
    }
  });
  guideContext.restore();
}

function recordDetection(duration) {
  const now = performance.now();
  detectionTimes.push(duration);
  detectionStamps.push(now);
  if (detectionTimes.length > 40) detectionTimes.shift();
  while (detectionStamps.length > 2 && now - detectionStamps[0] > 1000) detectionStamps.shift();

  const average = detectionTimes.reduce((sum, value) => sum + value, 0) / detectionTimes.length;
  const rate = detectionStamps.length > 1
    ? ((detectionStamps.length - 1) * 1000) / (detectionStamps.at(-1) - detectionStamps[0])
    : 0;
  elements.metricDetect.textContent = `${average.toFixed(1)} ms`;
  elements.metricFps.textContent = `${Math.round(rate)} fps`;
}

function updatePose(marker) {
  const area = markerArea(marker.corners);
  if (area < 180) return false;

  const pose = estimateSquarePose(marker.corners, markerSizeMeters(), intrinsics);
  if (!pose || pose.translation.z < 0.02 || pose.translation.z > 20) return false;

  if (!hasPose) {
    anchor.position.copy(pose.position);
    anchor.quaternion.copy(pose.quaternion);
    hasPose = true;
  } else {
    anchor.position.lerp(pose.position, 0.42);
    anchor.quaternion.slerp(pose.quaternion, 0.38);
  }

  const markerScale = markerSizeMeters() * 0.92;
  modelMount.scale.setScalar(markerScale * gestureScale);
  anchor.visible = true;
  lastMarkerAt = performance.now();
  return true;
}

function runDetection(now) {
  if (!detector || detectorBusy || !cameraStarted || elements.video.readyState < 2) return;
  if (now - lastDetectionAt < 1000 / 30) return;
  lastDetectionAt = now;
  detectorBusy = true;

  try {
    if (!drawCameraFrame()) return;
    const frame = detectorContext.getImageData(0, 0, processingWidth, processingHeight);
    const started = performance.now();
    const markers = detector.detect_image(processingWidth, processingHeight, new Uint8Array(frame.data.buffer));
    recordDetection(performance.now() - started);

    const targetId = Number(elements.markerId.value);
    const target = markers.find((marker) => marker.id === targetId);
    const shownMarker = target || markers[0];
    elements.metricMarker.textContent = shownMarker ? `#${shownMarker.id}` : '—';
    drawMarkerGuide(shownMarker, Boolean(target));

    if (target && updatePose(target)) {
      setTracking(true);
    } else if (performance.now() - lastMarkerAt > 260) {
      anchor.visible = false;
      hasPose = false;
      setTracking(false);
    }
  } catch (error) {
    console.error('Detection failed:', error);
    setStatus('Detector error', 'error');
    setHud('The detector stopped unexpectedly · reload to retry');
  } finally {
    detectorBusy = false;
  }
}

function setSizeScaler(next) {
  sizeScaler = THREE.MathUtils.clamp(next, 0.5, 2.25);
  elements.zoomLabel.textContent = `SIZE ${sizeScaler.toFixed(1)}×`;
}

function adjustSizeScaler(direction) {
  setSizeScaler(sizeScaler + direction * 0.1);
}

function buttonContainsPoint(button, point) {
  if (!point) return false;
  const stageRect = elements.stage.getBoundingClientRect();
  const rect = button.getBoundingClientRect();
  const x = stageRect.left + point.x * stageRect.width;
  const y = stageRect.top + point.y * stageRect.height;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function updateThumbZoom(thumb) {
  const direction = buttonContainsPoint(elements.zoomIn, thumb) ? 1
    : buttonContainsPoint(elements.zoomOut, thumb) ? -1 : 0;
  elements.zoomIn.classList.toggle('is-hovered', direction === 1);
  elements.zoomOut.classList.toggle('is-hovered', direction === -1);

  if (!direction) {
    zoomHover = null;
    return;
  }

  const now = performance.now();
  if (!zoomHover || zoomHover.direction !== direction) {
    zoomHover = { direction, since: now };
  } else if (now - zoomHover.since > 360) {
    adjustSizeScaler(direction);
    zoomHover.since = now;
  }
}

function placeModelAtHand(center) {
  handNdc.set(center.x * 2 - 1, 1 - center.y * 2);
  anchor.updateMatrixWorld(true);
  handRaycaster.setFromCamera(handNdc, camera);
  anchor.getWorldPosition(markerWorldPosition);
  anchor.getWorldQuaternion(markerWorldQuaternion);
  markerNormal.set(0, 0, 1).applyQuaternion(markerWorldQuaternion).normalize();
  markerPlane.setFromNormalAndCoplanarPoint(markerNormal, markerWorldPosition);

  if (handRaycaster.ray.intersectPlane(markerPlane, handIntersection)) {
    handTargetPosition.copy(handIntersection);
    anchor.worldToLocal(handTargetPosition);
    const visualCenter = activeModel?.userData?.visualCenter;
    if (visualCenter) {
      modelVisualOffset.copy(visualCenter).applyEuler(modelMount.rotation).multiply(modelMount.scale);
      handTargetPosition.sub(modelVisualOffset);
    }
    return true;
  }
  return false;
}

function updateHandInteraction({ activeHand, rightHand, rotationDelta, canManipulate }) {
  if (!canManipulate || !activeHand) {
    handAttached = false;
    gestureScale = 1;
    handTargetPosition.set(0, 0, 0);
    updateThumbZoom(null);
    return;
  }

  gestureScale = THREE.MathUtils.clamp(activeHand.spread * 7.5 * sizeScaler, 0.32, 3.2);
  gestureRotation += rotationDelta * 1.35;
  modelMount.rotation.y = gestureRotation;
  modelMount.scale.setScalar(markerSizeMeters() * 0.92 * gestureScale);
  handAttached = placeModelAtHand(activeHand.center);
  updateThumbZoom(rightHand?.thumb);
}

function animate(now) {
  frameHandle = requestAnimationFrame(animate);
  runDetection(now);
  // Two hands are sampled from the shared 640px frame at an adaptive 5–10fps.
  handGestures?.process(elements.detectorCanvas, now, tracking && anchor.visible);
  modelMount.position.lerp(handTargetPosition, handAttached ? 0.28 : 0.16);
  activeModel?.userData?.animate?.(clock.getElapsedTime());
  renderer.render(scene, camera);
}

async function initializeDetector() {
  if (detector) return;
  setStatus('Loading WASM');
  await initAruco();
  detector = new ARucoDetector('ARUCO');
  setStatus('System ready');
}

async function initializeHandTracking() {
  if (handInitialization) return handInitialization;

  handInitialization = (async () => {
    const controller = new HandGestureController({
      canvas: elements.handCanvas,
      onHands: updateHandInteraction,
      onStateChange: (message) => { elements.gestureState.querySelector('span').textContent = message; },
    });
    try {
      await controller.initialize();
      handGestures = controller;
    } catch (error) {
      controller.close();
      elements.gestureState.querySelector('span').textContent = 'Hand controls unavailable on this device';
      console.warn('Hand controls could not be initialized:', error);
    }
  })();
  return handInitialization;
}

async function startCamera() {
  elements.startButton.disabled = true;
  elements.startButton.querySelector('span').textContent = 'Starting…';
  setStatus('Requesting camera');

  try {
    await initializeDetector();
    cameraStream?.getTracks().forEach((track) => track.stop());
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    elements.video.srcObject = cameraStream;
    await elements.video.play();
    cameraStarted = true;
    lastMarkerAt = performance.now();
    elements.stage.classList.add('camera-active', 'scanning');
    elements.startButton.querySelector('span').textContent = 'Start camera';
    setTracking(false, true);
    setStatus('Tracker active');
    setHud(`Looking for marker #${elements.markerId.value}`);
    resizeStage();
    // Do not block camera startup on the 7.5 MB hand model.
    void initializeHandTracking();
  } catch (error) {
    console.error('Camera initialization failed:', error);
    const denied = error?.name === 'NotAllowedError';
    setStatus(denied ? 'Camera blocked' : 'Camera unavailable', 'error');
    setHud(denied ? 'Allow camera access in your browser settings' : 'No compatible camera was found');
    elements.startButton.querySelector('span').textContent = 'Try again';
  } finally {
    elements.startButton.disabled = false;
  }
}

async function switchCamera() {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  setHud('Switching camera…');
  await startCamera();
}

elements.startButton.addEventListener('click', startCamera);
elements.switchButton.addEventListener('click', switchCamera);
elements.zoomOut.addEventListener('click', () => adjustSizeScaler(-1));
elements.zoomIn.addEventListener('click', () => adjustSizeScaler(1));
const printSampleMarker = () => {
  try {
    openPrintableMarker();
  } catch (error) {
    setHud(error.message);
  }
};
elements.startPrintButton.addEventListener('click', printSampleMarker);
elements.printButton.addEventListener('click', printSampleMarker);

elements.markerId.addEventListener('change', () => {
  const parsed = Number(elements.markerId.value);
  const fallback = Number.isFinite(parsed) ? parsed : SAMPLE_MARKER_ID;
  const value = Math.min(1022, Math.max(0, Math.round(fallback)));
  elements.markerId.value = String(value);
  anchor.visible = false;
  hasPose = false;
  setTracking(false, true);
  setHud(`Looking for marker #${value}`);
});

elements.markerSize.addEventListener('change', () => {
  const value = Math.min(300, Math.max(20, Number(elements.markerSize.value) || 50));
  elements.markerSize.value = String(value);
});

elements.modelSelect.addEventListener('change', () => {
  const value = elements.modelSelect.value;
  installModel(value === 'beacon' ? createBeacon() : createBot(), value);
});

elements.modelUpload.addEventListener('change', async () => {
  const [file] = elements.modelUpload.files;
  if (!file) return;
  setHud(`Loading ${file.name}…`);
  try {
    const model = await loadUploadedModel(file);
    installModel(model, '');
    setHud(`${file.name} loaded · point at marker #${elements.markerId.value}`);
  } catch (error) {
    console.error('Model load failed:', error);
    setHud(`Could not load ${file.name} · try a self-contained .glb`);
  } finally {
    elements.modelUpload.value = '';
  }
});

elements.aboutButton.addEventListener('click', () => elements.aboutDialog.showModal());
elements.aboutClose.addEventListener('click', () => elements.aboutDialog.close());
elements.aboutDialog.addEventListener('click', (event) => {
  if (event.target === elements.aboutDialog) elements.aboutDialog.close();
});

window.addEventListener('resize', resizeStage);
window.addEventListener('beforeunload', () => {
  cancelAnimationFrame(frameHandle);
  handGestures?.close();
  cameraStream?.getTracks().forEach((track) => track.stop());
});

resizeStage();
animate(performance.now());
initializeDetector().catch((error) => {
  console.error('WASM initialization failed:', error);
  setStatus('WASM unavailable', 'error');
  setHud('The ArUco WebAssembly module could not be loaded');
});
