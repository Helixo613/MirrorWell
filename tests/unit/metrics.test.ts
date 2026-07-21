import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedFrame } from '../../src/metrics/normalize.ts';
import type { Vec2 } from '../../src/metrics/geometry.ts';
import type { CalibrationBaseline, ExerciseId, RegionId } from '../../src/data/schema.ts';

/**
 * docs/TESTS.md §2: MetricEngine + RepDetector require 100% branch coverage (hard
 * requirement) — every branch below is deliberate, not incidental.
 *
 * Blendshape SI (candidate blendshape-si-v1, BACKEND §1.5 / MODEL_AND_DATA §7):
 * L/R = blendshapes[pair.left/right]; act = max(L,R);
 * act < blendshapes.activationFloor → SI null; else SI = min(L,R)/max(L,R).
 * effortIndex = act / comfortableMax[exerciseId] (0..1 activation units).
 * Trailing 5-frame median smoothing + gapResetMs semantics unchanged.
 */

const ZERO: Vec2 = { u: 0, v: 0 };

function zeroDisplacements(): Record<RegionId, { left: Vec2; right: Vec2 }> {
  return {
    REGION_BROW: { left: { ...ZERO }, right: { ...ZERO } },
    REGION_EYELID: { left: { ...ZERO }, right: { ...ZERO } },
    REGION_MOUTH_CORNER: { left: { ...ZERO }, right: { ...ZERO } },
    REGION_LIP: { left: { ...ZERO }, right: { ...ZERO } },
  } as Record<RegionId, { left: Vec2; right: Vec2 }>;
}

/** Frame carrying per-side smile blendshape scores (SI/effort source). */
function bsFrame(left: number, right: number, timestampMs = 0): NormalizedFrame {
  return {
    regionDisplacements: zeroDisplacements(),
    blendshapes: { mouthSmileLeft: left, mouthSmileRight: right },
    timestampMs,
  };
}

/** Frame whose blendshape record lacks the smile pair entirely (scores default 0). */
function emptyBsFrame(timestampMs = 0): NormalizedFrame {
  return { regionDisplacements: zeroDisplacements(), blendshapes: {}, timestampMs };
}

function baseline(comfortableMax: Partial<Record<ExerciseId, number>>): CalibrationBaseline {
  return {
    baselineId: 'b1',
    profileId: 'p1',
    capturedAt: '2026-01-01T00:00:00.000Z',
    neutralStats: zeroDisplacements(),
    comfortableMax,
    qualityScore: 0.9,
    noiseFloorSymmetry: 0.02,
    noiseFloorDisplacement: 0.005,
    isActive: 1,
  };
}

// MetricEngine holds module-level state (activeBaseline, smoothing window, ease-off) with no
// public reset for activeBaseline. The per-test `await import()` below returns the CACHED module
// unless the registry is reset first, so without this every test shared one engine and the suite
// was order-dependent: "throws NO_BASELINE before setBaseline() is ever called" passed only while
// it happened to run before any test that called setBaseline(). Mirrors the isolation pattern in
// tests/unit/controller.test.ts — no test-only reset is added to the production contract.
beforeEach(() => {
  vi.resetModules();
});

describe('MetricEngine — NO_BASELINE', () => {
  it('compute() throws NO_BASELINE before setBaseline() is ever called', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    expect(() => MetricEngine.compute(bsFrame(0.5, 0.5), 'EX_SMILE')).toThrow(
      expect.objectContaining({ code: 'NO_BASELINE' }),
    );
  });

  it('setBaseline() throws NO_BASELINE on an invalid baseline', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    expect(() => MetricEngine.setBaseline({} as CalibrationBaseline)).toThrow(
      expect.objectContaining({ code: 'NO_BASELINE' }),
    );
  });

  it('comfortableMax missing for the exerciseId throws NO_BASELINE (never a silent 0 that disables ease-off)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 })); // no EX_BROW_RAISE key
    MetricEngine.reset();
    expect(() => MetricEngine.compute(bsFrame(0.5, 0.5), 'EX_BROW_RAISE')).toThrowError(
      expect.objectContaining({ code: 'NO_BASELINE' }),
    );
  });
});

