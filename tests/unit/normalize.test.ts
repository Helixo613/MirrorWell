import { describe, expect, it } from 'vitest';
import type { LandmarkFrame } from '../../src/sensing/landmarks.ts';
import type { ApprovedFrame } from '../../src/sensing/quality.ts';
import type { CalibrationBaseline, RegionId } from '../../src/data/schema.ts';
import { measureAbsolute } from '../../src/metrics/geometry.ts';

/**
 * NormalizationLayer unit tests (Task B3): baseline subtraction of the geometry kernel.
 * Kernel property tests (aspect / scale / roll / brow-raise sign) live in geometry.test.ts.
 * V1 kill-gate needs real consented human-face fixtures (docs/MODEL_AND_DATA.md §4).
 */

const NUM_LANDMARKS = 478;

/** Canonical MediaPipe mesh indices used by the kernel (anatomical = subject's side). */
const MESH = {
  eyeR: 33,
  eyeL: 263,
  eyeRInner: 133,
  eyeLInner: 362,
  browL: 105,
  browR: 334,
  lidUpperL: 159,
  lidLowerL: 145,
  lidUpperR: 386,
  lidLowerR: 374,
  mouthL: 291,
  mouthR: 61,
  lipL: 308,
  lipR: 78,
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

/** Rest-pose face in pixel space. IOD = 160 px when upright. */
function restFacePixels(cx: number, cy: number): Record<number, Px> {
  const halfIod = 80;
  return {
    [MESH.eyeR]: { x: cx - halfIod, y: cy },
    [MESH.eyeL]: { x: cx + halfIod, y: cy },
    [MESH.eyeRInner]: { x: cx - halfIod * 0.35, y: cy },
    [MESH.eyeLInner]: { x: cx + halfIod * 0.35, y: cy },
    [MESH.browR]: { x: cx - halfIod * 0.7, y: cy - 36 },
    [MESH.browL]: { x: cx + halfIod * 0.7, y: cy - 36 },
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

function makeFrame(landmarks: Point[], timestampMs = 0): LandmarkFrame {
  return { landmarks, headPose: identityHeadPose(), facePresent: true, blendshapes: {}, timestampMs };
}

/** Test-only: forge ApprovedFrame without going through QualityMonitor (brand is private). */
function asApproved(lf: LandmarkFrame, videoWidth = 640, videoHeight = 480): ApprovedFrame {
  return { lf, videoWidth, videoHeight } as unknown as ApprovedFrame;
}

function vectorBaseline(overrides: Partial<CalibrationBaseline> = {}): CalibrationBaseline {
  return {
    baselineId: 'b1',
    profileId: 'p1',
    capturedAt: '2026-01-01T00:00:00.000Z',
    neutralStats: {
      REGION_BROW: { left: { u: 0.01, v: 0.2 }, right: { u: -0.01, v: 0.2 } },
      REGION_EYELID: { left: { u: 0.0, v: 0.1 }, right: { u: 0.0, v: 0.1 } },
      REGION_MOUTH_CORNER: { left: { u: 0.25, v: -0.3 }, right: { u: -0.25, v: -0.3 } },
      REGION_LIP: { left: { u: 0.1, v: -0.28 }, right: { u: -0.1, v: -0.28 } },
    },
    comfortableMax: {},
    qualityScore: 0.9,
    noiseFloorSymmetry: 0.04,
    noiseFloorDisplacement: 0.008,
    isActive: 1,
    ...overrides,
  };
}

describe('NormalizationLayer — NO_BASELINE', () => {
  it('normalize() passes LandmarkFrame.blendshapes through to NormalizedFrame ({} when absent)', async () => {
    const { NormalizationLayer } = await import('../../src/metrics/normalize.ts');
    NormalizationLayer.setBaseline(vectorBaseline());
    const lf = makeFrame(pixelsToNormalized(restFacePixels(320, 240), 640, 480));
    (lf as { blendshapes?: Record<string, number> }).blendshapes = { mouthSmileLeft: 0.4 };
    const nf = NormalizationLayer.normalize(asApproved(lf));
    expect(nf.blendshapes).toEqual({ mouthSmileLeft: 0.4 });

    const bare = makeFrame(pixelsToNormalized(restFacePixels(320, 240), 640, 480));
    delete (bare as { blendshapes?: unknown }).blendshapes;
    expect(NormalizationLayer.normalize(asApproved(bare)).blendshapes).toEqual({});
  });

  it('normalize() throws NO_BASELINE without setBaseline()', async () => {
    const { NormalizationLayer } = await import('../../src/metrics/normalize.ts');
    NormalizationLayer.clearBaseline();
    const af = asApproved(makeFrame(pixelsToNormalized(restFacePixels(320, 240), 640, 480)));
    expect(() => NormalizationLayer.normalize(af)).toThrow(
      expect.objectContaining({ code: 'NO_BASELINE' }),
    );
  });

  it('setBaseline() throws NO_BASELINE on an invalid baseline', async () => {
    const { NormalizationLayer } = await import('../../src/metrics/normalize.ts');
    expect(() => NormalizationLayer.setBaseline({} as CalibrationBaseline)).toThrow(
      expect.objectContaining({ code: 'NO_BASELINE' }),
    );
  });

  it('normalize() throws NO_BASELINE again after clearBaseline()', async () => {
    const { NormalizationLayer } = await import('../../src/metrics/normalize.ts');
    NormalizationLayer.setBaseline(vectorBaseline());
    NormalizationLayer.clearBaseline();
    const af = asApproved(makeFrame(pixelsToNormalized(restFacePixels(320, 240), 640, 480)));
    expect(() => NormalizationLayer.normalize(af)).toThrow(
      expect.objectContaining({ code: 'NO_BASELINE' }),
    );
  });

  it('setBaseline() / normalize() throws NO_BASELINE when a region is missing from neutralStats', async () => {
    const { NormalizationLayer } = await import('../../src/metrics/normalize.ts');
    const incomplete = vectorBaseline();
    // Drop REGION_LIP entirely (missing region must not fall back to raw distances).
    delete (incomplete.neutralStats as Partial<CalibrationBaseline['neutralStats']>).REGION_LIP;

    expect(() => NormalizationLayer.setBaseline(incomplete)).toThrow(
      expect.objectContaining({ code: 'NO_BASELINE' }),
    );

    // Even if a caller bypasses setBaseline validation by patching state, normalize must throw.
    // Force-set via a complete baseline then overwrite the active baseline's stats is not
    // possible through the public API; setBaseline rejection is the enforceable gate.
  });
});

describe('NormalizationLayer — kernel minus baseline', () => {
  it('displacements equal measureAbsolute(af) − neutralStats component-wise (exact)', async () => {
    const { NormalizationLayer } = await import('../../src/metrics/normalize.ts');
    const W = 640;
    const H = 480;
    const af = asApproved(makeFrame(pixelsToNormalized(restFacePixels(320, 240), W, H)), W, H);
    const abs = measureAbsolute(af);

    // Known baseline with non-zero neutral — displacements must be exact subtraction.
    const baseline = vectorBaseline({
      neutralStats: {
        REGION_BROW: { left: { u: 0.02, v: 0.05 }, right: { u: -0.02, v: 0.05 } },
        REGION_EYELID: { left: { u: 0.0, v: 0.01 }, right: { u: 0.0, v: 0.01 } },
        REGION_MOUTH_CORNER: { left: { u: 0.1, v: -0.05 }, right: { u: -0.1, v: -0.05 } },
        REGION_LIP: { left: { u: 0.05, v: -0.04 }, right: { u: -0.05, v: -0.04 } },
      },
    });
    NormalizationLayer.setBaseline(baseline);
    const result = NormalizationLayer.normalize(af);

    // Exact check for REGION_BROW (one region, both sides, both components).
    expect(result.regionDisplacements.REGION_BROW.left.u).toBe(
      abs.REGION_BROW.left.u - baseline.neutralStats.REGION_BROW.left.u,
    );
    expect(result.regionDisplacements.REGION_BROW.left.v).toBe(
      abs.REGION_BROW.left.v - baseline.neutralStats.REGION_BROW.left.v,
    );
    expect(result.regionDisplacements.REGION_BROW.right.u).toBe(
      abs.REGION_BROW.right.u - baseline.neutralStats.REGION_BROW.right.u,
    );
    expect(result.regionDisplacements.REGION_BROW.right.v).toBe(
      abs.REGION_BROW.right.v - baseline.neutralStats.REGION_BROW.right.v,
    );

    // All regions: component-wise exact.
    for (const region of REGIONS) {
      const n = baseline.neutralStats[region];
      expect(result.regionDisplacements[region].left.u).toBe(abs[region].left.u - n.left.u);
      expect(result.regionDisplacements[region].left.v).toBe(abs[region].left.v - n.left.v);
      expect(result.regionDisplacements[region].right.u).toBe(abs[region].right.u - n.right.u);
      expect(result.regionDisplacements[region].right.v).toBe(abs[region].right.v - n.right.v);
    }
  });

  it('a frame identical to neutralStats yields ~zero displacement', async () => {
    const { NormalizationLayer } = await import('../../src/metrics/normalize.ts');
    const W = 640;
    const H = 480;
    const af = asApproved(makeFrame(pixelsToNormalized(restFacePixels(320, 240), W, H)), W, H);
    const abs = measureAbsolute(af);

    NormalizationLayer.setBaseline(
      vectorBaseline({
        neutralStats: {
          REGION_BROW: abs.REGION_BROW,
          REGION_EYELID: abs.REGION_EYELID,
          REGION_MOUTH_CORNER: abs.REGION_MOUTH_CORNER,
          REGION_LIP: abs.REGION_LIP,
        },
      }),
    );
    const result = NormalizationLayer.normalize(af);

    for (const region of REGIONS) {
      expect(result.regionDisplacements[region].left.u).toBeCloseTo(0, 12);
      expect(result.regionDisplacements[region].left.v).toBeCloseTo(0, 12);
      expect(result.regionDisplacements[region].right.u).toBeCloseTo(0, 12);
      expect(result.regionDisplacements[region].right.v).toBeCloseTo(0, 12);
    }
  });
});

describe('NormalizationLayer — timestampMs passthrough', () => {
  it('normalize() copies timestampMs from the LandmarkFrame unchanged (API.md §7)', async () => {
    const { NormalizationLayer } = await import('../../src/metrics/normalize.ts');
    NormalizationLayer.setBaseline(vectorBaseline());
    const frame = makeFrame(pixelsToNormalized(restFacePixels(320, 240), 640, 480), 187423.6);
    const result = NormalizationLayer.normalize(asApproved(frame));
    expect(result.timestampMs).toBe(187423.6);
  });
});
