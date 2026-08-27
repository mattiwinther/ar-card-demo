import * as THREE from 'three';

const EPSILON = 1e-9;

function solveLinearSystem(matrix) {
  const size = matrix.length;

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }

    if (Math.abs(matrix[pivot][column]) < EPSILON) return null;
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];

    const divisor = matrix[column][column];
    for (let index = column; index <= size; index += 1) matrix[column][index] /= divisor;

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = matrix[row][column];
      for (let index = column; index <= size; index += 1) {
        matrix[row][index] -= factor * matrix[column][index];
      }
    }
  }

  return matrix.map((row) => row[size]);
}

function homographyFromSquare(corners, markerSize) {
  const half = markerSize / 2;
  const world = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];
  const equations = [];

  for (let index = 0; index < 4; index += 1) {
    const [x, y] = world[index];
    const { x: u, y: v } = corners[index];
    equations.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    equations.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }

  const values = solveLinearSystem(equations);
  if (!values) return null;
  return [
    values[0], values[1], values[2],
    values[3], values[4], values[5],
    values[6], values[7], 1,
  ];
}

function normalizedColumn(h, column, intrinsics) {
  const { fx, fy, cx, cy } = intrinsics;
  const h1 = h[column];
  const h2 = h[column + 3];
  const h3 = h[column + 6];
  return new THREE.Vector3((h1 - cx * h3) / fx, (h2 - cy * h3) / fy, h3);
}

export function estimateSquarePose(corners, markerSize, intrinsics) {
  if (!corners || corners.length !== 4 || markerSize <= 0) return null;

  const h = homographyFromSquare(corners, markerSize);
  if (!h) return null;

  const col1 = normalizedColumn(h, 0, intrinsics);
  const col2 = normalizedColumn(h, 1, intrinsics);
  const col3 = normalizedColumn(h, 2, intrinsics);
  const norm = (col1.length() + col2.length()) * 0.5;
  if (!Number.isFinite(norm) || norm < EPSILON) return null;

  const sign = col3.z >= 0 ? 1 : -1;
  const scale = sign / norm;
  const translation = col3.multiplyScalar(scale);
  const r1 = col1.multiplyScalar(scale).normalize();
  const r2 = col2.multiplyScalar(scale);
  r2.addScaledVector(r1, -r1.dot(r2)).normalize();
  const r3 = new THREE.Vector3().crossVectors(r1, r2).normalize();
  r2.crossVectors(r3, r1).normalize();

  if (![translation.x, translation.y, translation.z, r1.x, r2.y, r3.z].every(Number.isFinite)) return null;

  // OpenCV camera coordinates are x-right, y-down, z-forward. Three.js is
  // x-right, y-up, z-back, so flip camera Y and Z on the left side.
  const matrix = new THREE.Matrix4();
  matrix.set(
    r1.x, r2.x, r3.x, translation.x,
    -r1.y, -r2.y, -r3.y, -translation.y,
    -r1.z, -r2.z, -r3.z, -translation.z,
    0, 0, 0, 1,
  );

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const objectScale = new THREE.Vector3();
  matrix.decompose(position, quaternion, objectScale);

  // A planar pose becomes numerically unstable as the card approaches an
  // edge-on view. Expose this so callers can hold the last good pose instead
  // of applying a noisy estimate.
  const viewCosine = Math.abs(r3.dot(translation.clone().normalize()));
  return { matrix, position, quaternion, translation, viewCosine };
}

export function estimateSquarePoseClosestToReference(corners, markerSize, intrinsics, reference) {
  if (!reference) return estimateSquarePose(corners, markerSize, intrinsics);

  // Some detector implementations can rotate the first reported corner as
  // the card crosses an image quadrant. Test every cyclic correspondence and
  // choose the pose continuous with the last accepted frame.
  let bestPose = null;
  let bestScore = Infinity;
  for (let offset = 0; offset < 4; offset += 1) {
    const orderedCorners = corners.map((_, index) => corners[(index + offset) % 4]);
    const candidate = estimateSquarePose(orderedCorners, markerSize, intrinsics);
    if (!candidate) continue;

    const rotationDistance = 2 * Math.acos(Math.min(1, Math.abs(reference.quaternion.dot(candidate.quaternion))));
    const positionDistance = reference.position.distanceTo(candidate.position);
    const relativePositionDistance = positionDistance / Math.max(0.05, reference.position.length());
    const score = rotationDistance + relativePositionDistance * 0.35;
    if (score < bestScore) {
      bestScore = score;
      bestPose = candidate;
    }
  }

  return bestPose;
}

export function markerArea(corners) {
  if (!corners || corners.length !== 4) return 0;
  let sum = 0;
  for (let index = 0; index < 4; index += 1) {
    const current = corners[index];
    const next = corners[(index + 1) % 4];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) * 0.5;
}