describe('MetricEngine — blendshape symmetryIndex', () => {
  it('symmetric pair → SI 1', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();
    const result = MetricEngine.compute(bsFrame(0.5, 0.5), 'EX_SMILE');
    expect(result.symmetryIndex).toBe(1);
    expect(result.effortIndex).toBeCloseTo(0.5, 6);
  });

  it('smirk-grade asymmetry → SI = min/max (probe regression: 0.29/0.67 → ~0.433)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();
    const result = MetricEngine.compute(bsFrame(0.29, 0.67), 'EX_SMILE');
    expect(result.symmetryIndex).toBeCloseTo(0.29 / 0.67, 6);
    expect(result.effortIndex).toBeCloseTo(0.67, 6);
  });

  it('unilateral activation → SI 0 (clinical guard: one-sided motion never looks symmetric)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();
    const result = MetricEngine.compute(bsFrame(0.4, 0), 'EX_SMILE');
    expect(result.symmetryIndex).toBe(0);
    expect(result.effortIndex).toBeCloseTo(0.4, 6);
  });

  it('act exactly at activationFloor (0.05) is NOT null (boundary is strict <)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();
    const result = MetricEngine.compute(bsFrame(0.05, 0.05), 'EX_SMILE');
    expect(result.symmetryIndex).toBe(1);
  });

  it('act below activationFloor yields null symmetryIndex but a real effortIndex', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();
    const result = MetricEngine.compute(bsFrame(0.02, 0.03), 'EX_SMILE');
    expect(result.symmetryIndex).toBeNull();
    expect(result.effortIndex).toBeCloseTo(0.03, 6);
  });

  it('missing pair scores in the record default to 0 (act 0 → null SI, effort 0)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();
    const result = MetricEngine.compute(emptyBsFrame(), 'EX_SMILE');
    expect(result.symmetryIndex).toBeNull();
    expect(result.effortIndex).toBe(0);
  });

  it('EX_PUCKER (no blendshapePair — open decision) throws VALIDATION_FAILED, never a silent fallback', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_PUCKER: 1.0 }));
    MetricEngine.reset();
    expect(() => MetricEngine.compute(bsFrame(0.5, 0.5), 'EX_PUCKER')).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
  });
});

