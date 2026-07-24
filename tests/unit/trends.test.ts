import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/schema';
import { StorageService } from '../../src/data/storage';
import { TrendsService } from '../../src/data/trends';
import { MirrorWellError } from '../../src/data/errors';
import type { CalibrationBaseline, EndReason, ExerciseId, UserProfile } from '../../src/data/schema';
import type { SessionRecordInput } from '../../src/data/storage';

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const BASELINE_ID_OLD = '22222222-2222-4222-8222-222222222222';
const BASELINE_ID_NEW = '33333333-3333-4333-8333-333333333333';

const NEUTRAL_STATS: CalibrationBaseline['neutralStats'] = {
  REGION_BROW: { left: { u: 0.0, v: 0.418 }, right: { u: 0.0, v: 0.421 } },
  REGION_EYELID: { left: { u: 0.0, v: 0.112 }, right: { u: 0.0, v: 0.108 } },
  REGION_MOUTH_CORNER: { left: { u: 0.507, v: 0.05 }, right: { u: -0.503, v: 0.05 } },
  REGION_LIP: { left: { u: 0.231, v: 0.08 }, right: { u: -0.229, v: 0.08 } },
};

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    profileId: PROFILE_ID,
    createdAt: '2025-12-01T09:00:00.000Z',
    affectedSide: 'left',
    assignedExercises: ['EX_SMILE', 'EX_BROW_RAISE'],
    attestedAt: '2025-12-01T09:00:00.000Z',
    consentVersion: '1',
    ...overrides,
  };
}

function makeBaseline(overrides: Partial<CalibrationBaseline> = {}): CalibrationBaseline {
  return {
    baselineId: BASELINE_ID_NEW,
    profileId: PROFILE_ID,
    capturedAt: '2026-01-01T09:00:00.000Z',
    neutralStats: NEUTRAL_STATS,
    comfortableMax: { EX_SMILE: 0.092, EX_BROW_RAISE: 0.064 },
    qualityScore: 0.91,
    noiseFloorSymmetry: 0.05,
    noiseFloorDisplacement: 0.008,
    isActive: 1,
    ...overrides,
  };
}

let sessionCounter = 0;
function makeSession(opts: {
  baselineId: string;
  startedAt: string; // midday UTC to dodge any TZ boundary flip
  endReason?: EndReason;
  exerciseId?: ExerciseId;
  meanSymmetryIndex: number | null;
}): SessionRecordInput {
  sessionCounter += 1;
  const suffix = String(sessionCounter).padStart(12, '0');
  return {
    sessionId: `a1a1a1a1-0000-4000-8000-${suffix}`,
    profileId: PROFILE_ID,
    baselineId: opts.baselineId,
    startedAt: opts.startedAt,
    endedAt: new Date(new Date(opts.startedAt).getTime() + 6 * 60_000).toISOString(),
    endReason: opts.endReason ?? 'completed',
    results: [
      {
        resultId: `b1b1b1b1-0000-4000-8000-${suffix}`,
        exerciseId: opts.exerciseId ?? 'EX_SMILE',
        repsCompleted: 10,
        meanSymmetryIndex: opts.meanSymmetryIndex,
        meanEffortIndex: 0.4,
        easeOffCount: 0,
        lowQualityFramePct: 0.05,
        reps: [
          {
            repId: `c1c1c1c1-0000-4000-8000-${suffix}`,
            repIndex: 0,
            peakSymmetryIndex: opts.meanSymmetryIndex,
            peakEffortIndex: 0.4,
            durationMs: 1500,
            easeOffTriggered: 0,
          },
        ],
      },
    ],
  };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  sessionCounter = 0;
  vi.restoreAllMocks();
});

