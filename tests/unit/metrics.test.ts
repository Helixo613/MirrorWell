import { describe, expect, it } from 'vitest';
import type { NormalizedFrame } from '../../src/metrics/normalize.ts';
import type { Vec2 } from '../../src/metrics/geometry.ts';
import type { CalibrationBaseline, ExerciseId, RegionId } from '../../src/data/schema.ts';

/**
 * docs/TESTS.md §2: MetricEngine + RepDetector require 100% branch coverage (hard
 * requirement) — every branch below is deliberate, not incidental.
 *
 * Vector SI math (ARCHITECTURE §7): mirror right ΔR̃=(−ΔR.u, ΔR.v);
 * SI = (min/max)·max(0, cosθ); null under movementFloor.
 */

const ZERO: Vec2 = { u: 0, v: 0 };

function frame(regionId: RegionId, left: Vec2, right: Vec2, timestampMs = 0): NormalizedFrame {
  const regionDisplacements = {
    REGION_BROW: { left: { ...ZERO }, right: { ...ZERO } },
    REGION_EYELID: { left: { ...ZERO }, right: { ...ZERO } },
    REGION_MOUTH_CORNER: { left: { ...ZERO }, right: { ...ZERO } },
    REGION_LIP: { left: { ...ZERO }, right: { ...ZERO } },
  } as Record<RegionId, { left: Vec2; right: Vec2 }>;
  regionDisplacements[regionId] = { left, right };
  return { regionDisplacements, timestampMs };
}

/** Equal same-direction horizontal: left +u, right −u → after mirror both +u → SI=1 */
function sameDir(mag: number, timestampMs = 0, regionId: RegionId = 'REGION_MOUTH_CORNER'): NormalizedFrame {
  return frame(regionId, { u: mag, v: 0 }, { u: -mag, v: 0 }, timestampMs);
}

/** Equal opposite horizontal: both +u → after mirror cosθ=−1 → SI=0 */
function oppositeDir(mag: number, timestampMs = 0): NormalizedFrame {
  return frame('REGION_MOUTH_CORNER', { u: mag, v: 0 }, { u: mag, v: 0 }, timestampMs);
}

function baseline(comfortableMax: Partial<Record<ExerciseId, number>>): CalibrationBaseline {
  return {
    baselineId: 'b1',
    profileId: 'p1',
    capturedAt: '2026-01-01T00:00:00.000Z',
    neutralStats: {
      REGION_BROW: { left: { ...ZERO }, right: { ...ZERO } },
      REGION_EYELID: { left: { ...ZERO }, right: { ...ZERO } },
      REGION_MOUTH_CORNER: { left: { ...ZERO }, right: { ...ZERO } },
      REGION_LIP: { left: { ...ZERO }, right: { ...ZERO } },
    },
    comfortableMax,
    qualityScore: 0.9,
    noiseFloorSymmetry: 0.02,
    noiseFloorDisplacement: 0.005,
    isActive: 1,
  };
}

describe('MetricEngine — NO_BASELINE', () => {
  it('compute() throws NO_BASELINE before setBaseline() is ever called', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    expect(() => MetricEngine.compute(sameDir(0.05), 'EX_SMILE')).toThrow(
      expect.objectContaining({ code: 'NO_BASELINE' }),
    );
  });

  it('setBaseline() throws NO_BASELINE on an invalid baseline', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    expect(() => MetricEngine.setBaseline({} as CalibrationBaseline)).toThrow(
      expect.objectContaining({ code: 'NO_BASELINE' }),
    );
  });
});

