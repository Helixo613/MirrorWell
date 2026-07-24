// src/sensing/quality.ts, emits exactly one QualityResult per frame; the fail-safe core
// (docs/BACKEND.md §1.3). Contracts: docs/API.md §6.
//
// STRUCTURAL RULE: ApprovedFrame is constructible ONLY inside this module (private brand
// symbol). Metric code (normalize / geometry) accepts ApprovedFrame only; a raw
// LandmarkFrame is a compile error. Non-OK results are state-only objects with no `frame`
// key, so callers cannot reach normalize without a QUALITY_OK branch.
import type { LandmarkFrame } from './landmarks.ts';
import { thresholds } from '../config/thresholds.ts';

export type QualityState = 'QUALITY_OK' | 'LOW_LIGHT' | 'FACE_LOST' | 'TOO_FAR' | 'POSE_OUT_OF_RANGE' | 'LOW_CONFIDENCE';

// Brand is module-private; not exported. Outside this file, ApprovedFrame is only obtainable
// via evaluate() returning QUALITY_OK. Runtime Symbol so approve() can set the key; const
// Symbol() is a unique typeof that makes the brand unforgeable at compile time.
const approvedBrand = Symbol('ApprovedFrame');

export type ApprovedFrame = {
  readonly [approvedBrand]: true;
  readonly lf: LandmarkFrame;
  readonly videoWidth: number;
  readonly videoHeight: number;
};

export type QualityResult =
  | { state: 'QUALITY_OK'; frame: ApprovedFrame }
  | { state: Exclude<QualityState, 'QUALITY_OK'> };

function approve(lf: LandmarkFrame, videoWidth: number, videoHeight: number): ApprovedFrame {
  return { [approvedBrand]: true, lf, videoWidth, videoHeight };
}

// Standard MediaPipe canonical face-mesh eye-outer-corner indices (468-point topology shared
// by FaceMesh and FaceLandmarker). PLACEHOLDER pending docs/IMPLEMENTATION.md Task 6 ("Fixtures
// + landmark indices") fixture validation, same treatment as src/config/exercises.ts's region
// indices. Task 5's deliverable is the gate STRUCTURE/ORDER; exact indices are swappable later
// without changing it.
// Anatomical = subject's side: 33 = subject's RIGHT eye outer corner, 263 = subject's LEFT
// (same convention as src/metrics/geometry.ts). IOD is symmetric so only the labels matter.
const EYE_R_OUTER_CORNER = 33;
const EYE_L_OUTER_CORNER = 263;

// Landmark bbox expansion fraction (10% of width/height) for face-region luma, BACKEND §1.3.
const FACE_BBOX_MARGIN = 0.1;
const LUMA_DOWNSAMPLE = 64;

// One reusable downsample surface for the luma gate. evaluate() runs per frame (~30 Hz);
// allocating a fresh <canvas> per frame churned the GC for no benefit. willReadFrequently
// keeps the canvas on a CPU-readable path since every draw is followed by getImageData.
let lumaCanvas: HTMLCanvasElement | null = null;
let lumaCtx: CanvasRenderingContext2D | null = null;

function getLumaContext(): CanvasRenderingContext2D | null {
  if (lumaCtx) return lumaCtx;
  lumaCanvas = document.createElement('canvas');
  lumaCanvas.width = LUMA_DOWNSAMPLE;
  lumaCanvas.height = LUMA_DOWNSAMPLE;
  lumaCtx = lumaCanvas.getContext('2d', { willReadFrequently: true });
  return lumaCtx;
}

// Jitter history: last two landmark frames in pixel-comparable normalized form for the
// second-difference estimator. Assumption (BACKEND §1.3): frame intervals are approximately
// uniform, second difference is computed per sample without Δt scaling.
let prevLandmarks: LandmarkFrame['landmarks'] | null = null;
let prevPrevLandmarks: LandmarkFrame['landmarks'] | null = null;
let jitterHistory: number[] = [];
// Reuses thresholds.metrics.smoothingWindow rather than introducing a new tunable outside the
// documented qualityGates shape (docs/API.md §15 fixes qualityGates to exactly four fields).
const JITTER_WINDOW = thresholds.metrics.smoothingWindow;

