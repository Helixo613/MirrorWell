import { describe, expect, it } from 'vitest';
import { buildTrendCaption, steadyPeriodLabels } from '@/lib/trendCaption';
import { strings } from '@/config/strings';
import type { TrendPoint } from '@/types/trends';

function point(
  periodStart: string,
  meanSymmetryIndex: number | null,
  aboveNoiseFloor: boolean,
): TrendPoint {
  return { periodStart, meanSymmetryIndex, sampleCount: 3, aboveNoiseFloor };
}

// buildTrendCaption lowercases the first letter of the exercise name (it appears mid-sentence),
// so the seed name 'Smile' surfaces as 'smile' in every caption.
const EX = 'Smile';
const ex = 'smile';

describe('buildTrendCaption', () => {
  it('reports still-collecting when fewer than two valid points exist', () => {
    const points = [point('2026-05-01', 0.6, true), point('2026-06-01', null, true)];
    expect(buildTrendCaption(EX, points, 'monthly')).toBe(
      strings.trends.caption.stillCollecting(ex),
    );
  });

  it('reports getting-more-even for a rising, above-noise-floor monthly series', () => {
    const points = [
      point('2026-05-01', 0.58, true),
      point('2026-06-01', 0.74, true),
    ];
    expect(buildTrendCaption(EX, points, 'monthly')).toBe(
      strings.trends.caption.gettingMoreEven(ex, strings.trends.rangeLabel.twoMonths),
    );
  });

  it('uses the few-weeks range label for a rising weekly series', () => {
    const points = [
      point('2026-06-01', 0.58, true),
      point('2026-06-08', 0.74, true),
    ];
    expect(buildTrendCaption(EX, points, 'weekly')).toBe(
      strings.trends.caption.gettingMoreEven(ex, strings.trends.rangeLabel.fewWeeks),
    );
  });

  it('reports holding-steady when all period-over-period change is sub-noise-floor', () => {
    // Second point aboveNoiseFloor:false => no meaningful change => steady, even though the
    // raw value rose (one series = one baseline; sub-noise-floor reads steady).
    const points = [
      point('2026-05-01', 0.6, true),
      point('2026-06-01', 0.72, false),
    ];
    expect(buildTrendCaption(EX, points, 'monthly')).toBe(
      strings.trends.caption.holdingSteady(ex),
    );
  });

  it('reports holding-steady when the series declines', () => {
    const points = [
      point('2026-05-01', 0.74, true),
      point('2026-06-01', 0.58, true),
    ];
    expect(buildTrendCaption(EX, points, 'monthly')).toBe(
      strings.trends.caption.holdingSteady(ex),
    );
  });
});

describe('steadyPeriodLabels', () => {
  it('labels only the non-first periods that are within measurement noise', () => {
    const points = [
      point('2026-04-01', 0.6, true), // index 0 excluded even if false
      point('2026-05-01', 0.61, false), // steady -> labelled
      point('2026-06-01', 0.75, true), // above floor -> not labelled
    ];
    const labels = steadyPeriodLabels(points, (periodStart) => `label:${periodStart}`);
    expect(labels).toEqual(['label:2026-05-01']);
  });

  it('never labels the first period, which has no prior to compare against', () => {
    const points = [point('2026-04-01', 0.6, false)];
    expect(steadyPeriodLabels(points, (p) => p)).toEqual([]);
  });
});
