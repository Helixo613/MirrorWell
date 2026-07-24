import { describe, expect, it } from 'vitest';
import type { SessionRecordFull } from '@/data/storage';
import { milestonesFrom } from '@/screens/home/milestones';

function record(startedAt: string, easeOffTriggered: 0 | 1 = 0): SessionRecordFull {
  return {
    sessionId: startedAt,
    profileId: 'profile',
    baselineId: 'baseline',
    startedAt,
    endedAt: startedAt,
    endReason: 'completed',
    results: [
      {
        resultId: startedAt,
        sessionId: startedAt,
        exerciseId: 'EX_SMILE',
        repsCompleted: 1,
        meanSymmetryIndex: null,
        meanEffortIndex: null,
        easeOffCount: easeOffTriggered,
        lowQualityFramePct: 0,
        reps: [
          {
            repId: startedAt,
            resultId: startedAt,
            repIndex: 0,
            peakSymmetryIndex: null,
            peakEffortIndex: 0,
            durationMs: 1,
            easeOffTriggered,
          },
        ],
      },
    ],
  };
}

describe('milestonesFrom', () => {
  it('awards the first-session milestone for any session history', () => {
    expect(milestonesFrom([record('2026-07-24T12:00:00.000Z')])[0]).toMatchObject({
      id: 'first_session',
      achieved: true,
    });
  });

  it('waits for the tenth session', () => {
    const nine = Array.from({ length: 9 }, (_, index) =>
      record(`2026-07-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`),
    );
    expect(milestonesFrom(nine).find((milestone) => milestone.id === 'sessions_10')?.achieved).toBe(false);
    expect(milestonesFrom([...nine, record('2026-07-10T12:00:00.000Z')]).find((milestone) => milestone.id === 'sessions_10')?.achieved).toBe(true);
  });

  it('requires a full four-week local-date span', () => {
    expect(milestonesFrom([
      record('2026-06-27T12:00:00.000Z'),
      record('2026-07-24T12:00:00.000Z'),
    ]).find((milestone) => milestone.id === 'weeks_4')?.achieved).toBe(false);
    expect(milestonesFrom([
      record('2026-06-26T12:00:00.000Z'),
      record('2026-07-24T12:00:00.000Z'),
    ]).find((milestone) => milestone.id === 'weeks_4')?.achieved).toBe(true);
  });

  it('counts only reps without an ease-off cue toward gentle practice', () => {
    const gentle = Array.from({ length: 100 }, () => record('2026-07-24T12:00:00.000Z'));
    expect(milestonesFrom(gentle).find((milestone) => milestone.id === 'gentle_100')?.achieved).toBe(true);
    expect(milestonesFrom([...gentle.slice(0, 99), record('2026-07-24T12:01:00.000Z', 1)]).find((milestone) => milestone.id === 'gentle_100')?.achieved).toBe(false);
  });
});
