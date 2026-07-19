// src/metrics/geometry.ts — face-local 2D vector geometry kernel (ARCHITECTURE §7).
// Baseline-free measurement: measureAbsolute accepts only ApprovedFrame (type barrier).
// Exact mesh indices recorded below against the canonical MediaPipe 468-point face-mesh map
// (FaceLandmarker 478-point output shares this base; 468–477 are iris-only and unused).

import type { RegionId } from '../data/schema.ts';
import type { ApprovedFrame } from '../sensing/quality.ts';

export type Vec2 = { u: number; v: number };
export type AbsoluteFeatures = Record<RegionId, { left: Vec2; right: Vec2 }>;
export type NeutralStats = AbsoluteFeatures;

// ---------------------------------------------------------------------------
// Canonical MediaPipe face-mesh indices (anatomical = subject's side).
// Verified against the standard 468-point topology used by Face Mesh / FaceLandmarker.
// ---------------------------------------------------------------------------

/** Subject's right eye outer corner — MediaPipe mesh point 33. */
const EYE_R_OUTER = 33;
/** Subject's left eye outer corner — MediaPipe mesh point 263. */
const EYE_L_OUTER = 263;
/** Subject's right eye inner corner — MediaPipe mesh point 133. */
const EYE_R_INNER = 133;
/** Subject's left eye inner corner — MediaPipe mesh point 362. */
const EYE_L_INNER = 362;

/** Subject's left brow (upper brow ridge) — MediaPipe mesh point 334 (FACEMESH_LEFT_EYEBROW). */
const BROW_L = 334;
/** Subject's right brow (upper brow ridge) — MediaPipe mesh point 105 (FACEMESH_RIGHT_EYEBROW). */
const BROW_R = 105;

/** Subject's left upper eyelid — MediaPipe mesh point 386 (FACEMESH_LEFT_EYE). */
const LID_UPPER_L = 386;
/** Subject's left lower eyelid — MediaPipe mesh point 374 (FACEMESH_LEFT_EYE). */
const LID_LOWER_L = 374;
/** Subject's right upper eyelid — MediaPipe mesh point 159 (FACEMESH_RIGHT_EYE). */
const LID_UPPER_R = 159;
/** Subject's right lower eyelid — MediaPipe mesh point 145 (FACEMESH_RIGHT_EYE). */
const LID_LOWER_R = 145;

/** Subject's left outer mouth corner — MediaPipe mesh point 291. */
const MOUTH_L = 291;
/** Subject's right outer mouth corner — MediaPipe mesh point 61. */
const MOUTH_R = 61;

/** Subject's left inner lip corner — MediaPipe mesh point 308. */
const LIP_L = 308;
/** Subject's right inner lip corner — MediaPipe mesh point 78. */
const LIP_R = 78;

const REGION_IDS: readonly RegionId[] = [
  'REGION_BROW',
  'REGION_EYELID',
  'REGION_MOUTH_CORNER',
  'REGION_LIP',
];

type Px = { x: number; y: number };

function toPx(landmark: { x: number; y: number }, W: number, H: number): Px {
  return { x: landmark.x * W, y: landmark.y * H };
}

