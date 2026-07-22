import { describe, expect, it } from 'vitest';
import {
  exportTrendDirection,
  exportTrendLatestLabel,
} from '@/lib/exportTrendRow';
import { strings } from '@/config/strings';
import { symmetryPlainLabel } from '@/lib/summaryMetrics';
import type { TrendPoint } from '@/types/trends';

function point(mean: number, aboveNoiseFloor: boolean): TrendPoint {
  return { periodStart: '2026-06-01', meanSymmetryIndex: mean, sampleCount: 4, aboveNoiseFloor };
}

describe('exportTrendDirection', () => {
  it('reads Steady with fewer than two points', () => {
    expect(exportTrendDirection([])).toBe(strings.trends.direction.steady);
    expect(exportTrendDirection([point(0.6, true)])).toBe(strings.trends.direction.steady);
  });

  it('reads Steady when the latest change is sub-noise-floor, even if the value rose', () => {
    expect(exportTrendDirection([point(0.5, true), point(0.7, false)])).toBe(
      strings.trends.direction.steady,
    );
  });

  it('reads More even for an above-floor rise', () => {
    expect(exportTrendDirection([point(0.5, true), point(0.7, true)])).toBe(
      strings.trends.direction.moreEven,
    );
  });

  it('reads Less even for an above-floor decline', () => {
    expect(exportTrendDirection([point(0.7, true), point(0.5, true)])).toBe(
      strings.trends.direction.lessEven,
    );
  });
});

describe('exportTrendLatestLabel', () => {
  it('returns an em-dash when there are no points', () => {
    expect(exportTrendLatestLabel([])).toBe('—');
  });

  it('labels the most recent point with the shared plain-language symmetry helper', () => {
    const points = [point(0.4, true), point(0.82, true)];
    expect(exportTrendLatestLabel(points)).toBe(symmetryPlainLabel(0.82));
  });
});
