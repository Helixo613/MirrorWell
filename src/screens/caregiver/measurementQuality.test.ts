import { describe, expect, it } from 'vitest';
import { clearlyCapturedFraction } from '@/screens/caregiver/measurementQuality';
import type { SessionRecordFull } from '@/data/storage';

function session(...lowQualityFramePcts: number[]): SessionRecordFull {
  return {
    sessionId: 's',
    profileId: 'p',
    baselineId: 'b',
    startedAt: '2026-06-01T00:00:00.000Z',
    endedAt: '2026-06-01T00:05:00.000Z',
    endReason: 'completed',
    results: lowQualityFramePcts.map((lowQualityFramePct, i) => ({
      resultId: `r${i}`,
      sessionId: 's',
      exerciseId: 'EX_SMILE',
      repsCompleted: 10,
      meanSymmetryIndex: 0.6,
      meanEffortIndex: 0.4,
      easeOffCount: 0,
      lowQualityFramePct,
      reps: [],
    })),
  };
}

describe('clearlyCapturedFraction', () => {
  it('returns the complement of the averaged low-quality fraction across all results', () => {
    // avg lowQuality = (0.1 + 0.3) / 2 = 0.2 -> clearly captured = 0.8
    const result = clearlyCapturedFraction([session(0.1), session(0.3)]);
    expect(result).toBeCloseTo(0.8, 10);
  });

  it('averages across results within a session, not just across sessions', () => {
    // one session, two results: avg lowQuality = (0.2 + 0.4)/2 = 0.3 -> 0.7
    expect(clearlyCapturedFraction([session(0.2, 0.4)])).toBeCloseTo(0.7, 10);
  });

  it('returns null when there are no results to average', () => {
    expect(clearlyCapturedFraction([])).toBeNull();
    expect(clearlyCapturedFraction([session()])).toBeNull();
  });
});
