const MAX_HAND_FPS = 12;
const MIN_HAND_FPS = 7;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeAngle(angle) {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
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

/**
 * Runs one GPU hand-landmark inference at a time on the already downscaled AR
 * frame. It intentionally caps itself below the marker detector's rate so the
 * marker pose remains responsive on mid-range phones.
 */
export class HandGestureController {
  constructor({ canvas, onTransform, onStateChange }) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.onTransform = onTransform;
    this.onStateChange = onStateChange;
    this.landmarker = null;
    this.nextInferenceAt = 0;
    this.session = null;
    this.missingFrames = 0;
    this.lastState = '';
  }

  async initialize() {
    this.setState('Loading hand controls…');
    // Lazy-load the task bundle only after the user starts the camera.
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
    this.setState('Show an open hand · turn to rotate · spread to scale');
  }

  setEnabled(enabled) {
    if (!enabled) {
      this.session = null;
      this.clear();
      this.setState('Hand controls paused');
    } else if (this.landmarker) {
      this.setState('Show an open hand · turn to rotate · spread to scale');
    }
  }

  process(frame, timestamp, canManipulate) {
    if (!this.landmarker || timestamp < this.nextInferenceAt) return;

    const started = performance.now();
    const result = this.landmarker.detectForVideo(frame, timestamp);
    const duration = performance.now() - started;
    const minInterval = 1000 / MAX_HAND_FPS;
    const maxInterval = 1000 / MIN_HAND_FPS;
    // Slow devices back off automatically, reserving time for 30fps ArUco.
    this.nextInferenceAt = timestamp + Math.min(maxInterval, Math.max(minInterval, duration * 1.6));

    const landmarks = result.landmarks?.[0];
    if (!landmarks) {
      this.missingFrames += 1;
      if (this.missingFrames >= 2) {
        this.session = null;
        this.clear();
        this.setState('Show an open hand · turn to rotate · spread to scale');
      }
      return;
    }

    this.missingFrames = 0;
    this.draw(landmarks);
    if (!canManipulate) {
      this.session = null;
      this.setState('Find the marker, then show an open hand');
      return;
    }

    if (!isOpenHand(landmarks)) {
      this.session = null;
      this.setState('Open all five fingers to control the model');
      return;
    }

    const palmAngle = Math.atan2(
      landmarks[17].y - landmarks[5].y,
      landmarks[17].x - landmarks[5].x,
    );
    const palmWidth = distance(landmarks[5], landmarks[17]);
    const spread = palmWidth > 0.001 ? distance(landmarks[4], landmarks[20]) / palmWidth : 1;

    if (!this.session) {
      this.session = { angle: palmAngle, spread };
      this.setState('Hand control active · turn to rotate · spread to scale');
      return;
    }

    // Reject a one-frame landmark jump while keeping deliberate wrist turns.
    const angleDelta = Math.max(-0.18, Math.min(0.18, normalizeAngle(palmAngle - this.session.angle)));
    const scaleFactor = Math.max(0.82, Math.min(1.22, spread / this.session.spread));
    this.session.angle = palmAngle;
    this.session.spread = spread;
    this.onTransform({ rotationDelta: angleDelta * 1.35, scaleFactor });
    this.setState('Hand control active · turn to rotate · spread to scale');
  }

  draw(landmarks) {
    const { width, height } = this.canvas;
    this.context.clearRect(0, 0, width, height);
    this.context.save();
    this.context.strokeStyle = 'rgba(199, 240, 75, .82)';
    this.context.fillStyle = '#ddff68';
    this.context.lineWidth = Math.max(1.5, width / 360);
    this.context.shadowColor = '#c7f04b';
    this.context.shadowBlur = 7;

    this.handConnections.forEach(({ start, end }) => {
      const a = landmarks[start];
      const b = landmarks[end];
      this.context.beginPath();
      this.context.moveTo(a.x * width, a.y * height);
      this.context.lineTo(b.x * width, b.y * height);
      this.context.stroke();
    });

    landmarks.forEach((point, index) => {
      this.context.beginPath();
      this.context.arc(point.x * width, point.y * height, index === 0 ? 4 : 2.6, 0, Math.PI * 2);
      this.context.fill();
    });
    this.context.restore();
  }

  clear() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
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
