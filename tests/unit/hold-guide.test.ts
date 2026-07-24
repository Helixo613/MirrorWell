import { describe, expect, it } from 'vitest';
import { thresholds } from '@/config/thresholds';
import { holdGuide, shouldShowTeach, updateZoneTimer } from '@/screens/session/holdGuide';

describe('holdGuide', () => {
  const [zoneLow, zoneHigh] = thresholds.metrics.effortTargetZone;

  it('guides a gentle in-zone hold for the rep minimum duration', () => {
    expect(holdGuide(zoneLow, 0)).toEqual({
      phase: 'hold',
      holdRemainingMs: thresholds.reps.minDurationMs,
    });
    expect(holdGuide(zoneHigh, thresholds.reps.minDurationMs)).toEqual({
      phase: 'release',
      holdRemainingMs: 0,
    });
  });

  it('asks for a gentle raise below the zone and ease-back above it', () => {
    expect(holdGuide(zoneLow - thresholds.reps.endThreshold, 0)).toEqual({
      phase: 'raise',
      holdRemainingMs: thresholds.reps.minDurationMs,
    });
    expect(holdGuide(zoneHigh + thresholds.reps.endThreshold, 0)).toEqual({
      phase: 'easeBack',
      holdRemainingMs: thresholds.reps.minDurationMs,
    });
  });

  it('resets elapsed in-zone time on zone exit and a metric gap', () => {
    expect(updateZoneTimer(zoneLow, 700, 100, 600)).toEqual({
      enteredAtMs: 100,
      elapsedInZoneMs: 600,
    });
    expect(updateZoneTimer(zoneLow, 900, 100, 600)).toEqual({
      enteredAtMs: 900,
      elapsedInZoneMs: 0,
    });
    expect(updateZoneTimer(zoneLow - thresholds.reps.endThreshold, 700, 100, 600)).toEqual({
      enteredAtMs: null,
      elapsedInZoneMs: 0,
    });
  });
});

describe('teach visibility', () => {
  it('shows only the first visit to an exercise in this session', () => {
    const seen = new Set<import('@/data/schema').ExerciseId>(['EX_SMILE']);
    expect(shouldShowTeach(seen, 'EX_SMILE')).toBe(false);
    expect(shouldShowTeach(seen, 'EX_BROW_RAISE')).toBe(true);
  });
});