describe('TrendsService.getTrend', () => {
  it('scopes a series to the active baselineId only, excluding sessions under an older baseline', async () => {
    await StorageService.saveProfile(makeProfile());
    await StorageService.saveBaseline(makeBaseline({ baselineId: BASELINE_ID_OLD, noiseFloorSymmetry: 0.05 }));
    await StorageService.saveBaseline(makeBaseline({ baselineId: BASELINE_ID_NEW, noiseFloorSymmetry: 0.05 }));

    await StorageService.saveSession(
      makeSession({ baselineId: BASELINE_ID_OLD, startedAt: '2026-01-06T12:00:00.000Z', meanSymmetryIndex: 0.3 }),
    );
    await StorageService.saveSession(
      makeSession({ baselineId: BASELINE_ID_NEW, startedAt: '2026-01-07T12:00:00.000Z', meanSymmetryIndex: 0.7 }),
    );

    const series = await TrendsService.getTrend('EX_SMILE', 'monthly');

    expect(series.baselineId).toBe(BASELINE_ID_NEW);
    expect(series.points).toHaveLength(1);
    expect(series.points[0]).toMatchObject({
      periodStart: '2026-01-01',
      sampleCount: 1,
      meanSymmetryIndex: 0.7,
    });
  });

  it('excludes quality_abandoned and red_flag_stopped sessions from aggregation', async () => {
    await StorageService.saveProfile(makeProfile());
    await StorageService.saveBaseline(makeBaseline());

    await StorageService.saveSession(
      makeSession({ baselineId: BASELINE_ID_NEW, startedAt: '2026-01-06T12:00:00.000Z', meanSymmetryIndex: 0.6, endReason: 'completed' }),
    );
    await StorageService.saveSession(
      makeSession({ baselineId: BASELINE_ID_NEW, startedAt: '2026-01-08T12:00:00.000Z', meanSymmetryIndex: 0.9, endReason: 'quality_abandoned' }),
    );
    await StorageService.saveSession(
      makeSession({ baselineId: BASELINE_ID_NEW, startedAt: '2026-01-10T12:00:00.000Z', meanSymmetryIndex: 0.9, endReason: 'red_flag_stopped' }),
    );

    const series = await TrendsService.getTrend('EX_SMILE', 'monthly');

    expect(series.points).toHaveLength(1);
    expect(series.points[0].sampleCount).toBe(1);
    expect(series.points[0].meanSymmetryIndex).toBe(0.6);
  });

  it('marks aboveNoiseFloor false below the active baseline noise floor and true above it', async () => {
    await StorageService.saveProfile(makeProfile());
    await StorageService.saveBaseline(makeBaseline({ noiseFloorSymmetry: 0.05 }));

    await StorageService.saveSession(
      makeSession({ baselineId: BASELINE_ID_NEW, startedAt: '2026-01-06T12:00:00.000Z', meanSymmetryIndex: 0.6 }),
    );
    await StorageService.saveSession(
      makeSession({ baselineId: BASELINE_ID_NEW, startedAt: '2026-02-06T12:00:00.000Z', meanSymmetryIndex: 0.62 }), // delta 0.02 < 0.05
    );
    await StorageService.saveSession(
      makeSession({ baselineId: BASELINE_ID_NEW, startedAt: '2026-03-06T12:00:00.000Z', meanSymmetryIndex: 0.7 }), // delta 0.08 >= 0.05
    );
    await StorageService.saveSession(
      // delta -0.07 (a real decline whose magnitude clears the noise floor) — must read as
      // aboveNoiseFloor: true, not "steady". A signed (rather than absolute) comparison would
      // wrongly mark a decline of this size as sub-noise-floor.
      makeSession({ baselineId: BASELINE_ID_NEW, startedAt: '2026-04-06T12:00:00.000Z', meanSymmetryIndex: 0.63 }),
    );

    const series = await TrendsService.getTrend('EX_SMILE', 'monthly');

    expect(series.points).toHaveLength(4);
    expect(series.points[0].aboveNoiseFloor).toBe(true); // no prior period to compare
    expect(series.points[1].aboveNoiseFloor).toBe(false);
    expect(series.points[2].aboveNoiseFloor).toBe(true);
    expect(series.points[3].aboveNoiseFloor).toBe(true); // decline, magnitude above noise floor
  });

  it('marks aboveNoiseFloor true when the period-over-period delta equals noiseFloorSymmetry exactly', async () => {
    // 0.75 - 0.5 === 0.25 is exact in IEEE 754 (all three are exact binary fractions), so this
    // hits the boundary bit-for-bit rather than approximately. Spec: false only when change is
    // strictly < the floor, so an exact-equal delta must read true (>=, not >).
    await StorageService.saveProfile(makeProfile());
    await StorageService.saveBaseline(makeBaseline({ noiseFloorSymmetry: 0.25 }));

    await StorageService.saveSession(
      makeSession({ baselineId: BASELINE_ID_NEW, startedAt: '2026-01-06T12:00:00.000Z', meanSymmetryIndex: 0.5 }),
    );
    await StorageService.saveSession(
      makeSession({ baselineId: BASELINE_ID_NEW, startedAt: '2026-02-06T12:00:00.000Z', meanSymmetryIndex: 0.75 }),
    );

    const series = await TrendsService.getTrend('EX_SMILE', 'monthly');

    expect(series.points[1].meanSymmetryIndex - series.points[0].meanSymmetryIndex).toBe(0.25);
    expect(series.points[1].aboveNoiseFloor).toBe(true);
  });

  it('propagates DB_UNAVAILABLE from StorageService.getActiveBaseline', async () => {
    vi.spyOn(StorageService, 'getActiveBaseline').mockRejectedValueOnce(
      new MirrorWellError('DB_UNAVAILABLE', 'simulated outage'),
    );

    await expect(TrendsService.getTrend('EX_SMILE', 'monthly')).rejects.toMatchObject({
      code: 'DB_UNAVAILABLE',
    });
  });

  it('reads the noise floor from calibration_baseline, never app_settings (which has no such field)', async () => {
    await StorageService.saveProfile(makeProfile());
    // AppSettings structurally has no noiseFloorSymmetry field (DATABASE.md §2) — seed it anyway
    // to prove the computation below cannot be coming from here.
    await db.app_settings.put({
      settingsId: 'singleton',
      highContrast: false,
      textScale: 1.0,
      hapticsEnabled: true,
      audioCuesEnabled: true,
      voiceCoachEnabled: false,
      reducedFacePreview: false,
      trendGranularity: 'monthly',
      showAffectedSideMarker: true,
      caregiverViewEnabled: false,
      remindersEnabled: false,
      reminderTime: '09:00',
    });
    // Same 0.02 delta that read as sub-noise-floor (false) against a 0.05 baseline noise floor
    // above; a smaller baseline noise floor of 0.01 must flip it to true, proving the source.
    await StorageService.saveBaseline(makeBaseline({ noiseFloorSymmetry: 0.01 }));

    await StorageService.saveSession(
      makeSession({ baselineId: BASELINE_ID_NEW, startedAt: '2026-01-06T12:00:00.000Z', meanSymmetryIndex: 0.6 }),
    );
    await StorageService.saveSession(
      makeSession({ baselineId: BASELINE_ID_NEW, startedAt: '2026-02-06T12:00:00.000Z', meanSymmetryIndex: 0.62 }),
    );

    const series = await TrendsService.getTrend('EX_SMILE', 'monthly');

    expect(series.points[1].aboveNoiseFloor).toBe(true);
  });

  it('buckets weekly by Monday-start week and monthly by calendar month, with correct sampleCount', async () => {
    await StorageService.saveProfile(makeProfile());
    await StorageService.saveBaseline(makeBaseline());

    await StorageService.saveSession(
      makeSession({ baselineId: BASELINE_ID_NEW, startedAt: '2026-01-05T12:00:00.000Z', meanSymmetryIndex: 0.5 }),
    );
    await StorageService.saveSession(
      makeSession({ baselineId: BASELINE_ID_NEW, startedAt: '2026-01-12T12:00:00.000Z', meanSymmetryIndex: 0.6 }),
    );
    await StorageService.saveSession(
      makeSession({ baselineId: BASELINE_ID_NEW, startedAt: '2026-02-02T12:00:00.000Z', meanSymmetryIndex: 0.7 }),
    );

    const monthly = await TrendsService.getTrend('EX_SMILE', 'monthly');
    expect(monthly.points.map((p) => [p.periodStart, p.sampleCount])).toEqual([
      ['2026-01-01', 2],
      ['2026-02-01', 1],
    ]);

    const weekly = await TrendsService.getTrend('EX_SMILE', 'weekly');
    expect(weekly.points.map((p) => [p.periodStart, p.sampleCount])).toEqual([
      ['2026-01-05', 1],
      ['2026-01-12', 1],
      ['2026-02-02', 1],
    ]);
  });

  it('rejects an unknown exerciseId with VALIDATION_FAILED', async () => {
    await expect(TrendsService.getTrend('EX_NOT_REAL' as ExerciseId, 'monthly')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});

describe('TrendsService.getAdherence', () => {
  it('computes sessionsPerWeek and completionRate over a multi-week range, counting non-completed sessions in the denominator only', async () => {
    await StorageService.saveProfile(makeProfile());
    await StorageService.saveBaseline(makeBaseline());

    // Week 1 (Mon 2026-01-05 .. Sun 2026-01-11): 2 completed.
    await StorageService.saveSession(
      makeSession({ baselineId: BASELINE_ID_NEW, startedAt: '2026-01-05T12:00:00.000Z', meanSymmetryIndex: 0.5 }),
    );
    await StorageService.saveSession(
      makeSession({ baselineId: BASELINE_ID_NEW, startedAt: '2026-01-07T12:00:00.000Z', meanSymmetryIndex: 0.5 }),
    );
    // Week 2 (Mon 2026-01-12 .. Sun 2026-01-18): 1 completed + 1 quality_abandoned.
    await StorageService.saveSession(
      makeSession({ baselineId: BASELINE_ID_NEW, startedAt: '2026-01-13T12:00:00.000Z', meanSymmetryIndex: 0.5 }),
    );
    await StorageService.saveSession(
      makeSession({
        baselineId: BASELINE_ID_NEW,
        startedAt: '2026-01-14T12:00:00.000Z',
        meanSymmetryIndex: 0.5,
        endReason: 'quality_abandoned',
      }),
    );
    // Week 3 (Mon 2026-01-19 .. Sun 2026-01-25): 1 user_stopped.
    await StorageService.saveSession(
      makeSession({
        baselineId: BASELINE_ID_NEW,
        startedAt: '2026-01-20T12:00:00.000Z',
        meanSymmetryIndex: 0.5,
        endReason: 'user_stopped',
      }),
    );

    // Midday UTC, matching makeSession's convention above — dodges the TZ boundary flip that a
    // midnight-literal range would hit (a UTC-midnight instant is still the previous local
    // calendar day in any negative-offset timezone, e.g. US zones, shifting which Monday-start
    // week the range boundary falls into).
    const adherence = await TrendsService.getAdherence({
      from: '2026-01-05T12:00:00.000Z',
      to: '2026-01-25T12:00:00.000Z',
    });

    expect(adherence.sessionsPerWeek).toEqual([2, 2, 1]);
    expect(adherence.completionRate).toBeCloseTo(3 / 5);
  });

  it('rejects a malformed range with VALIDATION_FAILED (propagated from StorageService)', async () => {
    await expect(
      TrendsService.getAdherence({ from: 'not-a-date', to: '2026-01-01T00:00:00.000Z' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('propagates DB_UNAVAILABLE from StorageService.getSessions', async () => {
    vi.spyOn(StorageService, 'getSessions').mockRejectedValueOnce(
      new MirrorWellError('DB_UNAVAILABLE', 'simulated outage'),
    );

    await expect(
      TrendsService.getAdherence({ from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T00:00:00.000Z' }),
    ).rejects.toMatchObject({ code: 'DB_UNAVAILABLE' });
  });
});
