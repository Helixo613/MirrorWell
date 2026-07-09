import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/schema';
import { MirrorWellError } from '../../src/data/errors';
import { StorageService } from '../../src/data/storage';
import type { CalibrationBaseline, SessionRecord, UserProfile } from '../../src/data/schema';
import type { SessionRecordInput } from '../../src/data/storage';

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const BASELINE_ID_OLD = '22222222-2222-4222-8222-222222222222';
const BASELINE_ID_NEW = '33333333-3333-4333-8333-333333333333';

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    profileId: PROFILE_ID,
    createdAt: '2026-07-01T09:00:00.000Z',
    affectedSide: 'left',
    assignedExercises: ['EX_SMILE', 'EX_BROW_RAISE'],
    attestedAt: null,
    consentVersion: null,
    ...overrides,
  };
}

function makeBaseline(overrides: Partial<CalibrationBaseline> = {}): CalibrationBaseline {
  return {
    baselineId: BASELINE_ID_NEW,
    profileId: PROFILE_ID,
    capturedAt: '2026-07-01T09:25:00.000Z',
    neutralStats: {
      REGION_BROW: { left: 0.418, right: 0.421 },
      REGION_EYELID: { left: 0.112, right: 0.108 },
      REGION_MOUTH_CORNER: { left: 0.507, right: 0.503 },
      REGION_LIP: { left: 0.231, right: 0.229 },
    },
    comfortableMax: { EX_SMILE: 0.092, EX_BROW_RAISE: 0.064 },
    qualityScore: 0.91,
    isActive: 1,
    ...overrides,
  };
}

function makeSessionInput(overrides: Partial<SessionRecordInput> = {}): SessionRecordInput {
  return {
    sessionId: 'a1a1a1a1-0000-4000-8000-000000000001',
    profileId: PROFILE_ID,
    baselineId: BASELINE_ID_NEW,
    startedAt: '2026-07-05T08:00:00.000Z',
    endedAt: '2026-07-05T08:06:47.000Z',
    endReason: 'completed',
    results: [
      {
        resultId: 'a1a1a1a1-0000-4000-8000-000000000002',
        exerciseId: 'EX_SMILE',
        repsCompleted: 1,
        meanSymmetryIndex: 0.66,
        meanEffortIndex: 0.43,
        easeOffCount: 0,
        lowQualityFramePct: 0.08,
        reps: [
          {
            repId: 'a1a1a1a1-0000-4000-8000-000000000003',
            repIndex: 0,
            peakSymmetryIndex: 0.71,
            peakEffortIndex: 0.47,
            durationMs: 1900,
            easeOffTriggered: 0,
          },
        ],
      },
    ],
    ...overrides,
  };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  vi.restoreAllMocks();
});