describe('MetricEngine — direction-aware symmetryIndex (P0-6)', () => {
  it('equal same-direction motion → SI 1', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    // left=(0.1,0), right=(-0.1,0) → ΔR̃=(0.1,0) → cos=1, ratio=1 → SI=1
    const result = MetricEngine.compute(sameDir(0.1, 0), 'EX_SMILE');
    expect(result.symmetryIndex).toBe(1);
    expect(result.effortIndex).toBeCloseTo(1.0, 6);
  });

  it('equal opposite motion → SI 0 (P0-6 regression)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    // left=(0.1,0), right=(0.1,0) → ΔR̃=(-0.1,0) → cos=-1 → SI=0
    const result = MetricEngine.compute(oppositeDir(0.1, 0), 'EX_SMILE');
    expect(result.symmetryIndex).toBe(0);
    expect(result.effortIndex).toBeCloseTo(1.0, 6);
  });

  it('unilateral motion → SI 0', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    // left only; mR=0 → cosθ=0 (either magnitude zero) → SI=0
    const result = MetricEngine.compute(
      frame('REGION_MOUTH_CORNER', { u: 0.1, v: 0 }, { u: 0, v: 0 }, 0),
      'EX_SMILE',
    );
    expect(result.symmetryIndex).toBe(0);
    expect(result.effortIndex).toBeCloseTo(1.0, 6);
  });

  it('max(mL,mR) exactly at movementFloor (0.008) is NOT null (boundary is strict <)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    const result = MetricEngine.compute(sameDir(0.008, 0), 'EX_SMILE');
    expect(result.symmetryIndex).toBe(1);
  });

  it('max(mL,mR) below movementFloor yields null symmetryIndex but a real effortIndex', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    // mL=0.005, mR=0.003 → max under floor
    const result = MetricEngine.compute(
      frame('REGION_MOUTH_CORNER', { u: 0.005, v: 0 }, { u: -0.003, v: 0 }, 0),
      'EX_SMILE',
    );
    expect(result.symmetryIndex).toBeNull();
    expect(result.effortIndex).toBeCloseTo(0.05, 6);
  });

  it('magnitude ratio scales SI when directions align (cosθ>0)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    // left m=0.09, right m=0.01 same direction → SI = 0.01/0.09
    const result = MetricEngine.compute(
      frame('REGION_MOUTH_CORNER', { u: 0.09, v: 0 }, { u: -0.01, v: 0 }, 0),
      'EX_SMILE',
    );
    expect(result.symmetryIndex).toBeCloseTo(0.01 / 0.09, 6);
    expect(result.effortIndex).toBeCloseTo(0.9, 6);
  });

  it('comfortableMax missing for the exerciseId defensively yields effortIndex 0, not NaN', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 })); // no EX_PUCKER key
    MetricEngine.reset();
    const result = MetricEngine.compute(sameDir(0.05, 0, 'REGION_LIP'), 'EX_PUCKER');
    expect(result.effortIndex).toBe(0);
    expect(Number.isNaN(result.effortIndex)).toBe(false);
  });
});

