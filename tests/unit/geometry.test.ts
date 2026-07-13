import { describe, expect, it } from 'vitest';
import type { LandmarkFrame } from '../../src/sensing/landmarks.ts';
import type { ApprovedFrame } from '../../src/sensing/quality.ts';
import type { AbsoluteFeatures, Vec2 } from '../../src/metrics/geometry.ts';
import type { RegionId } from '../../src/data/schema.ts';

/**
 * Property tests for the face-local geometry kernel (Task B2).
 * Synthetic — prove aspect / scale / roll invariance and sign conventions.
 * Not a V1 fixture kill-gate (needs consented human recordings).
 */

const NUM_LANDMARKS = 478;

/** Canonical MediaPipe mesh indices used by the kernel (anatomical = subject's side). */
const MESH = {
  eyeR: 33, // subject's right eye outer corner
  eyeL: 263, // subject's left eye outer corner
  eyeRInner: 133, // subject's right eye inner corner
  eyeLInner: 362, // subject's left eye inner corner
  browL: 105, // subject's left brow
  browR: 334, // subject's right brow
  lidUpperL: 159,
  lidLowerL: 145,
  lidUpperR: 386,
  lidLowerR: 374,
  mouthL: 291, // subject's left outer mouth corner
  mouthR: 61, // subject's right outer mouth corner
  lipL: 308, // subject's left inner lip corner
  lipR: 78, // subject's right inner lip corner
  noseTip: 1,
} as const;

const REGIONS: readonly RegionId[] = [
  'REGION_BROW',
  'REGION_EYELID',
  'REGION_MOUTH_CORNER',
  'REGION_LIP',
];

type Point = { x: number; y: number; z: number };
type Px = { x: number; y: number };

