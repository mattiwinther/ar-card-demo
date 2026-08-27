import * as THREE from 'three';

const clamp01 = (value) => Math.min(1, Math.max(0, value));

export function quaternionAngle(a, b) {
  // q and -q describe the same rotation, so always use the shortest arc.
  return 2 * Math.acos(Math.min(1, Math.abs(a.dot(b))));
}

/**
 * A time-aware, adaptive pose filter. It removes sub-millimetre / sub-degree
 * marker noise while opening up quickly for deliberate camera movement.
 */
export class PoseStabilizer {
  constructor({
    positionDeadband = 0.0008,
    rotationDeadband = THREE.MathUtils.degToRad(0.35),
    maxPositionSpeed = 2.5,
    maxAngularSpeed = THREE.MathUtils.degToRad(420),
  } = {}) {
    this.positionDeadband = positionDeadband;
    this.rotationDeadband = rotationDeadband;
    this.maxPositionSpeed = maxPositionSpeed;
    this.maxAngularSpeed = maxAngularSpeed;
    this.position = null;
    this.quaternion = null;
    this.pending = null;
    this.lastTimestamp = 0;
  }

  reset() {
    this.position = null;
    this.quaternion = null;
    this.pending = null;
    this.lastTimestamp = 0;
  }

  get reference() {
    return this.position && this.quaternion
      ? { position: this.position, quaternion: this.quaternion }
      : this.pending;
  }

  update(measurement, timestamp) {
    if (!measurement) return null;

    // Require two similar observations before making a newly found marker
    // visible. This avoids briefly anchoring to a bad first-frame solution.
    if (!this.position || !this.quaternion) {
      if (!this.pending) {
        this.pending = {
          position: measurement.position.clone(),
          quaternion: measurement.quaternion.clone(),
          timestamp,
        };
        return null;
      }

      const pendingDistance = this.pending.position.distanceTo(measurement.position);
      const pendingAngle = quaternionAngle(this.pending.quaternion, measurement.quaternion);
      if (pendingDistance > 0.035 || pendingAngle > THREE.MathUtils.degToRad(25)) {
        this.pending.position.copy(measurement.position);
        this.pending.quaternion.copy(measurement.quaternion);
        this.pending.timestamp = timestamp;
        return null;
      }

      this.position = this.pending.position.lerp(measurement.position, 0.5);
      this.quaternion = this.pending.quaternion.slerp(measurement.quaternion, 0.5);
      this.pending = null;
      this.lastTimestamp = timestamp;
      return { position: this.position, quaternion: this.quaternion, corrected: true };
    }

    const dt = Math.min(0.15, Math.max(1 / 120, (timestamp - this.lastTimestamp) / 1000));
    this.lastTimestamp = timestamp;
    const distance = this.position.distanceTo(measurement.position);
    const angle = quaternionAngle(this.quaternion, measurement.quaternion);

    // A planar marker can occasionally return a different corner ordering or
    // a clearly implausible pose. Keep the last good pose instead of snapping.
    const maxDistance = 0.018 + this.maxPositionSpeed * dt;
    const maxAngle = THREE.MathUtils.degToRad(12) + this.maxAngularSpeed * dt;
    if (distance > maxDistance || angle > maxAngle) {
      return { position: this.position, quaternion: this.quaternion, corrected: false };
    }

    const motion = Math.max(
      distance / Math.max(dt * 1.25, 0.001),
      angle / Math.max(dt * THREE.MathUtils.degToRad(180), 0.001),
    );
    const responsiveness = clamp01(motion);
    const positionAlpha = THREE.MathUtils.lerp(0.10, 0.62, responsiveness);
    const rotationAlpha = THREE.MathUtils.lerp(0.09, 0.58, responsiveness);

    if (distance > this.positionDeadband) this.position.lerp(measurement.position, positionAlpha);
    if (angle > this.rotationDeadband) this.quaternion.slerp(measurement.quaternion, rotationAlpha);
    return { position: this.position, quaternion: this.quaternion, corrected: true };
  }
}