function resetJitterState(): void {
  prevLandmarks = null;
  prevPrevLandmarks = null;
  jitterHistory = [];
}

/**
 * Mean luma over the face bounding box only (landmark AABB + 10% margin), sampled from a
 * 64×64 downsample of the full video. Avoids bright backgrounds masking a dark face (and
 * vice versa). Empty mapped region → fail open (255). Face must already be present (gate
 * order: FACE_LOST before LOW_LIGHT); a face too dark to detect yields FACE_LOST, not
 * LOW_LIGHT (intended, BACKEND §1.3).
 */
function faceRegionLuma64(video: HTMLVideoElement, landmarks: LandmarkFrame['landmarks']): number {
  const ctx = getLumaContext();
  if (!ctx) return 255; // no canvas context: fail open on this gate, other gates still apply
  ctx.drawImage(video, 0, 0, LUMA_DOWNSAMPLE, LUMA_DOWNSAMPLE);
  const { data } = ctx.getImageData(0, 0, LUMA_DOWNSAMPLE, LUMA_DOWNSAMPLE);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return 255;

  const bw = maxX - minX;
  const bh = maxY - minY;
  const padX = bw * FACE_BBOX_MARGIN;
  const padY = bh * FACE_BBOX_MARGIN;
  minX = Math.max(0, minX - padX);
  maxX = Math.min(1, maxX + padX);
  minY = Math.max(0, minY - padY);
  maxY = Math.min(1, maxY + padY);

  let x0 = Math.floor(minX * LUMA_DOWNSAMPLE);
  let x1 = Math.ceil(maxX * LUMA_DOWNSAMPLE);
  let y0 = Math.floor(minY * LUMA_DOWNSAMPLE);
  let y1 = Math.ceil(maxY * LUMA_DOWNSAMPLE);
  // Degenerate (zero-area) bbox → ensure at least one pixel so a collinear landmark set still
  // samples something rather than silently fail-open past LOW_LIGHT.
  if (x1 <= x0) {
    x0 = Math.max(0, Math.min(LUMA_DOWNSAMPLE - 1, x0));
    x1 = x0 + 1;
  }
  if (y1 <= y0) {
    y0 = Math.max(0, Math.min(LUMA_DOWNSAMPLE - 1, y0));
    y1 = y0 + 1;
  }
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(LUMA_DOWNSAMPLE, x1);
  y1 = Math.min(LUMA_DOWNSAMPLE, y1);
  if (x0 >= x1 || y0 >= y1) return 255;

  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * LUMA_DOWNSAMPLE + x) * 4;
      sum += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
      count++;
    }
  }
  return count === 0 ? 255 : sum / count;
}