function midpoint(a: Px, b: Px): Px {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Project (P_moving − P_anchor) into the face-local (û, v̂) frame, in IOD units.
 * f = ((P_moving − P_anchor) · (û, v̂)) / IOD
 */
function feature(
  moving: Px,
  anchor: Px,
  uHat: Px,
  vHat: Px,
  iod: number,
): Vec2 {
  const dx = moving.x - anchor.x;
  const dy = moving.y - anchor.y;
  return {
    u: (dx * uHat.x + dy * uHat.y) / iod,
    v: (dx * vHat.x + dy * vHat.y) / iod,
  };
}

/**
 * Baseline-free face-local vector features per region/side (ARCHITECTURE §7).
 *
 * Pixel space: P = (x·W, y·H). Z excluded in v1.
 * Face frame: eyeR=33, eyeL=263; û = (eyeL−eyeR)/IOD (+u = anatomical left);
 * v̂ = û rotated 90° so +v points toward forehead (decreasing image-y when upright).
 */
export function measureAbsolute(af: ApprovedFrame): AbsoluteFeatures {
  const W = af.videoWidth;
  const H = af.videoHeight;
  const lm = af.lf.landmarks;

  const eyeR = toPx(lm[EYE_R_OUTER]!, W, H);
  const eyeL = toPx(lm[EYE_L_OUTER]!, W, H);

  const iod = Math.hypot(eyeL.x - eyeR.x, eyeL.y - eyeR.y) || 1;
  // +u = subject's anatomical left
  const uHat: Px = { x: (eyeL.x - eyeR.x) / iod, y: (eyeL.y - eyeR.y) / iod };
  // Rotate û by 90°: candidates (−û.y, û.x) and (û.y, −û.x).
  // For upright face û≈(1,0), (û.y, −û.x)=(0,−1) points toward decreasing image-y (forehead).
  // Brow-raise property test fixes this sign: raising brows must increase +v.
  const vHat: Px = { x: uHat.y, y: -uHat.x };

  // Same-side eye centers = midpoint of outer + inner corners (no iris dependency).
  // Left eye center: mid(263 outer, 362 inner); right: mid(33 outer, 133 inner).
  const eyeCenterL = midpoint(eyeL, toPx(lm[EYE_L_INNER]!, W, H));
  const eyeCenterR = midpoint(eyeR, toPx(lm[EYE_R_INNER]!, W, H));

  // REGION_BROW: movers brow 334 (L) / 105 (R); anchors same-side eye centers.
  const browL = feature(toPx(lm[BROW_L]!, W, H), eyeCenterL, uHat, vHat, iod);
  const browR = feature(toPx(lm[BROW_R]!, W, H), eyeCenterR, uHat, vHat, iod);

  // REGION_EYELID: aperture gap vector (upper − lower) in face frame (IOD units).
  // Left: upper 386 / lower 374; right: upper 159 / lower 145.
  const lidL = feature(
    toPx(lm[LID_UPPER_L]!, W, H),
    toPx(lm[LID_LOWER_L]!, W, H),
    uHat,
    vHat,
    iod,
  );
  const lidR = feature(
    toPx(lm[LID_UPPER_R]!, W, H),
    toPx(lm[LID_LOWER_R]!, W, H),
    uHat,
    vHat,
    iod,
  );

  // REGION_MOUTH_CORNER: movers 291 (L) / 61 (R); anchors same-side eye centers
  // (candidate face-local-vector-v2). The nose tip sits off the face plane, so under
  // yaw its projection shifts by ~depth·sin(yaw) — a common-mode u error that collapsed
  // SI to 0 at 10° yaw (V1 B3 rejection of face-local-vector-v1). Eye centers are
  // planar and expression-static, so the depth term vanishes to first order.
  const mouthL = feature(toPx(lm[MOUTH_L]!, W, H), eyeCenterL, uHat, vHat, iod);
  const mouthR = feature(toPx(lm[MOUTH_R]!, W, H), eyeCenterR, uHat, vHat, iod);

  // REGION_LIP: inner lip corners 308 (L) / 78 (R); anchors same-side eye centers (v2).
  const lipL = feature(toPx(lm[LIP_L]!, W, H), eyeCenterL, uHat, vHat, iod);
  const lipR = feature(toPx(lm[LIP_R]!, W, H), eyeCenterR, uHat, vHat, iod);

  return {
    REGION_BROW: { left: browL, right: browR },
    REGION_EYELID: { left: lidL, right: lidR },
    REGION_MOUTH_CORNER: { left: mouthL, right: mouthR },
    REGION_LIP: { left: lipL, right: lipR },
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Component-wise median over AbsoluteFeatures samples → NeutralStats. */
export function aggregateNeutral(samples: AbsoluteFeatures[]): NeutralStats {
  const out = {} as NeutralStats;
  for (const region of REGION_IDS) {
    out[region] = {
      left: {
        u: median(samples.map((s) => s[region].left.u)),
        v: median(samples.map((s) => s[region].left.v)),
      },
      right: {
        u: median(samples.map((s) => s[region].right.u)),
        v: median(samples.map((s) => s[region].right.v)),
      },
    };
  }
  return out;
}
