const MAX_HAND_FPS = 15;
const MIN_HAND_FPS = 9;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

function smoothLandmarks(previous, current, dt, motionScale) {
  if (!current) return null;
  if (!previous || previous.length !== current.length) return current.map((point) => ({ ...point }));

  const baseAlpha = 1 - Math.exp(-dt * 4);
  current.forEach((point, index) => {
    const filtered = previous[index];
    const speed = Math.hypot(
      point.x - filtered.x,
      point.y - filtered.y,
      (point.z || 0) - (filtered.z || 0),
    ) / dt;
    const alpha = baseAlpha + (0.78 - baseAlpha) * clamp01(speed / motionScale);
    filtered.x += (point.x - filtered.x) * alpha;
    filtered.y += (point.y - filtered.y) * alpha;
    if (Number.isFinite(point.z)) filtered.z += (point.z - filtered.z) * alpha;
    if (Number.isFinite(point.visibility)) filtered.visibility = point.visibility;
  });
  return previous;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isFingerExtended(landmarks, knuckle, joint, tip) {
  const wrist = landmarks[0];
  return distance(landmarks[tip], wrist) > distance(landmarks[joint], wrist) * 1.12
    && distance(landmarks[tip], landmarks[knuckle]) > distance(landmarks[joint], landmarks[knuckle]) * 1.22;
}

function isOpenHand(landmarks) {
  const wrist = landmarks[0];
  const thumbExtended = distance(landmarks[4], wrist) > distance(landmarks[3], wrist) * 1.08;
  return thumbExtended
    && isFingerExtended(landmarks, 5, 6, 8)
    && isFingerExtended(landmarks, 9, 10, 12)
    && isFingerExtended(landmarks, 13, 14, 16)
    && isFingerExtended(landmarks, 17, 18, 20);
}

function handCenter(landmarks) {
  const points = [landmarks[0], landmarks[5], landmarks[9], landmarks[13], landmarks[17]];
  return points.reduce((center, point) => ({ x: center.x + point.x / points.length, y: center.y + point.y / points.length }), { x: 0, y: 0 });
}

/**
 * GPU hand landmarks share the marker detector's downscaled frame. One hand
 * is sufficient for palm position and full 3D orientation, keeping mobile
 * inference costs low.
 */
export class HandGestureController {
  constructor({ canvas, onHands, onStateChange }) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.onHands = onHands;
    this.onStateChange = onStateChange;
    this.landmarker = null;
    this.handConnections = [];
    this.nextInferenceAt = 0;
    this.missingFrames = 0;
    this.lastState = '';
    this.filteredLandmarks = null;
    this.filteredWorldLandmarks = null;
    this.lastHandTimestamp = 0;
    this.openStartedAt = null;
    this.closedStartedAt = null;
    this.openHandStable = false;
  }

  async initialize() {
    this.setState('Loading hand controls…');
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    this.handConnections = HandLandmarker.HAND_CONNECTIONS;
    const vision = await FilesetResolver.forVisionTasks('./mediapipe');
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: './models/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.62,
      minHandPresenceConfidence: 0.58,
      minTrackingConfidence: 0.55,
    });
    this.setState('Show your left hand to lift the model');
  }

  process(frame, timestamp, canManipulate) {
    if (!this.landmarker || timestamp < this.nextInferenceAt) return;

    const started = performance.now();
    const result = this.landmarker.detectForVideo(frame, timestamp);
    const duration = performance.now() - started;
    const minInterval = 1000 / MAX_HAND_FPS;
    const maxInterval = 1000 / MIN_HAND_FPS;
    this.nextInferenceAt = timestamp + Math.min(maxInterval, Math.max(minInterval, duration * 1.45));

    const rawHands = result.landmarks || [];
    if (!rawHands.length) {
      this.missingFrames += 1;
      if (this.missingFrames >= 2) {
        this.clear();
        this.onHands?.({ activeHand: null, rotationEnabled: false, canManipulate });
        this.setState('Show your left hand to lift the model');
      }
      return;
    }

    this.missingFrames = 0;
    const dt = this.lastHandTimestamp
      ? Math.min(0.2, Math.max(1 / 60, (timestamp - this.lastHandTimestamp) / 1000))
      : 1 / 15;
    this.lastHandTimestamp = timestamp;
    const handedness = result.handedness || result.handednesses || [];
    const rawLandmarks = rawHands[0];
    const rawWorldLandmarks = result.worldLandmarks?.[0];
    this.filteredLandmarks = smoothLandmarks(this.filteredLandmarks, rawLandmarks, dt, 0.7);
    this.filteredWorldLandmarks = smoothLandmarks(this.filteredWorldLandmarks, rawWorldLandmarks, dt, 0.35);

    const rawOpen = isOpenHand(rawLandmarks);
    if (rawOpen) {
      if (this.openStartedAt === null) this.openStartedAt = timestamp;
      this.closedStartedAt = null;
      if (timestamp - this.openStartedAt >= 50) this.openHandStable = true;
    } else {
      if (this.closedStartedAt === null) this.closedStartedAt = timestamp;
      this.openStartedAt = null;
      if (timestamp - this.closedStartedAt >= 90) this.openHandStable = false;
    }

    const hands = [{
      landmarks: this.filteredLandmarks,
      worldLandmarks: this.filteredWorldLandmarks,
      label: handedness[0]?.[0]?.categoryName || 'Unknown',
      center: handCenter(this.filteredLandmarks),
      open: this.openHandStable,
      timestamp,
    }];
    this.draw(hands);

    const activeHand = hands[0];
    const rotationEnabled = canManipulate && activeHand.open && Boolean(activeHand.worldLandmarks);

    if (rotationEnabled) {
      this.setState('Hand attached · rotate your palm in any direction');
    } else {
      this.setState(canManipulate ? 'Open all five fingers to rotate the model' : 'Find the marker, then show your left hand');
    }

    this.onHands?.({ activeHand, rotationEnabled, canManipulate });
  }

  draw(hands) {
    const { width, height } = this.canvas;
    this.context.clearRect(0, 0, width, height);
    this.context.save();
    this.context.lineWidth = Math.max(1.5, width / 360);
    this.context.shadowBlur = 7;

    hands.forEach((hand) => {
      const isRight = hand.label === 'Right';
      this.context.strokeStyle = isRight ? 'rgba(143, 229, 189, .86)' : 'rgba(199, 240, 75, .86)';
      this.context.fillStyle = isRight ? '#8fe5bd' : '#ddff68';
      this.context.shadowColor = this.context.fillStyle;
      this.handConnections.forEach(({ start, end }) => {
        const a = hand.landmarks[start];
        const b = hand.landmarks[end];
        this.context.beginPath();
        this.context.moveTo(a.x * width, a.y * height);
        this.context.lineTo(b.x * width, b.y * height);
        this.context.stroke();
      });
      hand.landmarks.forEach((point, index) => {
        this.context.beginPath();
        this.context.arc(point.x * width, point.y * height, index === 0 ? 4 : 2.6, 0, Math.PI * 2);
        this.context.fill();
      });
    });
    this.context.restore();
  }

  clear() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.filteredLandmarks = null;
    this.filteredWorldLandmarks = null;
    this.lastHandTimestamp = 0;
    this.openStartedAt = null;
    this.closedStartedAt = null;
    this.openHandStable = false;
  }

  setState(message) {
    if (message === this.lastState) return;
    this.lastState = message;
    this.onStateChange?.(message);
  }

  close() {
    this.landmarker?.close();
    this.landmarker = null;
    this.clear();
  }
}