function interOcularDistancePx(landmarks: LandmarkFrame['landmarks'], videoWidth: number, videoHeight: number): number {
  const left = landmarks[EYE_L_OUTER_CORNER];
  const right = landmarks[EYE_R_OUTER_CORNER];
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
// empirically at the Task 6 V1 kill-gate (B3: pose invariance against real fixtures); this is
// a reasonable, internally-consistent implementation, not yet camera-verified.
function extractEulerAnglesDeg(headPose: number[]): { yaw: number; pitch: number; roll: number } {
  const r = (row: number, col: number) => headPose[row * 4 + col] ?? 0;
  const pitch = Math.atan2(r(2, 1), r(2, 2));
  const yaw = Math.atan2(-r(2, 0), Math.sqrt(r(2, 1) ** 2 + r(2, 2) ** 2));
  const roll = Math.atan2(r(1, 0), r(0, 0));
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  return { yaw: toDeg(yaw), pitch: toDeg(pitch), roll: toDeg(roll) };
}

/**
 * RMS second difference of landmarks / IOD (motion-compensated jitter).
 * For each landmark: |p_t − 2 p_{t−1} + p_{t−2}| in pixels, then RMS over landmarks, / IOD.
 * Constant-velocity intentional motion → second difference ≈ 0 → passes.
 * Oscillating tracking noise → high second difference → LOW_CONFIDENCE.
 * Needs 3 frames; first two samples return 0. Rolling mean over smoothingWindow for stability.
 * Assumes approximately uniform frame intervals (no Δt scaling), BACKEND §1.3.
 */
function rollingJitterSecondDiff(
  landmarks: LandmarkFrame['landmarks'],
  interOcularPx: number,
  videoWidth: number,
  videoHeight: number,
): number {
  if (!prevLandmarks || !prevPrevLandmarks || prevLandmarks.length !== landmarks.length || interOcularPx === 0) {
    prevPrevLandmarks = prevLandmarks;
    prevLandmarks = landmarks;
    if (!prevPrevLandmarks) jitterHistory = [];
    return 0;
  }

  let sumSq = 0;
  for (let i = 0; i < landmarks.length; i++) {
    const ax = (landmarks[i]!.x - 2 * prevLandmarks[i]!.x + prevPrevLandmarks[i]!.x) * videoWidth;
    const ay = (landmarks[i]!.y - 2 * prevLandmarks[i]!.y + prevPrevLandmarks[i]!.y) * videoHeight;
    sumSq += ax * ax + ay * ay;
  }
  const rmsPx = Math.sqrt(sumSq / landmarks.length);
  const displacementPct = rmsPx / interOcularPx;

  prevPrevLandmarks = prevLandmarks;
  prevLandmarks = landmarks;

  jitterHistory.push(displacementPct);
  if (jitterHistory.length > JITTER_WINDOW) jitterHistory.shift();
  return jitterHistory.reduce((a, b) => a + b, 0) / jitterHistory.length;
}

function evaluate(video: HTMLVideoElement, lf: LandmarkFrame | null): QualityResult {
  // Gate order (first failure wins), docs/BACKEND.md §1.3.
  // FACE_LOST before LOW_LIGHT: a face too dark to detect cannot yield face-region luma →
  // FACE_LOST is honest (message still prompts lighting/position adjustment).
  if (!lf || !lf.facePresent) {
    resetJitterState();
    return { state: 'FACE_LOST' };
  }

  const luma = faceRegionLuma64(video, lf.landmarks);
  if (luma < thresholds.qualityGates.lumaMin) {
    resetJitterState();
    return { state: 'LOW_LIGHT' };
  }

  const videoWidth = video.videoWidth || 640;
  const videoHeight = video.videoHeight || 480;
  const interOcular = interOcularDistancePx(lf.landmarks, videoWidth, videoHeight);
  if (interOcular < thresholds.qualityGates.interOcularMinFrac * videoWidth) {
    resetJitterState();
    return { state: 'TOO_FAR' };
  }

  const { yaw, pitch, roll } = extractEulerAnglesDeg(lf.headPose);
  const poseMax = thresholds.qualityGates.poseMaxDeg;
  if (Math.abs(yaw) > poseMax || Math.abs(pitch) > poseMax || Math.abs(roll) > poseMax) {
    resetJitterState();
    return { state: 'POSE_OUT_OF_RANGE' };
  }

  const jitter = rollingJitterSecondDiff(lf.landmarks, interOcular, videoWidth, videoHeight);
  if (jitter > thresholds.qualityGates.jitterMaxPct) {
    return { state: 'LOW_CONFIDENCE' };
  }

  return { state: 'QUALITY_OK', frame: approve(lf, videoWidth, videoHeight) };
}

export const QualityMonitor = { evaluate };