function identityHeadPose(): number[] {
  // eslint-disable-next-line prettier/prettier
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Rest-pose face in pixel space, centered at (cx, cy). IOD = 160 px when upright. */
function restFacePixels(cx: number, cy: number): Record<number, Px> {
  const halfIod = 80;
  return {
    [MESH.eyeR]: { x: cx - halfIod, y: cy },
    [MESH.eyeL]: { x: cx + halfIod, y: cy },
    [MESH.eyeRInner]: { x: cx - halfIod * 0.35, y: cy },
    [MESH.eyeLInner]: { x: cx + halfIod * 0.35, y: cy },
    // brows slightly above eyes (smaller image-y = forehead)
    [MESH.browR]: { x: cx - halfIod * 0.7, y: cy - 36 },
    [MESH.browL]: { x: cx + halfIod * 0.7, y: cy - 36 },
    // open lids
    [MESH.lidUpperR]: { x: cx - halfIod * 0.7, y: cy - 8 },
    [MESH.lidLowerR]: { x: cx - halfIod * 0.7, y: cy + 8 },
    [MESH.lidUpperL]: { x: cx + halfIod * 0.7, y: cy - 8 },
    [MESH.lidLowerL]: { x: cx + halfIod * 0.7, y: cy + 8 },
    [MESH.noseTip]: { x: cx, y: cy + 50 },
    [MESH.mouthR]: { x: cx - 40, y: cy + 90 },
    [MESH.mouthL]: { x: cx + 40, y: cy + 90 },
    [MESH.lipR]: { x: cx - 18, y: cy + 95 },
    [MESH.lipL]: { x: cx + 18, y: cy + 95 },
  };
}

function pixelsToNormalized(
  pixelMap: Record<number, Px>,
  videoWidth: number,
  videoHeight: number,
): Point[] {
  const pts: Point[] = Array.from({ length: NUM_LANDMARKS }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const [idxStr, p] of Object.entries(pixelMap)) {
    const idx = Number(idxStr);
    pts[idx] = { x: p.x / videoWidth, y: p.y / videoHeight, z: 0 };
  }
  return pts;
}

function makeFrame(landmarks: Point[]): LandmarkFrame {
  return { landmarks, headPose: identityHeadPose(), facePresent: true, timestampMs: 0 };
}

/** Test-only: forge ApprovedFrame without going through QualityMonitor (brand is private). */
function asApproved(lf: LandmarkFrame, videoWidth: number, videoHeight: number): ApprovedFrame {
  return { lf, videoWidth, videoHeight } as unknown as ApprovedFrame;
}

function scalePixelMap(map: Record<number, Px>, center: Px, k: number): Record<number, Px> {
  const out: Record<number, Px> = {};
  for (const [idx, p] of Object.entries(map)) {
    out[Number(idx)] = {
      x: center.x + k * (p.x - center.x),
      y: center.y + k * (p.y - center.y),
    };
  }
  return out;
}

function rotatePixelMap(map: Record<number, Px>, center: Px, degrees: number): Record<number, Px> {
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const out: Record<number, Px> = {};
  for (const [idx, p] of Object.entries(map)) {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    out[Number(idx)] = {
      x: center.x + c * dx - s * dy,
      y: center.y + s * dx + c * dy,
    };
  }
  return out;
}

function expectFeaturesClose(a: AbsoluteFeatures, b: AbsoluteFeatures, absTol: number): void {
  for (const region of REGIONS) {
    for (const side of ['left', 'right'] as const) {
      expect(Math.abs(a[region][side].u - b[region][side].u)).toBeLessThanOrEqual(absTol);
      expect(Math.abs(a[region][side].v - b[region][side].v)).toBeLessThanOrEqual(absTol);
    }
  }
}

function cloneFeatures(f: AbsoluteFeatures): AbsoluteFeatures {
  const out = {} as AbsoluteFeatures;
  for (const region of REGIONS) {
    out[region] = {
      left: { u: f[region].left.u, v: f[region].left.v },
      right: { u: f[region].right.u, v: f[region].right.v },
    };
  }
  return out;
}

function setSide(f: AbsoluteFeatures, region: RegionId, side: 'left' | 'right', vec: Vec2): AbsoluteFeatures {
  const out = cloneFeatures(f);
  out[region][side] = { u: vec.u, v: vec.v };
  return out;
}

describe('geometry kernel — measureAbsolute / aggregateNeutral', () => {
  it('(1) aspect: same physical landmarks at 4:3 vs 16:9 → identical features (1e-6)', async () => {
    const { measureAbsolute } = await import('../../src/metrics/geometry.ts');

    // Same pixel positions, different frame sizes → different normalized coords.
    const physical = restFacePixels(320, 240);
    const w43 = 640;
    const h43 = 480;
    const w169 = 1280;
    const h169 = 720;

    // Place the same physical face at the same pixel offsets from origin in both frames
    // (top-left origin). Use a face that fits both canvases.
    const face = restFacePixels(400, 300);

    const af43 = asApproved(makeFrame(pixelsToNormalized(face, w43, h43)), w43, h43);
    // For 16:9, encode the *same* pixel coordinates into a larger frame's normalized space.
    const af169 = asApproved(makeFrame(pixelsToNormalized(face, w169, h169)), w169, h169);

    const f43 = measureAbsolute(af43);
    const f169 = measureAbsolute(af169);
    expectFeaturesClose(f43, f169, 1e-6);

    // Sanity: physical-only path is not degenerate.
    void physical;
    expect(Number.isFinite(f43.REGION_MOUTH_CORNER.left.u)).toBe(true);
  });

  it('(2) scale: face at 2× size (half distance) → identical features (1e-6)', async () => {
    const { measureAbsolute } = await import('../../src/metrics/geometry.ts');
    const W = 640;
    const H = 480;
    const center = { x: 320, y: 240 };
    const rest = restFacePixels(center.x, center.y);
    const scaled = scalePixelMap(rest, center, 2);

    const fRest = measureAbsolute(asApproved(makeFrame(pixelsToNormalized(rest, W, H)), W, H));
    const fScaled = measureAbsolute(asApproved(makeFrame(pixelsToNormalized(scaled, W, H)), W, H));
    expectFeaturesClose(fRest, fScaled, 1e-6);
  });

  it('(3) roll: 15° in-plane rotation → features within 1e-3', async () => {
    const { measureAbsolute } = await import('../../src/metrics/geometry.ts');
    const W = 640;
    const H = 480;
    const center = { x: 320, y: 240 };
    const rest = restFacePixels(center.x, center.y);
    const rolled = rotatePixelMap(rest, center, 15);

    const fRest = measureAbsolute(asApproved(makeFrame(pixelsToNormalized(rest, W, H)), W, H));
    const fRoll = measureAbsolute(asApproved(makeFrame(pixelsToNormalized(rolled, W, H)), W, H));
    expectFeaturesClose(fRest, fRoll, 1e-3);
  });

  it('(4a) sign: synthetic brow raise → +v on both sides', async () => {
    const { measureAbsolute } = await import('../../src/metrics/geometry.ts');
    const W = 640;
    const H = 480;
    const center = { x: 320, y: 240 };
    const rest = restFacePixels(center.x, center.y);
    const raised = { ...rest, [MESH.browL]: { x: rest[MESH.browL]!.x, y: rest[MESH.browL]!.y - 20 }, [MESH.browR]: { x: rest[MESH.browR]!.x, y: rest[MESH.browR]!.y - 20 } };

    const fRest = measureAbsolute(asApproved(makeFrame(pixelsToNormalized(rest, W, H)), W, H));
    const fRaised = measureAbsolute(asApproved(makeFrame(pixelsToNormalized(raised, W, H)), W, H));

    expect(fRaised.REGION_BROW.left.v).toBeGreaterThan(fRest.REGION_BROW.left.v);
    expect(fRaised.REGION_BROW.right.v).toBeGreaterThan(fRest.REGION_BROW.right.v);
  });

  it('(4b) sign: synthetic smile → mouth-corner u moves outward on each side', async () => {
    const { measureAbsolute } = await import('../../src/metrics/geometry.ts');
    const W = 640;
    const H = 480;
    const center = { x: 320, y: 240 };
    const rest = restFacePixels(center.x, center.y);
    // Outward: left corner further anatomical left (+image x), right further anatomical right (−image x).
    const smile = {
      ...rest,
      [MESH.mouthL]: { x: rest[MESH.mouthL]!.x + 25, y: rest[MESH.mouthL]!.y },
      [MESH.mouthR]: { x: rest[MESH.mouthR]!.x - 25, y: rest[MESH.mouthR]!.y },
    };

    const fRest = measureAbsolute(asApproved(makeFrame(pixelsToNormalized(rest, W, H)), W, H));
    const fSmile = measureAbsolute(asApproved(makeFrame(pixelsToNormalized(smile, W, H)), W, H));

    // +u = subject's anatomical left → left corner u increases; right corner u decreases (more −u).
    expect(fSmile.REGION_MOUTH_CORNER.left.u).toBeGreaterThan(fRest.REGION_MOUTH_CORNER.left.u);
    expect(fSmile.REGION_MOUTH_CORNER.right.u).toBeLessThan(fRest.REGION_MOUTH_CORNER.right.u);
  });

  it('(5) aggregateNeutral: component-wise median', async () => {
    const { measureAbsolute, aggregateNeutral } = await import('../../src/metrics/geometry.ts');
    const W = 640;
    const H = 480;
    const center = { x: 320, y: 240 };
    const rest = restFacePixels(center.x, center.y);
    const base = measureAbsolute(asApproved(makeFrame(pixelsToNormalized(rest, W, H)), W, H));

    // Three samples that differ only on REGION_BROW.left.v: 0.1, 0.5, 0.9 → median 0.5
    const s1 = setSide(base, 'REGION_BROW', 'left', { u: base.REGION_BROW.left.u, v: 0.1 });
    const s2 = setSide(base, 'REGION_BROW', 'left', { u: base.REGION_BROW.left.u, v: 0.9 });
    const s3 = setSide(base, 'REGION_BROW', 'left', { u: base.REGION_BROW.left.u, v: 0.5 });

    // And REGION_MOUTH_CORNER.right.u: −0.2, 0.0, 0.4 → median 0.0
    const t1 = setSide(s1, 'REGION_MOUTH_CORNER', 'right', { u: -0.2, v: base.REGION_MOUTH_CORNER.right.v });
    const t2 = setSide(s2, 'REGION_MOUTH_CORNER', 'right', { u: 0.4, v: base.REGION_MOUTH_CORNER.right.v });
    const t3 = setSide(s3, 'REGION_MOUTH_CORNER', 'right', { u: 0.0, v: base.REGION_MOUTH_CORNER.right.v });

    const med = aggregateNeutral([t1, t2, t3]);
    expect(med.REGION_BROW.left.v).toBeCloseTo(0.5, 10);
    expect(med.REGION_MOUTH_CORNER.right.u).toBeCloseTo(0.0, 10);

    // Unmodified components should equal the base (all three samples share them).
    expect(med.REGION_EYELID.left.u).toBeCloseTo(base.REGION_EYELID.left.u, 10);
    expect(med.REGION_EYELID.left.v).toBeCloseTo(base.REGION_EYELID.left.v, 10);
    expect(med.REGION_LIP.right.u).toBeCloseTo(base.REGION_LIP.right.u, 10);
  });
});
