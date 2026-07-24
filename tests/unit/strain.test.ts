import { beforeEach, describe, expect, it } from 'vitest';
import { MetricEngine } from '../../src/metrics/metrics.ts';
import { RepDetector } from '../../src/metrics/reps.ts';
import { thresholds } from '../../src/config/thresholds.ts';
import { exercises } from '../../src/config/exercises.ts';
import { coachPhaseFor } from '../../src/screens/session/sessionHelpers.ts';
import type { CalibrationBaseline } from '../../src/data/schema.ts';
import type { NormalizedFrame } from '../../src/metrics/normalize.ts';
import type { MetricSample } from '../../src/metrics/metrics.ts';

/**
 * strainIndex and rep classification: telling a strained face from a full rep.
 *
 * The point of these tests is the DISCRIMINATION, not the arithmetic. effortIndex alone cannot
 * separate a hard clean rep from a hard strained one, because both are simply "big". So the
 * central cases below hold effort identical and vary only the compensation, which is the exact
 * comparison that used to be impossible.
 */
const SMILE = 'EX_SMILE';
const { left: TARGET_L, right: TARGET_R } = exercises[SMILE]!.blendshapePair!;
const ACCESSORY = exercises[SMILE]!.accessoryBlendshapes;

const NEUTRAL_STATS = {
  REGION_BROW: { left: { u: 0, v: 0.418 }, right: { u: 0, v: 0.421 } },
  REGION_EYELID: { left: { u: 0, v: 0.112 }, right: { u: 0, v: 0.108 } },
  REGION_MOUTH_CORNER: { left: { u: 0.507, v: 0.05 }, right: { u: -0.503, v: 0.05 } },
  REGION_LIP: { left: { u: 0.231, v: 0.08 }, right: { u: -0.229, v: 0.08 } },
} as CalibrationBaseline['neutralStats'];

function baseline(): CalibrationBaseline {
  return {
    baselineId: '33333333-3333-4333-8333-333333333333',
    profileId: '11111111-1111-4111-8111-111111111111',
    capturedAt: '2026-01-01T09:00:00.000Z',
    neutralStats: NEUTRAL_STATS,
    comfortableMax: { EX_SMILE: 0.8 },
    neutralActivation: { EX_SMILE: 0.0 },
    qualityScore: 0.91,
    noiseFloorSymmetry: 0.05,
    noiseFloorDisplacement: 0.008,
    isActive: 1,
  } as CalibrationBaseline;
}

/** A frame with the target pair at `target` and every accessory category at `accessory`. */
function frame(target: number, accessory: number, timestampMs: number): NormalizedFrame {
  const blendshapes: Record<string, number> = {
    [TARGET_L]: target,
    [TARGET_R]: target,
  };
  for (const category of ACCESSORY) blendshapes[category] = accessory;
  return {
    regionDisplacements: {},
    blendshapes,
    timestampMs,
  } as unknown as NormalizedFrame;
}

/** Push a frame through MetricEngine enough times to fill the trailing median window. */
function settle(target: number, accessory: number, startMs = 0): MetricSample {
  let sample!: MetricSample;
  for (let i = 0; i < thresholds.metrics.smoothingWindow; i += 1) {
    sample = MetricEngine.compute(frame(target, accessory, startMs + i * 33), SMILE);
  }
  return sample;
}

beforeEach(() => {
  MetricEngine.reset();
  MetricEngine.setBaseline(baseline());
  RepDetector.reset();
});

