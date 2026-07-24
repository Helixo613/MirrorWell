import { describe, expect, it } from 'vitest';
import {
  aggregateWeek,
  plantStageForSessions,
  weekEndSunday,
  weekStartMonday,
} from '../../src/data/progressCard';
import type { SessionRecordFull } from '../../src/data/storage';
import type { RepMetric } from '../../src/data/schema';

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const BASELINE_ID = '22222222-2222-4222-8222-222222222222';

function rep(repIndex: number, easeOffTriggered: 0 | 1): RepMetric {
  return {
    repId: `c1c1c1c1-0000-4000-8000-${String(repIndex).padStart(12, '0')}`,
    resultId: 'b1b1b1b1-0000-4000-8000-000000000001',
    repIndex,
    peakSymmetryIndex: 0.8,
    peakEffortIndex: 0.4,
    durationMs: 1500,
    easeOffTriggered,
  };
}

function makeSession(
  startedAt: string,
  reps: RepMetric[],
  sessionOrdinal = 1,
): SessionRecordFull {
  const suffix = String(sessionOrdinal).padStart(12, '0');
  return {
    sessionId: `a1a1a1a1-0000-4000-8000-${suffix}`,
    profileId: PROFILE_ID,
    baselineId: BASELINE_ID,
    startedAt,
    endedAt: new Date(new Date(startedAt).getTime() + 6 * 60_000).toISOString(),
    endReason: 'completed',
    results: [
      {
        resultId: `b1b1b1b1-0000-4000-8000-${suffix}`,
        sessionId: `a1a1a1a1-0000-4000-8000-${suffix}`,
        exerciseId: 'EX_SMILE',
        repsCompleted: reps.length,
        meanSymmetryIndex: 0.8,
        meanEffortIndex: 0.4,
        easeOffCount: reps.filter((r) => r.easeOffTriggered === 1).length,
        lowQualityFramePct: 0.05,
        reps: reps.map((r) => ({
          ...r,
          resultId: `b1b1b1b1-0000-4000-8000-${suffix}`,
        })),
      },
    ],
  };
}

/** Local noon as ISO so week bucketing uses calendar day, not UTC midnight drift. */
function localNoonIso(year: number, month1: number, day: number): string {
  return new Date(year, month1 - 1, day, 12, 0, 0, 0).toISOString();
}

describe('weekStartMonday / weekEndSunday', () => {
  it('maps a Wednesday to the preceding Monday and that week’s Sunday', () => {
    // 2026-07-22 is a Wednesday; Monday is 2026-07-20, Sunday 2026-07-26.
    expect(weekStartMonday(localNoonIso(2026, 7, 22))).toBe('2026-07-20');
    expect(weekEndSunday('2026-07-20')).toBe('2026-07-26');
  });

  it('treats Sunday as the end of the week that started the prior Monday', () => {
    // 2026-07-26 is a Sunday → week start Monday 2026-07-20.
    expect(weekStartMonday(localNoonIso(2026, 7, 26))).toBe('2026-07-20');
  });

  it('treats Monday as the start of its own week', () => {
    expect(weekStartMonday(localNoonIso(2026, 7, 20))).toBe('2026-07-20');
  });
});

describe('plantStageForSessions', () => {
  it('is seed at 0, sprouts at 1, leaves at 2, blooms at 3+', () => {
    expect(plantStageForSessions(0)).toBe(0);
    expect(plantStageForSessions(1)).toBe(1);
    expect(plantStageForSessions(2)).toBe(2);
    expect(plantStageForSessions(3)).toBe(3);
    expect(plantStageForSessions(9)).toBe(3);
  });
});

describe('aggregateWeek', () => {
  // Fixed local "now": Wednesday 2026-07-22 → week Mon 2026-07-20 … Sun 2026-07-26.
  const now = new Date(2026, 6, 22, 15, 0, 0, 0);

  it('returns empty aggregates when there are no sessions', () => {
    expect(aggregateWeek([], now)).toEqual({
      weekStart: '2026-07-20',
      weekEnd: '2026-07-26',
      sessionCount: 0,
      gentle: 0,
      total: 0,
      plantStage: 0,
    });
  });

  it('counts only sessions whose local week matches the current Monday week', () => {
    const sessions = [
      makeSession(localNoonIso(2026, 7, 21), [rep(0, 0), rep(1, 0)], 1), // Tue in-week
      makeSession(localNoonIso(2026, 7, 23), [rep(0, 1)], 2), // Thu in-week
      makeSession(localNoonIso(2026, 7, 13), [rep(0, 0), rep(1, 0)], 3), // prior week — exclude
      makeSession(localNoonIso(2026, 7, 28), [rep(0, 0)], 4), // next week — exclude
    ];
    const data = aggregateWeek(sessions, now);
    expect(data.sessionCount).toBe(2);
    expect(data.gentle).toBe(2); // two gentle + one ease-off
    expect(data.total).toBe(3);
    expect(data.plantStage).toBe(2);
    expect(data.weekStart).toBe('2026-07-20');
    expect(data.weekEnd).toBe('2026-07-26');
  });

  it('aggregates gentleness across multiple sessions and exercises', () => {
    const multi: SessionRecordFull = {
      ...makeSession(localNoonIso(2026, 7, 22), [rep(0, 0)], 5),
      results: [
        {
          resultId: 'b1b1b1b1-0000-4000-8000-000000000005',
          sessionId: 'a1a1a1a1-0000-4000-8000-000000000005',
          exerciseId: 'EX_SMILE',
          repsCompleted: 2,
          meanSymmetryIndex: 0.8,
          meanEffortIndex: 0.4,
          easeOffCount: 1,
          lowQualityFramePct: 0.05,
          reps: [rep(0, 0), rep(1, 1)],
        },
        {
          resultId: 'b1b1b1b1-0000-4000-8000-000000000006',
          sessionId: 'a1a1a1a1-0000-4000-8000-000000000005',
          exerciseId: 'EX_BROW_RAISE',
          repsCompleted: 1,
          meanSymmetryIndex: 0.7,
          meanEffortIndex: 0.35,
          easeOffCount: 0,
          lowQualityFramePct: 0.05,
          reps: [rep(0, 0)],
        },
      ],
    };
    const data = aggregateWeek([multi], now);
    expect(data.sessionCount).toBe(1);
    expect(data.gentle).toBe(2);
    expect(data.total).toBe(3);
    expect(data.plantStage).toBe(1);
  });

  it('caps plant stage at bloom once the week has 3+ sessions', () => {
    const sessions = [21, 22, 23, 24].map((day, i) =>
      makeSession(localNoonIso(2026, 7, day), [rep(0, 0)], i + 1),
    );
    const data = aggregateWeek(sessions, now);
    expect(data.sessionCount).toBe(4);
    expect(data.plantStage).toBe(3);
  });
});
