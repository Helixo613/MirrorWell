import { describe, expect, it } from 'vitest';
import type { NormalizedFrame } from '../../src/metrics/normalize.ts';
import type { CalibrationBaseline, ExerciseId, RegionId } from '../../src/data/schema.ts';

/**
 * docs/TESTS.md §2: MetricEngine + RepDetector require 100% branch coverage (hard
 * requirement) — every branch below is deliberate, not incidental.
 */

function frame(regionId: RegionId, left: number, right: number, timestampMs = 0): NormalizedFrame {
  const regionDisplacements = {
    REGION_BROW: { left: 0, right: 0 },
    REGION_EYELID: { left: 0, right: 0 },
    REGION_MOUTH_CORNER: { left: 0, right: 0 },
    REGION_LIP: { left: 0, right: 0 },
  } as Record<RegionId, { left: number; right: number }>;
  regionDisplacements[regionId] = { left, right };
  return { regionDisplacements, timestampMs };
}

function baseline(comfortableMax: Partial<Record<ExerciseId, number>>): CalibrationBaseline {
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
    comfortableMax,
    qualityScore: 0.9,
    isActive: 1,
  };
}

describe('MetricEngine — NO_BASELINE', () => {
  it('compute() throws NO_BASELINE before setBaseline() is ever called', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    expect(() => MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.05, 0.05), 'EX_SMILE')).toThrow(
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

describe('MetricEngine — symmetryIndex / movementFloor', () => {
  it('maxD exactly at movementFloor (0.008) is NOT null (boundary is strict <)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    const result = MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.008, 0.008, 0), 'EX_SMILE');
    expect(result.symmetryIndex).toBe(1);
  });

  it('maxD below movementFloor yields null symmetryIndex but a real effortIndex', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    const result = MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.005, 0.003, 0), 'EX_SMILE');
    expect(result.symmetryIndex).toBeNull();
    expect(result.effortIndex).toBeCloseTo(0.05, 6);
  });

  it('uses displacement magnitude — a negative-displacement side does not escape [0,1]', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    const result = MetricEngine.compute(frame('REGION_MOUTH_CORNER', -0.06, 0.04, 0), 'EX_SMILE');
    expect(result.symmetryIndex).toBeCloseTo(0.04 / 0.06, 6);
    expect(result.effortIndex).toBeCloseTo(0.6, 6);
  });

  it('comfortableMax missing for the exerciseId defensively yields effortIndex 0, not NaN', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 })); // no EX_PUCKER key
    MetricEngine.reset();
    const result = MetricEngine.compute(frame('REGION_LIP', 0.05, 0.05, 0), 'EX_PUCKER');
    expect(result.effortIndex).toBe(0);
    expect(Number.isNaN(result.effortIndex)).toBe(false);
  });
});

describe('MetricEngine — 5-frame median smoothing', () => {
  it('a single-frame spike is killed by the rolling median (both SI and effort)', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();

    for (let i = 0; i < 4; i++) {
      MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.05, 0.05, i * 10), 'EX_SMILE');
    }
    // Spike: wildly asymmetric + high-effort single frame.
    const spike = MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.09, 0.01, 40), 'EX_SMILE');
    expect(spike.symmetryIndex).toBe(1); // median of [1,1,1,1,0.111] is still 1
    expect(spike.effortIndex).toBeCloseTo(0.5, 6); // median of [.5,.5,.5,.5,.9] is still .5

    // Two more normal frames slide the spike out of the window (exercises the
    // window-overflow shift branch) and confirm full recovery.
    MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.05, 0.05, 50), 'EX_SMILE');
    const after = MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.05, 0.05, 60), 'EX_SMILE');
    expect(after.symmetryIndex).toBe(1);
    expect(after.effortIndex).toBeCloseTo(0.5, 6);
  });

  it('smoothed symmetryIndex is null when every frame in the window is under movementFloor', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    let result = MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.001, 0.001, 0), 'EX_SMILE');
    result = MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.002, 0.001, 10), 'EX_SMILE');
    result = MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.001, 0.002, 20), 'EX_SMILE');
    expect(result.symmetryIndex).toBeNull();
  });

  it('filters nulls out of the window when computing smoothed symmetryIndex', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.001, 0.001, 0), 'EX_SMILE'); // null
    const result = MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.05, 0.05, 10), 'EX_SMILE'); // 1
    expect(result.symmetryIndex).toBe(1); // median of [null, 1] filtered -> median([1]) -> 1
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
    MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.07, 0.07, 0), 'EX_SMILE'); // effort 0.7
    expect(MetricEngine.isEaseOffActive()).toBe(false);
    MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.07, 0.07, 200), 'EX_SMILE');
    expect(MetricEngine.isEaseOffActive()).toBe(false);
    MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.07, 0.07, 300), 'EX_SMILE');
    expect(MetricEngine.isEaseOffActive()).toBe(true);
  });

  it('resets the sustain timer and clears active state the moment effort drops back <= threshold', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.07, 0.07, 0), 'EX_SMILE');
    MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.03, 0.03, 100), 'EX_SMILE'); // effort 0.3, drop
    expect(MetricEngine.isEaseOffActive()).toBe(false);
    // Cross threshold again and hold to 300ms+ — must count from THIS crossing, not the earlier one.
    MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.07, 0.07, 150), 'EX_SMILE');
    MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.07, 0.07, 300), 'EX_SMILE'); // only 150ms elapsed
    expect(MetricEngine.isEaseOffActive()).toBe(false);
    MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.07, 0.07, 450), 'EX_SMILE'); // 300ms since 150
    expect(MetricEngine.isEaseOffActive()).toBe(true);
  });

  it('exactly at threshold (0.60) does not fire — boundary is strict >', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.06, 0.06, 0), 'EX_SMILE'); // effort exactly 0.6
    MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.06, 0.06, 400), 'EX_SMILE');
    expect(MetricEngine.isEaseOffActive()).toBe(false);
  });
});

describe('MetricEngine — reset()', () => {
  it('reset() clears smoothing window and ease-off state but retains the active baseline', async () => {
    const { MetricEngine } = await import('../../src/metrics/metrics.ts');
    MetricEngine.setBaseline(baseline({ EX_SMILE: 0.1 }));
    MetricEngine.reset();
    // Build up ease-off state and a smoothing window.
    MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.07, 0.07, 0), 'EX_SMILE');
    MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.07, 0.07, 300), 'EX_SMILE');
    expect(MetricEngine.isEaseOffActive()).toBe(true);

    MetricEngine.reset();
    expect(MetricEngine.isEaseOffActive()).toBe(false);

    // Baseline retained: compute() must not throw NO_BASELINE after reset().
    // Window cleared: a single frame's smoothed value equals its own raw value exactly.
    const result = MetricEngine.compute(frame('REGION_MOUTH_CORNER', 0.02, 0.06, 0), 'EX_SMILE');
    expect(result.symmetryIndex).toBeCloseTo(0.02 / 0.06, 6);
  });
});