describe('strainIndex', () => {
  it('is 0 for a clean movement with the rest of the face quiet', () => {
    expect(settle(0.6, 0).strainIndex).toBe(0);
  });

  it('is 0 on a resting face rather than dividing by zero', () => {
    expect(settle(0, 0).strainIndex).toBe(0);
  });

  it('ignores accessory activation below the noise floor', () => {
    const justUnder = thresholds.blendshapes.strainAccessoryFloor - 0.001;
    expect(settle(0.6, justUnder).strainIndex).toBe(0);
  });

  it('rises once the rest of the face is genuinely recruited', () => {
    const clean = settle(0.6, 0).strainIndex;
    const strained = settle(0.6, 0.5, 10_000).strainIndex;
    expect(strained).toBeGreaterThan(clean);
    expect(strained).toBeGreaterThan(0.3);
  });

  it('separates a strained face from a full rep at IDENTICAL effort', () => {
    // The discrimination that effortIndex alone cannot make.
    const clean = settle(0.6, 0, 0);
    const strained = settle(0.6, 0.5, 10_000);
    expect(strained.effortIndex).toBeCloseTo(clean.effortIndex, 6);
    expect(strained.strainIndex).toBeGreaterThan(clean.strainIndex);
  });

  it('scales out magnitude: a small clean rep is not more strained than a big clean one', () => {
    expect(settle(0.2, 0, 0).strainIndex).toBe(settle(0.7, 0, 10_000).strainIndex);
  });

  it('stays within [0,1]', () => {
    for (const [target, accessory] of [[0, 0.9], [0.9, 0], [0.4, 0.4], [0, 0]]) {
      const { strainIndex } = settle(target!, accessory!, Math.random() * 0 + 20_000);
      expect(strainIndex).toBeGreaterThanOrEqual(0);
      expect(strainIndex).toBeLessThanOrEqual(1);
      MetricEngine.reset();
      MetricEngine.setBaseline(baseline());
    }
  });

  it('excludes the Duchenne synergists of a smile from the strain markers', () => {
    // A real smile crinkles the eyes. If those counted as strain, the best reps would score
    // worst, so this is a correctness property of the config, not a style preference.
    expect(ACCESSORY).not.toContain('eyeSquintLeft');
    expect(ACCESSORY).not.toContain('eyeSquintRight');
    expect(ACCESSORY).not.toContain('cheekSquintLeft');
    expect(ACCESSORY).not.toContain('cheekSquintRight');
  });

  it('excludes the natural synergist of a brow raise', () => {
    expect(exercises.EX_BROW_RAISE!.accessoryBlendshapes).not.toContain('browInnerUp');
  });
});

describe('rep classification', () => {
  function runRep(effort: number, strain: number): ReturnType<typeof RepDetector.feed> {
    RepDetector.reset();
    for (let t = 0; t <= 1000; t += 200) {
      RepDetector.feed({ symmetryIndex: 0.9, effortIndex: effort, strainIndex: strain, timestampMs: t });
    }
    return RepDetector.feed({
      symmetryIndex: 0.9,
      effortIndex: 0,
      strainIndex: strain,
      timestampMs: 1200,
    });
  }

  it('classifies a big, quiet-faced rep as full', () => {
    const event = runRep(0.7, 0);
    expect(event?.quality).toBe('full');
  });

  it('classifies a small, clean rep as partial rather than as a fault', () => {
    const event = runRep(0.2, 0);
    expect(event?.quality).toBe('partial');
  });

  it('classifies a compensation-led rep as strained', () => {
    const event = runRep(0.7, 0.8);
    expect(event?.quality).toBe('strained');
  });

  it('calls a big BUT strained rep strained, never full', () => {
    // The case the old effort-only model got wrong: it would have been the best-looking rep.
    const event = runRep(0.95, 0.9);
    expect(event?.peakEffortIndex).toBeGreaterThan(thresholds.reps.fullRepEffortMin);
    expect(event?.quality).toBe('strained');
  });

  it('reports mean strain across the rep, so one twitchy frame is not a strained rep', () => {
    RepDetector.reset();
    RepDetector.feed({ symmetryIndex: 0.9, effortIndex: 0.7, strainIndex: 1, timestampMs: 0 });
    for (let t = 200; t <= 1000; t += 200) {
      RepDetector.feed({ symmetryIndex: 0.9, effortIndex: 0.7, strainIndex: 0, timestampMs: t });
    }
    const event = RepDetector.feed({
      symmetryIndex: 0.9,
      effortIndex: 0,
      strainIndex: 0,
      timestampMs: 1200,
    });
    expect(event?.meanStrainIndex).toBeLessThan(thresholds.reps.strainMax);
    expect(event?.quality).toBe('full');
  });
});

describe('coaching precedence', () => {
  const [zoneLow, zoneHigh] = thresholds.metrics.effortTargetZone;
  const strained = thresholds.reps.strainMax;

  it('coaches the effort band normally when the face is quiet', () => {
    expect(coachPhaseFor(zoneLow - 0.01, 0)).toBe('raise');
    expect(coachPhaseFor(zoneHigh, 0)).toBe('hold');
    expect(coachPhaseFor(zoneHigh + 0.01, 0)).toBe('easeBack');
  });

  it('says soften instead of hold when effort looks perfect BUT is compensation-led', () => {
    // The failure the old effort-only coach had: mid-band effort reads as an ideal rep, so it
    // would say "hold it gently" while the user is clenching their jaw to get there.
    const midBand = (zoneLow + zoneHigh) / 2;
    expect(coachPhaseFor(midBand, 0)).toBe('hold');
    expect(coachPhaseFor(midBand, strained)).toBe('soften');
  });

  it('lets strain outrank easeBack too, so the advice names the actual problem', () => {
    expect(coachPhaseFor(0.95, strained)).toBe('soften');
  });

  it('defaults to the effort-only behaviour when no strain is supplied', () => {
    expect(coachPhaseFor(zoneHigh)).toBe('hold');
  });
});