describe('MetricEngine — trailing 5-frame median (t−4..t only)', () => {
  it('a single-frame spike is killed by the trailing median (both SI and effort)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();

    for (let i = 0; i < 4; i++) {
      MetricEngine.compute(sameDir(0.05, i * 10), 'EX_SMILE'); // SI=1, effort=0.5
    }
    // Spike: unequal same-direction → raw SI≈0.111, effort=0.9
    const spike = MetricEngine.compute(
      frame('REGION_MOUTH_CORNER', { u: 0.09, v: 0 }, { u: -0.01, v: 0 }, 40),
      'EX_SMILE',
    );
    expect(spike.symmetryIndex).toBe(1); // median of [1,1,1,1,0.111] is still 1
    expect(spike.effortIndex).toBeCloseTo(0.5, 6); // median of [.5,.5,.5,.5,.9] is still .5

    // Two more normal frames slide the spike out of the trailing window.
    MetricEngine.compute(sameDir(0.05, 50), 'EX_SMILE');
    const after = MetricEngine.compute(sameDir(0.05, 60), 'EX_SMILE');
    expect(after.symmetryIndex).toBe(1);
    expect(after.effortIndex).toBeCloseTo(0.5, 6);
  });

  it('output at frame t uses frames t−4..t only (trailing, not centered)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();

    // Craft distinct SI values via magnitude ratios (same direction):
    // SI = min/max for same-dir: mags [0.02, 0.04, 0.06, 0.08, 0.10] with partner 0.10
    // → SI sequence: 0.2, 0.4, 0.6, 0.8, 1.0
    const leftMags = [0.02, 0.04, 0.06, 0.08, 0.1];
    for (let i = 0; i < 5; i++) {
      const r = MetricEngine.compute(
        frame('REGION_MOUTH_CORNER', { u: leftMags[i]!, v: 0 }, { u: -0.1, v: 0 }, i * 10),
        'EX_SMILE',
      );
      if (i === 4) {
        // trailing window = all five → median of [0.2,0.4,0.6,0.8,1.0] = 0.6
        expect(r.symmetryIndex).toBeCloseTo(0.6, 6);
      }
    }

    // Frame F with SI=0 (opposite equal): window becomes [0.4,0.6,0.8,1.0,0] → median 0.6
    // (If centered with lookahead, this frame couldn't use future; trailing drops the oldest 0.2)
    const f = MetricEngine.compute(oppositeDir(0.1, 50), 'EX_SMILE');
    expect(f.symmetryIndex).toBeCloseTo(0.6, 6);

    // Two more SI=0 frames: [0.8,1.0,0,0,0] median=0; then [1.0,0,0,0,0] median=0
    MetricEngine.compute(oppositeDir(0.1, 60), 'EX_SMILE');
    const late = MetricEngine.compute(oppositeDir(0.1, 70), 'EX_SMILE');
    expect(late.symmetryIndex).toBe(0);
  });

  it('smoothed symmetryIndex is null when every frame in the window is under movementFloor', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    let result = MetricEngine.compute(
      frame('REGION_MOUTH_CORNER', { u: 0.001, v: 0 }, { u: -0.001, v: 0 }, 0),
      'EX_SMILE',
    );
    result = MetricEngine.compute(
      frame('REGION_MOUTH_CORNER', { u: 0.002, v: 0 }, { u: -0.001, v: 0 }, 10),
      'EX_SMILE',
    );
    result = MetricEngine.compute(
      frame('REGION_MOUTH_CORNER', { u: 0.001, v: 0 }, { u: -0.002, v: 0 }, 20),
      'EX_SMILE',
    );
    expect(result.symmetryIndex).toBeNull();
  });

  it('filters nulls out of the window when computing smoothed symmetryIndex', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    MetricEngine.compute(
      frame('REGION_MOUTH_CORNER', { u: 0.001, v: 0 }, { u: -0.001, v: 0 }, 0),
      'EX_SMILE',
    ); // null
    const result = MetricEngine.compute(sameDir(0.05, 10), 'EX_SMILE'); // 1
    expect(result.symmetryIndex).toBe(1); // median of [null, 1] filtered -> median([1]) -> 1
  });

  it('even-length present window uses the average of the two middle values', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    // Two same-dir samples with SI 0.5 and 1.0 → even median (0.5+1)/2 = 0.75
    MetricEngine.compute(
      frame('REGION_MOUTH_CORNER', { u: 0.05, v: 0 }, { u: -0.1, v: 0 }, 0),
      'EX_SMILE',
    ); // SI=0.5
    const result = MetricEngine.compute(sameDir(0.1, 10), 'EX_SMILE'); // SI=1
    expect(result.symmetryIndex).toBeCloseTo(0.75, 6);
  });
});

describe('MetricEngine — gap > gapResetMs (250) resets smoothing + ease-off', () => {
  it('gap > 250 ms clears the trailing window so the next sample stands alone', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();

    for (let i = 0; i < 5; i++) {
      MetricEngine.compute(sameDir(0.05, i * 10), 'EX_SMILE'); // SI=1, effort=0.5
    }
    // Gap of 251ms from last (40) → 291; window reset, then process opposite SI=0 alone
    const afterGap = MetricEngine.compute(oppositeDir(0.1, 291), 'EX_SMILE');
    expect(afterGap.symmetryIndex).toBe(0);
    expect(afterGap.effortIndex).toBeCloseTo(1.0, 6);
  });

  it('gap of exactly 250 ms does NOT reset (boundary is strict >)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();

    MetricEngine.compute(sameDir(0.05, 0), 'EX_SMILE'); // SI=1
    // Gap exactly 250 — window kept; median of [1, 0] = 0.5 after null-filter? both present → 0.5
    const result = MetricEngine.compute(oppositeDir(0.1, 250), 'EX_SMILE'); // SI=0
    expect(result.symmetryIndex).toBeCloseTo(0.5, 6);
  });

  it('gap resets ease-off sustain accumulation (must re-sustain after gap)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();

    MetricEngine.compute(sameDir(0.07, 0), 'EX_SMILE'); // effort 0.7, start sustain
    MetricEngine.compute(sameDir(0.07, 200), 'EX_SMILE');
    expect(MetricEngine.isEaseOffActive()).toBe(false);

    // Gap 251ms from 200 → 451; clears sustain; high effort restarts timer at 451
    MetricEngine.compute(sameDir(0.07, 451), 'EX_SMILE');
    expect(MetricEngine.isEaseOffActive()).toBe(false);
    // Only 200ms into the NEW sustain — still not active
    MetricEngine.compute(sameDir(0.07, 651), 'EX_SMILE');
    expect(MetricEngine.isEaseOffActive()).toBe(false);
    // 300ms since 451
    MetricEngine.compute(sameDir(0.07, 751), 'EX_SMILE');
    expect(MetricEngine.isEaseOffActive()).toBe(true);
  });
});

