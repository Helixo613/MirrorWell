// src/metrics/normalize.ts — makes geometry comparable across pose, distance, lighting, and
// sessions (docs/BACKEND.md §1.4). Contracts: docs/API.md §7.
//
// Pipeline per docs/BACKEND.md §1.4: (1) scale all landmark coordinates by inter-ocular
// distance; (2) rotate into canonical head pose using the inverse of headPose; (3) compute
// per-region distances (region -> landmark indices from exercises.ts); (4) subtract
// neutralStats reference -> regionDisplacements.
//
// CAVEAT: step (2)'s inverse-rotation uses the same pose-matrix convention flagged as
// unverified-against-real-MediaPipe-output in src/sensing/quality.ts. Synthetic tests here
// prove this module is internally self-consistent; true validation is the Task 6 V1 kill-gate
// (B1-B3), which requires real fixture recordings that do not exist in this environment yet.
// Do not treat this module as V1-validated.
import type { LandmarkFrame } from '../sensing/landmarks.ts';
import type { CalibrationBaseline, RegionId } from '../data/schema.ts';
import { MirrorWellError } from '../data/errors.ts';
import { exercises } from '../config/exercises.ts';

export interface NormalizedFrame {
  regionDisplacements: Record<RegionId, { left: number; right: number }>;
}

const LEFT_EYE_OUTER_CORNER = 33;
const RIGHT_EYE_OUTER_CORNER = 263;

let activeBaseline: CalibrationBaseline | null = null;

function setBaseline(b: CalibrationBaseline): void {
  if (!b || !b.neutralStats || Object.keys(b.neutralStats).length !== 4) {
    throw new MirrorWellError('NO_BASELINE', 'setBaseline called with an invalid or incomplete baseline');
  }
  activeBaseline = b;
}

function clearBaseline(): void {
  activeBaseline = null;
}

function distance3d(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function interOcularNormalized(landmarks: LandmarkFrame['landmarks']): number {
  const left = landmarks[LEFT_EYE_OUTER_CORNER];
  const right = landmarks[RIGHT_EYE_OUTER_CORNER];
  if (!left || !right) return 1; // defensive; QualityMonitor gates this before normalize() runs
  return distance3d(left, right) || 1;
}

// Rotates a point around `center` by the INVERSE of headPose's rotation — i.e. applies R^T
// (transpose of the 3x3 rotation block), which undoes the head's rotation for a rigid
// transform. Row-major 4x4: element (row, col) = headPose[row*4 + col].
function inverseRotateAround(
  point: { x: number; y: number; z: number },
  center: { x: number; y: number; z: number },
  headPose: number[],
): { x: number; y: number; z: number } {
  const r = (row: number, col: number) => headPose[row * 4 + col] ?? (row === col ? 1 : 0);
  const x = point.x - center.x;
  const y = point.y - center.y;
  const z = point.z - center.z;
  // R^T * v
  return {
    x: center.x + (r(0, 0) * x + r(1, 0) * y + r(2, 0) * z),
    y: center.y + (r(0, 1) * x + r(1, 1) * y + r(2, 1) * z),
    z: center.z + (r(0, 2) * x + r(1, 2) * y + r(2, 2) * z),
  };
}

function regionSideDistance(
  landmarks: LandmarkFrame['landmarks'],
  indices: string[],
  interOcular: number,
  headPose: number[],
  poseCenter: { x: number; y: number; z: number },
): number {
  const [aIdx, bIdx] = indices.map(Number);
  const a = landmarks[aIdx!];
  const b = landmarks[bIdx!];
  if (!a || !b) return 0;

  const aRot = inverseRotateAround(a, poseCenter, headPose);
  const bRot = inverseRotateAround(b, poseCenter, headPose);
  return distance3d(aRot, bRot) / interOcular;
}

function normalize(lf: LandmarkFrame): NormalizedFrame {
  if (!activeBaseline) {
    throw new MirrorWellError('NO_BASELINE', 'normalize called without setBaseline');
  }

  const interOcular = interOcularNormalized(lf.landmarks);
  const leftEye = lf.landmarks[LEFT_EYE_OUTER_CORNER];
  const rightEye = lf.landmarks[RIGHT_EYE_OUTER_CORNER];
  const poseCenter =
    leftEye && rightEye
      ? { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2, z: (leftEye.z + rightEye.z) / 2 }
      : { x: 0.5, y: 0.5, z: 0 };

  const regionDisplacements = {} as Record<RegionId, { left: number; right: number }>;

  // Regions are 1:1 with exercises (docs/ARCHITECTURE.md §12) — each exercise config carries
  // its regionId + landmark indices.
  for (const config of Object.values(exercises)) {
    const regionId = config.regionId as RegionId;
    const leftDist = regionSideDistance(lf.landmarks, config.landmarkIndices.left, interOcular, lf.headPose, poseCenter);
    const rightDist = regionSideDistance(lf.landmarks, config.landmarkIndices.right, interOcular, lf.headPose, poseCenter);
    const neutral = activeBaseline.neutralStats[regionId];
    regionDisplacements[regionId] = {
      left: neutral ? leftDist - neutral.left : leftDist,
      right: neutral ? rightDist - neutral.right : rightDist,
    };
  }

  return { regionDisplacements };
}

export const NormalizationLayer = { setBaseline, normalize, clearBaseline };