describe('MetricEngine — trailing 5-frame median (t−4..t only)', () => {
  it('a single-frame spike is killed by the trailing median (both SI and effort)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();

    for (let i = 0; i < 4; i++) {
      MetricEngine.compute(bsFrame(0.5, 0.5, i * 10), 'EX_SMILE'); // SI=1, effort=0.5
    }
    // Spike: raw SI = 0.1/0.9 ≈ 0.111, effort 0.9
    const spike = MetricEngine.compute(bsFrame(0.9, 0.1, 40), 'EX_SMILE');
    expect(spike.symmetryIndex).toBe(1); // median of [1,1,1,1,0.111] is still 1
    expect(spike.effortIndex).toBeCloseTo(0.5, 6); // median of [.5,.5,.5,.5,.9] is still .5

    MetricEngine.compute(bsFrame(0.5, 0.5, 50), 'EX_SMILE');
    const after = MetricEngine.compute(bsFrame(0.5, 0.5, 60), 'EX_SMILE');
    expect(after.symmetryIndex).toBe(1);
    expect(after.effortIndex).toBeCloseTo(0.5, 6);
  });

  it('output at frame t uses frames t−4..t only (trailing, not centered)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();

    // SI sequence 0.2, 0.4, 0.6, 0.8, 1.0 via left = k·0.1 against right = 0.5
    const leftScores = [0.1, 0.2, 0.3, 0.4, 0.5];
    for (let i = 0; i < 5; i++) {
      const r = MetricEngine.compute(bsFrame(leftScores[i]!, 0.5, i * 10), 'EX_SMILE');
      if (i === 4) {
        // trailing window = all five → median of [0.2,0.4,0.6,0.8,1.0] = 0.6
        expect(r.symmetryIndex).toBeCloseTo(0.6, 6);
      }
    }

    // Frame with SI=0 (unilateral): window [0.4,0.6,0.8,1.0,0] → median 0.6
    const f = MetricEngine.compute(bsFrame(0.5, 0, 50), 'EX_SMILE');
    expect(f.symmetryIndex).toBeCloseTo(0.6, 6);

    // Two more SI=0 frames: [0.8,1.0,0,0,0] median=0; then [1.0,0,0,0,0] median=0
    MetricEngine.compute(bsFrame(0.5, 0, 60), 'EX_SMILE');
    const late = MetricEngine.compute(bsFrame(0.5, 0, 70), 'EX_SMILE');
    expect(late.symmetryIndex).toBe(0);
  });

  it('smoothed symmetryIndex is null when every frame in the window is under activationFloor', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();
    MetricEngine.compute(bsFrame(0.01, 0.01, 0), 'EX_SMILE');
    MetricEngine.compute(bsFrame(0.02, 0.01, 10), 'EX_SMILE');
    const result = MetricEngine.compute(bsFrame(0.01, 0.02, 20), 'EX_SMILE');
    expect(result.symmetryIndex).toBeNull();
  });

  it('filters nulls out of the window when computing smoothed symmetryIndex', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();
    MetricEngine.compute(bsFrame(0.01, 0.01, 0), 'EX_SMILE'); // null
    const result = MetricEngine.compute(bsFrame(0.5, 0.5, 10), 'EX_SMILE'); // 1
    expect(result.symmetryIndex).toBe(1); // median of [null, 1] filtered → 1
  });

  it('even-length present window uses the average of the two middle values', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();
    MetricEngine.compute(bsFrame(0.25, 0.5, 0), 'EX_SMILE'); // SI=0.5
    const result = MetricEngine.compute(bsFrame(0.5, 0.5, 10), 'EX_SMILE'); // SI=1
    expect(result.symmetryIndex).toBeCloseTo(0.75, 6);
  });
});

describe('MetricEngine — gap > gapResetMs (250) resets smoothing + ease-off', () => {
  it('gap > 250 ms clears the trailing window so the next sample stands alone', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();

    for (let i = 0; i < 5; i++) {
      MetricEngine.compute(bsFrame(0.5, 0.5, i * 10), 'EX_SMILE'); // SI=1, effort=0.5
    }
    // Gap of 251ms from last (40) → 291; window reset, unilateral SI=0 stands alone
    const afterGap = MetricEngine.compute(bsFrame(0.9, 0, 291), 'EX_SMILE');
    expect(afterGap.symmetryIndex).toBe(0);
    expect(afterGap.effortIndex).toBeCloseTo(0.9, 6);
  });

  it('gap of exactly 250 ms does NOT reset (boundary is strict >)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();

    MetricEngine.compute(bsFrame(0.5, 0.5, 0), 'EX_SMILE'); // SI=1
    const result = MetricEngine.compute(bsFrame(0.5, 0, 250), 'EX_SMILE'); // SI=0
    expect(result.symmetryIndex).toBeCloseTo(0.5, 6); // median [1, 0]
  });

  it('gap resets ease-off sustain accumulation (must re-sustain after gap)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();

    MetricEngine.compute(bsFrame(0.7, 0.7, 0), 'EX_SMILE'); // effort 0.7, start sustain
    MetricEngine.compute(bsFrame(0.7, 0.7, 200), 'EX_SMILE');
    expect(MetricEngine.isEaseOffActive()).toBe(false);

    // Gap 251ms from 200 → 451; clears sustain; high effort restarts timer at 451
    MetricEngine.compute(bsFrame(0.7, 0.7, 451), 'EX_SMILE');
    expect(MetricEngine.isEaseOffActive()).toBe(false);
    MetricEngine.compute(bsFrame(0.7, 0.7, 651), 'EX_SMILE');
    expect(MetricEngine.isEaseOffActive()).toBe(false);
    MetricEngine.compute(bsFrame(0.7, 0.7, 751), 'EX_SMILE'); // 300ms since 451
    expect(MetricEngine.isEaseOffActive()).toBe(true);
  });
});