describe('MetricEngine — ease-off (sustained > 0.60 for >= 300ms)', () => {
  it('isEaseOffActive() is false before any compute() call', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    expect(MetricEngine.isEaseOffActive()).toBe(false);
  });

  it('fires only once sustained above threshold for >= easeOffSustainMs (300ms)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    MetricEngine.compute(sameDir(0.07, 0), 'EX_SMILE'); // effort 0.7
    expect(MetricEngine.isEaseOffActive()).toBe(false);
    MetricEngine.compute(sameDir(0.07, 200), 'EX_SMILE');
    expect(MetricEngine.isEaseOffActive()).toBe(false);
    MetricEngine.compute(sameDir(0.07, 300), 'EX_SMILE');
    expect(MetricEngine.isEaseOffActive()).toBe(true);
  });

  it('resets the sustain timer and clears active state the moment effort drops back <= threshold', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    MetricEngine.compute(sameDir(0.07, 0), 'EX_SMILE');
    MetricEngine.compute(sameDir(0.03, 100), 'EX_SMILE'); // effort 0.3, drop
    expect(MetricEngine.isEaseOffActive()).toBe(false);
    MetricEngine.compute(sameDir(0.07, 150), 'EX_SMILE');
    MetricEngine.compute(sameDir(0.07, 300), 'EX_SMILE'); // only 150ms elapsed
    expect(MetricEngine.isEaseOffActive()).toBe(false);
    MetricEngine.compute(sameDir(0.07, 450), 'EX_SMILE'); // 300ms since 150
    expect(MetricEngine.isEaseOffActive()).toBe(true);
  });

  it('exactly at threshold (0.60) does not fire — boundary is strict >', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    MetricEngine.compute(sameDir(0.06, 0), 'EX_SMILE'); // effort exactly 0.6
    MetricEngine.compute(sameDir(0.06, 400), 'EX_SMILE');
    expect(MetricEngine.isEaseOffActive()).toBe(false);
  });
});

describe('MetricEngine — getLastRaw() (DebugHud, Task 8)', () => {
  it('is null before the first compute() call', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    expect(MetricEngine.getLastRaw()).toBeNull();
  });

  it('exposes the pre-smoothing raw values, distinct from the smoothed compute() result', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    MetricEngine.compute(sameDir(0.05, 0), 'EX_SMILE'); // raw SI=1, effort=0.5
    const smoothed = MetricEngine.compute(
      frame('REGION_MOUTH_CORNER', { u: 0.09, v: 0 }, { u: -0.01, v: 0 }, 10),
      'EX_SMILE',
    );
    const raw = MetricEngine.getLastRaw();
    expect(raw).not.toBeNull();
    expect(raw!.symmetryIndex).toBeCloseTo(0.01 / 0.09, 6);
    expect(raw!.effortIndex).toBeCloseTo(0.9, 6);
    expect(smoothed.symmetryIndex).not.toBeCloseTo(raw!.symmetryIndex!, 3);
    expect(smoothed.effortIndex).not.toBeCloseTo(raw!.effortIndex, 3);
  });
});

describe('MetricEngine — reset()', () => {
  it('reset() clears smoothing window, gap clock, and ease-off state but retains the active baseline', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    // Gaps ≤ 250ms so ease-off can actually sustain (gap would otherwise clear it).
    MetricEngine.compute(sameDir(0.07, 0), 'EX_SMILE');
    MetricEngine.compute(sameDir(0.07, 200), 'EX_SMILE');
    MetricEngine.compute(sameDir(0.07, 300), 'EX_SMILE');
    expect(MetricEngine.isEaseOffActive()).toBe(true);

    MetricEngine.reset();
    expect(MetricEngine.isEaseOffActive()).toBe(false);
    expect(MetricEngine.getLastRaw()).toBeNull();

    // Baseline retained; window cleared so single frame smoothed == raw.
    const result = MetricEngine.compute(
      frame('REGION_MOUTH_CORNER', { u: 0.02, v: 0 }, { u: -0.06, v: 0 }, 0),
      'EX_SMILE',
    );
    expect(result.symmetryIndex).toBeCloseTo(0.02 / 0.06, 6);
  });
});
