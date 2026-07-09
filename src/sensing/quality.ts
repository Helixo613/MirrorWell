// src/sensing/quality.ts — emits exactly one QualityState per frame; the fail-safe core
// (docs/BACKEND.md §1.3). Contracts: docs/API.md §6.
//
// STRUCTURAL RULE: evaluate() returns only an enum classification — never landmarks, never a
// raw score, no pass-through of frame data. That is what makes "QualityMonitor is the only
// caller of NormalizationLayer.normalize" enforceable once Task 6 adds NormalizationLayer:
// there is no side channel here a future caller could use to reach normalize() without first
// checking this return value.
import type { LandmarkFrame } from './landmarks.ts';
import { thresholds } from '../config/thresholds.ts';

export type QualityState = 'QUALITY_OK' | 'LOW_LIGHT' | 'FACE_LOST' | 'TOO_FAR' | 'POSE_OUT_OF_RANGE' | 'LOW_CONFIDENCE';

// Standard MediaPipe canonical face-mesh eye-outer-corner indices (468-point topology shared
// by FaceMesh and FaceLandmarker). PLACEHOLDER pending docs/IMPLEMENTATION.md Task 6 ("Fixtures
// + landmark indices") fixture validation — same treatment as src/config/exercises.ts's region
// indices. Task 5's deliverable is the gate STRUCTURE/ORDER; exact indices are swappable later
// without changing it.
const LEFT_EYE_OUTER_CORNER = 33;
const RIGHT_EYE_OUTER_CORNER = 263;

let previousLandmarks: LandmarkFrame['landmarks'] | null = null;
let jitterHistory: number[] = [];
// Reuses thresholds.metrics.smoothingWindow rather than introducing a new tunable outside the
// documented qualityGates shape (docs/API.md §15 fixes qualityGates to exactly four fields).
const JITTER_WINDOW = thresholds.metrics.smoothingWindow;

function resetJitterState(): void {
  previousLandmarks = null;
  jitterHistory = [];
}

function meanLuma64(video: HTMLVideoElement): number {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 255; // no canvas context: fail open on this gate, other gates still apply
  ctx.drawImage(video, 0, 0, 64, 64);
  const { data } = ctx.getImageData(0, 0, 64, 64);
  let sum = 0;
  const pixelCount = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  }
  return sum / pixelCount;
}

function interOcularDistancePx(landmarks: LandmarkFrame['landmarks'], videoWidth: number, videoHeight: number): number {
  const left = landmarks[LEFT_EYE_OUTER_CORNER];
  const right = landmarks[RIGHT_EYE_OUTER_CORNER];
  if (!left || !right) return 0;
  const dx = (left.x - right.x) * videoWidth;
  const dy = (left.y - right.y) * videoHeight;
  return Math.sqrt(dx * dx + dy * dy);
}

// Standard ZYX Tait-Bryan extraction from a row-major 4x4 rotation matrix. Only the
// |yaw|/|pitch|/|roll| MAGNITUDES matter for POSE_OUT_OF_RANGE (sign-independent), so the
// exact handedness/axis-order convention MediaPipe's facialTransformationMatrixes uses does
// not affect gate correctness, as long as an identity matrix yields all-zero angles (verified
// in tests/unit/quality.test.ts). True alignment with MediaPipe's real convention is validated
// empirically at the Task 6 V1 kill-gate (B3: pose invariance against real fixtures) — this is
// a reasonable, internally-consistent implementation, not yet camera-verified.
function extractEulerAnglesDeg(headPose: number[]): { yaw: number; pitch: number; roll: number } {
  const r = (row: number, col: number) => headPose[row * 4 + col] ?? 0;
  const pitch = Math.atan2(r(2, 1), r(2, 2));
  const yaw = Math.atan2(-r(2, 0), Math.sqrt(r(2, 1) ** 2 + r(2, 2) ** 2));
  const roll = Math.atan2(r(1, 0), r(0, 0));
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  return { yaw: toDeg(yaw), pitch: toDeg(pitch), roll: toDeg(roll) };
}

function rollingJitterPct(landmarks: LandmarkFrame['landmarks'], interOcularPx: number, videoWidth: number, videoHeight: number): number {
  if (!previousLandmarks || previousLandmarks.length !== landmarks.length || interOcularPx === 0) {
    previousLandmarks = landmarks;
    jitterHistory = [];
    return 0;
  }

  let sumSqPx = 0;
  for (let i = 0; i < landmarks.length; i++) {
    const dx = (landmarks[i]!.x - previousLandmarks[i]!.x) * videoWidth;
    const dy = (landmarks[i]!.y - previousLandmarks[i]!.y) * videoHeight;
    sumSqPx += dx * dx + dy * dy;
  }
  const rmsDisplacementPx = Math.sqrt(sumSqPx / landmarks.length);
  previousLandmarks = landmarks;

  const displacementPct = rmsDisplacementPx / interOcularPx;
  jitterHistory.push(displacementPct);
  if (jitterHistory.length > JITTER_WINDOW) jitterHistory.shift();
  return jitterHistory.reduce((a, b) => a + b, 0) / jitterHistory.length;
}

function evaluate(video: HTMLVideoElement, lf: LandmarkFrame | null): QualityState {
  // Gate order (first failure wins) — docs/BACKEND.md §1.3.
  if (!lf || !lf.facePresent) {
    resetJitterState();
    return 'FACE_LOST';
  }

  const luma = meanLuma64(video);
  if (luma < thresholds.qualityGates.lumaMin) {
    resetJitterState();
    return 'LOW_LIGHT';
  }

  const videoWidth = video.videoWidth || 640;
  const videoHeight = video.videoHeight || 480;
  const interOcular = interOcularDistancePx(lf.landmarks, videoWidth, videoHeight);
  if (interOcular < thresholds.qualityGates.interOcularMinPx) {
    resetJitterState();
    return 'TOO_FAR';
  }

  const { yaw, pitch, roll } = extractEulerAnglesDeg(lf.headPose);
  const poseMax = thresholds.qualityGates.poseMaxDeg;
  if (Math.abs(yaw) > poseMax || Math.abs(pitch) > poseMax || Math.abs(roll) > poseMax) {
    resetJitterState();
    return 'POSE_OUT_OF_RANGE';
  }

  const jitter = rollingJitterPct(lf.landmarks, interOcular, videoWidth, videoHeight);
  if (jitter > thresholds.qualityGates.jitterMaxPct) {
    return 'LOW_CONFIDENCE';
  }

  return 'QUALITY_OK';
}

export const QualityMonitor = { evaluate };