describe('MetricEngine — ease-off (sustained > 0.60 for >= 300ms)', () => {
  it('isEaseOffActive() is false before any compute() call', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();
    expect(MetricEngine.isEaseOffActive()).toBe(false);
  });

  it('fires only once sustained above threshold for >= easeOffSustainMs (300ms)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();
    MetricEngine.compute(bsFrame(0.7, 0.7, 0), 'EX_SMILE'); // effort 0.7
    expect(MetricEngine.isEaseOffActive()).toBe(false);
    MetricEngine.compute(bsFrame(0.7, 0.7, 200), 'EX_SMILE');
    expect(MetricEngine.isEaseOffActive()).toBe(false);
    MetricEngine.compute(bsFrame(0.7, 0.7, 300), 'EX_SMILE');
    expect(MetricEngine.isEaseOffActive()).toBe(true);
  });

  it('resets the sustain timer and clears active state the moment effort drops back <= threshold', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();
    MetricEngine.compute(bsFrame(0.7, 0.7, 0), 'EX_SMILE');
    MetricEngine.compute(bsFrame(0.3, 0.3, 100), 'EX_SMILE'); // effort 0.3, drop
    expect(MetricEngine.isEaseOffActive()).toBe(false);
    MetricEngine.compute(bsFrame(0.7, 0.7, 150), 'EX_SMILE');
    MetricEngine.compute(bsFrame(0.7, 0.7, 300), 'EX_SMILE'); // only 150ms elapsed
    expect(MetricEngine.isEaseOffActive()).toBe(false);
    MetricEngine.compute(bsFrame(0.7, 0.7, 450), 'EX_SMILE'); // 300ms since 150
    expect(MetricEngine.isEaseOffActive()).toBe(true);
  });

  it('exactly at threshold (0.60) does not fire — boundary is strict >', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();
    // Median effort stays exactly 0.6 across the window
    MetricEngine.compute(bsFrame(0.6, 0.6, 0), 'EX_SMILE');
    MetricEngine.compute(bsFrame(0.6, 0.6, 400), 'EX_SMILE');
    expect(MetricEngine.isEaseOffActive()).toBe(false);
  });
});

describe('MetricEngine — getLastRaw() (DebugHud, Task 8)', () => {
  it('is null before the first compute() call', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();
    expect(MetricEngine.getLastRaw()).toBeNull();
  });

  it('exposes the pre-smoothing raw values, distinct from the smoothed compute() result', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();
    MetricEngine.compute(bsFrame(0.5, 0.5, 0), 'EX_SMILE'); // raw SI=1, effort=0.5
    const smoothed = MetricEngine.compute(bsFrame(0.9, 0.1, 10), 'EX_SMILE');
    const raw = MetricEngine.getLastRaw();
    expect(raw).not.toBeNull();
    expect(raw!.symmetryIndex).toBeCloseTo(0.1 / 0.9, 6);
    expect(raw!.effortIndex).toBeCloseTo(0.9, 6);
    expect(smoothed.symmetryIndex).not.toBeCloseTo(raw!.symmetryIndex!, 3);
    expect(smoothed.effortIndex).not.toBeCloseTo(raw!.effortIndex, 3);
  });
});

describe('MetricEngine — reset()', () => {
  it('reset() clears smoothing window, gap clock, and ease-off state but retains the active baseline', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 1.0 }));
    MetricEngine.reset();
    MetricEngine.compute(bsFrame(0.7, 0.7, 0), 'EX_SMILE');
    MetricEngine.compute(bsFrame(0.7, 0.7, 200), 'EX_SMILE');
    MetricEngine.compute(bsFrame(0.7, 0.7, 300), 'EX_SMILE');
    expect(MetricEngine.isEaseOffActive()).toBe(true);

    MetricEngine.reset();
    expect(MetricEngine.isEaseOffActive()).toBe(false);
    expect(MetricEngine.getLastRaw()).toBeNull();

    // Baseline retained; window cleared so single frame smoothed == raw.
    const result = MetricEngine.compute(bsFrame(0.1, 0.3, 0), 'EX_SMILE');
    expect(result.symmetryIndex).toBeCloseTo(0.1 / 0.3, 6);
  });
});