describe('StorageService — round-trip', () => {
  it('round-trips user_profile', async () => {
    await StorageService.saveProfile(makeProfile());
    expect(await StorageService.getProfile()).toEqual(makeProfile());
  });

  it('round-trips calibration_baseline', async () => {
    await StorageService.saveProfile(makeProfile());
    await StorageService.saveBaseline(makeBaseline());
    expect(await StorageService.getActiveBaseline()).toEqual(makeBaseline());
  });

  it('round-trips session_record, exercise_result, rep_metric via saveSession/getSessions', async () => {
    await StorageService.saveProfile(makeProfile());
    await StorageService.saveBaseline(makeBaseline());
    await StorageService.saveSession(makeSessionInput());
    const sessions = await StorageService.getSessions({ from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z' });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe('a1a1a1a1-0000-4000-8000-000000000001');
    expect(sessions[0].results[0].reps[0].repId).toBe('a1a1a1a1-0000-4000-8000-000000000003');
  });

  it('round-trips app_settings (schema-level, no service in Task 2 scope)', async () => {
    const row = {
      settingsId: 'singleton' as const,
      highContrast: false,
      textScale: 1.0,
      hapticsEnabled: true,
      audioCuesEnabled: true,
      reducedFacePreview: false,
      trendGranularity: 'monthly' as const,
      noiseFloorSymmetry: 0.05,
      showAffectedSideMarker: true,
      caregiverViewEnabled: false,
    };
    await db.app_settings.put(row);
    expect(await db.app_settings.get('singleton')).toEqual(row);
  });
});

describe('StorageService.saveBaseline', () => {
  it('deactivates the previous active row', async () => {
    await StorageService.saveProfile(makeProfile());
    await StorageService.saveBaseline(makeBaseline({ baselineId: BASELINE_ID_OLD }));
    await StorageService.saveBaseline(makeBaseline({ baselineId: BASELINE_ID_NEW }));

    const old = await db.calibration_baseline.get(BASELINE_ID_OLD);
    const fresh = await db.calibration_baseline.get(BASELINE_ID_NEW);
    expect(old?.isActive).toBe(0);
    expect(fresh?.isActive).toBe(1);
  });

  it('throws QUALITY_TOO_LOW for qualityScore 0.69', async () => {
    await StorageService.saveProfile(makeProfile());
    await expect(StorageService.saveBaseline(makeBaseline({ qualityScore: 0.69 }))).rejects.toMatchObject({
      code: 'QUALITY_TOO_LOW',
    });
    await expect(StorageService.saveBaseline(makeBaseline({ qualityScore: 0.69 }))).rejects.toBeInstanceOf(
      MirrorWellError,
    );
  });

  it('rejects comfortableMax keys outside assignedExercises', async () => {
    await StorageService.saveProfile(makeProfile({ assignedExercises: ['EX_SMILE'] }));
    await expect(
      StorageService.saveBaseline(makeBaseline({ comfortableMax: { EX_PUCKER: 0.05 } })),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('StorageService.saveSession — atomicity', () => {
  it('a forced mid-transaction failure leaves zero rows', async () => {
    await StorageService.saveProfile(makeProfile());
    await StorageService.saveBaseline(makeBaseline());

    vi.spyOn(db.rep_metric, 'add').mockRejectedValueOnce(new Error('simulated write failure'));

    await expect(StorageService.saveSession(makeSessionInput())).rejects.toBeTruthy();

    expect(await db.session_record.count()).toBe(0);
    expect(await db.exercise_result.count()).toBe(0);
    expect(await db.rep_metric.count()).toBe(0);
  });

  it('rejects an unknown baselineId', async () => {
    await StorageService.saveProfile(makeProfile());
    await expect(
      StorageService.saveSession(makeSessionInput({ baselineId: '99999999-9999-4999-8999-999999999999' })),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('StorageService.deleteAllData', () => {
  it('empties all six tables', async () => {
    await StorageService.saveProfile(makeProfile());
    await StorageService.saveBaseline(makeBaseline());
    await StorageService.saveSession(makeSessionInput());

    await StorageService.deleteAllData();

    for (const table of db.tables) {
      expect(await table.count()).toBe(0);
    }
  });
});

describe('StorageService.getSessions', () => {
  it('range-filters by startedAt', async () => {
    await StorageService.saveProfile(makeProfile());
    await StorageService.saveBaseline(makeBaseline());
    await StorageService.saveSession(makeSessionInput());

    const inRange = await StorageService.getSessions({
      from: '2026-07-04T00:00:00.000Z',
      to: '2026-07-06T00:00:00.000Z',
    });
    const outOfRange = await StorageService.getSessions({
      from: '2020-01-01T00:00:00.000Z',
      to: '2020-01-02T00:00:00.000Z',
    });

    expect(inRange).toHaveLength(1);
    expect(outOfRange).toHaveLength(0);
  });

  it('rejects from > to', async () => {
    await expect(
      StorageService.getSessions({ from: '2026-07-06T00:00:00.000Z', to: '2026-07-04T00:00:00.000Z' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
