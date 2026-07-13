import { describe, expect, it } from 'vitest';
import type { LandmarkFrame } from '../../src/sensing/landmarks.ts';
import type { ApprovedFrame } from '../../src/sensing/quality.ts';
import type { CalibrationBaseline } from '../../src/data/schema.ts';

/**
 * These tests prove NormalizationLayer's math is INTERNALLY CONSISTENT (scale-invariant,
 * and self-consistent under its own inverse-rotation convention) — they are synthetic, not a
 * V1 kill-gate run. V1 needs real consented human-face fixture recordings
 * (docs/MODEL_AND_DATA.md §4), which don't exist in this environment. Do not read a green run
 * here as "V1 passed." See docs/IMPLEMENTATION.md Task 6.
 */

const NUM_LANDMARKS = 478;

// Indices used by src/config/exercises.ts's region pairs (Task 6).
const IDX = { eyeLeft: 33, eyeRight: 263, browLeft: 105, lidUpperLeft: 159, noseTip: 1, mouthCornerLeft: 291 };

type Point = { x: number; y: number; z: number };

function baseLandmarks(): Point[] {
  const pts: Point[] = Array.from({ length: NUM_LANDMARKS }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  pts[IDX.eyeLeft] = { x: 0.62, y: 0.4, z: 0.01 };
  pts[IDX.eyeRight] = { x: 0.38, y: 0.4, z: 0.01 };
  pts[IDX.browLeft] = { x: 0.62, y: 0.32, z: 0.02 };
  pts[IDX.lidUpperLeft] = { x: 0.62, y: 0.38, z: 0.01 };
  pts[IDX.noseTip] = { x: 0.5, y: 0.5, z: 0.05 };
  pts[IDX.mouthCornerLeft] = { x: 0.58, y: 0.62, z: 0.0 };
  return pts;
}

function scaleAround(points: Point[], center: Point, k: number): Point[] {
  return points.map((p) => ({
    x: center.x + k * (p.x - center.x),
    y: center.y + k * (p.y - center.y),
    z: center.z + k * (p.z - center.z),
  }));
}

function rotateYAround(points: Point[], center: Point, degrees: number): Point[] {
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return points.map((p) => {
    const x = p.x - center.x;
    const z = p.z - center.z;
    return {
      x: center.x + (c * x + s * z),
      y: p.y,
      z: center.z + (-s * x + c * z),
    };
  });
}

function yawHeadPose(degrees: number): number[] {
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  // eslint-disable-next-line prettier/prettier
  return [
    c, 0, s, 0,
    0, 1, 0, 0,
    -s, 0, c, 0,
    0, 0, 0, 1,
  ];
}

function identityHeadPose(): number[] {
  // eslint-disable-next-line prettier/prettier
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function makeFrame(landmarks: Point[], headPose: number[] = identityHeadPose()): LandmarkFrame {
  return { landmarks, headPose, facePresent: true, timestampMs: 0 };
}

/** Test-only: forge ApprovedFrame without going through QualityMonitor (brand is private). */
function asApproved(lf: LandmarkFrame): ApprovedFrame {
  return { lf, videoWidth: 640, videoHeight: 480 } as unknown as ApprovedFrame;
}

function zeroBaseline(): CalibrationBaseline {
  return {
    baselineId: 'b1',
    profileId: 'p1',
    capturedAt: '2026-01-01T00:00:00.000Z',
    neutralStats: {
      REGION_BROW: { left: 0, right: 0 },
      REGION_EYELID: { left: 0, right: 0 },
      REGION_MOUTH_CORNER: { left: 0, right: 0 },
      REGION_LIP: { left: 0, right: 0 },
    },
    comfortableMax: {},
    qualityScore: 0.9,
    isActive: 1,
  };
}

describe('NormalizationLayer — NO_BASELINE', () => {
  it('normalize() throws NO_BASELINE without setBaseline()', async () => {
    const { NormalizationLayer } = await import('../../src/metrics/normalize.ts');
    NormalizationLayer.clearBaseline();
    expect(() => NormalizationLayer.normalize(asApproved(makeFrame(baseLandmarks())))).toThrow(
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
    NormalizationLayer.setBaseline(zeroBaseline());
    NormalizationLayer.clearBaseline();
    expect(() => NormalizationLayer.normalize(asApproved(makeFrame(baseLandmarks())))).toThrow(
      expect.objectContaining({ code: 'NO_BASELINE' }),
    );
  });
});

describe('NormalizationLayer — synthetic scale invariance (not V1)', () => {
  it('region displacement is unchanged under uniform scaling of all landmarks', async () => {
    const { NormalizationLayer } = await import('../../src/metrics/normalize.ts');
    NormalizationLayer.setBaseline(zeroBaseline());

    const original = baseLandmarks();
    const scaled = scaleAround(original, { x: 0.5, y: 0.5, z: 0 }, 1.7);

    const resultOriginal = NormalizationLayer.normalize(asApproved(makeFrame(original)));
    const resultScaled = NormalizationLayer.normalize(asApproved(makeFrame(scaled)));

    for (const region of ['REGION_BROW', 'REGION_EYELID', 'REGION_MOUTH_CORNER', 'REGION_LIP'] as const) {
      expect(resultScaled.regionDisplacements[region].left).toBeCloseTo(resultOriginal.regionDisplacements[region].left, 5);
      expect(resultScaled.regionDisplacements[region].right).toBeCloseTo(resultOriginal.regionDisplacements[region].right, 5);
    }
  });
});

describe('NormalizationLayer — synthetic rotation self-consistency (not V1)', () => {
  it('a landmark rotation matched by the same headPose rotation recovers the unrotated result', async () => {
    const { NormalizationLayer } = await import('../../src/metrics/normalize.ts');
    NormalizationLayer.setBaseline(zeroBaseline());

    const original = baseLandmarks();
    const center = { x: 0.5, y: 0.5, z: 0 };
    const rotated = rotateYAround(original, center, 20);

    const resultOriginal = NormalizationLayer.normalize(asApproved(makeFrame(original, identityHeadPose())));
    const resultRotated = NormalizationLayer.normalize(asApproved(makeFrame(rotated, yawHeadPose(20))));

    for (const region of ['REGION_BROW', 'REGION_EYELID', 'REGION_MOUTH_CORNER', 'REGION_LIP'] as const) {
      expect(resultRotated.regionDisplacements[region].left).toBeCloseTo(resultOriginal.regionDisplacements[region].left, 4);
      expect(resultRotated.regionDisplacements[region].right).toBeCloseTo(resultOriginal.regionDisplacements[region].right, 4);
    }
  });
});

describe('NormalizationLayer — timestampMs passthrough', () => {
  it('normalize() copies timestampMs from the LandmarkFrame unchanged (API.md §7)', async () => {
    const { NormalizationLayer } = await import('../../src/metrics/normalize.ts');
    NormalizationLayer.setBaseline(zeroBaseline());
    const frame = makeFrame(baseLandmarks());
    frame.timestampMs = 187423.6;
    const result = NormalizationLayer.normalize(asApproved(frame));
    expect(result.timestampMs).toBe(187423.6);
  });
});

describe('NormalizationLayer — baseline subtraction', () => {
  it('subtracts neutralStats so a frame identical to baseline yields ~zero displacement', async () => {
    const { NormalizationLayer } = await import('../../src/metrics/normalize.ts');
    const frame = makeFrame(baseLandmarks());

    // First pass with a zero baseline to measure the raw region distances.
    NormalizationLayer.setBaseline(zeroBaseline());
    const raw = NormalizationLayer.normalize(asApproved(frame));

    // Now set neutralStats to those exact raw values and re-normalize the SAME frame.
    const matchedBaseline = zeroBaseline();
    matchedBaseline.neutralStats = {
      REGION_BROW: { left: raw.regionDisplacements.REGION_BROW.left, right: raw.regionDisplacements.REGION_BROW.right },
      REGION_EYELID: { left: raw.regionDisplacements.REGION_EYELID.left, right: raw.regionDisplacements.REGION_EYELID.right },
      REGION_MOUTH_CORNER: {
        left: raw.regionDisplacements.REGION_MOUTH_CORNER.left,
        right: raw.regionDisplacements.REGION_MOUTH_CORNER.right,
      },
      REGION_LIP: { left: raw.regionDisplacements.REGION_LIP.left, right: raw.regionDisplacements.REGION_LIP.right },
    };
    NormalizationLayer.setBaseline(matchedBaseline);
    const result = NormalizationLayer.normalize(asApproved(frame));

    for (const region of ['REGION_BROW', 'REGION_EYELID', 'REGION_MOUTH_CORNER', 'REGION_LIP'] as const) {
      expect(result.regionDisplacements[region].left).toBeCloseTo(0, 6);
      expect(result.regionDisplacements[region].right).toBeCloseTo(0, 6);
    }
  });
});
