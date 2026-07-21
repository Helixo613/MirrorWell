import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, MirrorWellDB } from '../../src/data/schema';
import { MirrorWellError } from '../../src/data/errors';
import { StorageService } from '../../src/data/storage';
import { SafetyGate } from '../../src/session/safety';
import { seedDev } from '../../src/dev/seed';
import type { CalibrationBaseline, UserProfile } from '../../src/data/schema';
import type { SessionRecordInput } from '../../src/data/storage';

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROFILE_ID = '44444444-4444-4444-8444-444444444444';
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
      REGION_BROW: { left: { u: 0.0, v: 0.418 }, right: { u: 0.0, v: 0.421 } },
      REGION_EYELID: { left: { u: 0.0, v: 0.112 }, right: { u: 0.0, v: 0.108 } },
      // Signed face-local projections are legitimately negative (DATABASE.md §3).
      REGION_MOUTH_CORNER: { left: { u: 0.507, v: 0.05 }, right: { u: -0.503, v: 0.05 } },
      REGION_LIP: { left: { u: 0.231, v: 0.08 }, right: { u: -0.229, v: 0.08 } },
    },
    comfortableMax: { EX_SMILE: 0.092, EX_BROW_RAISE: 0.064 },
    qualityScore: 0.91,
    noiseFloorSymmetry: 0.041,
    noiseFloorDisplacement: 0.008,
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

  it('round-trips app_settings (no noiseFloorSymmetry — lives on calibration_baseline)', async () => {
    const row = {
      settingsId: 'singleton' as const,
      highContrast: false,
      textScale: 1.0,
      hapticsEnabled: true,
      audioCuesEnabled: true,
      reducedFacePreview: false,
      trendGranularity: 'monthly' as const,
      showAffectedSideMarker: true,
      caregiverViewEnabled: false,
    };
    await db.app_settings.put(row);
    const got = await db.app_settings.get('singleton');
    expect(got).toEqual(row);
    expect(got).not.toHaveProperty('noiseFloorSymmetry');
  });
});

describe('StorageService.saveProfile', () => {
  it('rejects a different profileId and preserves the single existing profile', async () => {
    const original = makeProfile();
    await StorageService.saveProfile(original);

    await expect(
      StorageService.saveProfile(makeProfile({ profileId: OTHER_PROFILE_ID })),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    expect(await db.user_profile.toArray()).toEqual([original]);
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

  it('rejects non-finite vector components in neutralStats', async () => {
    await StorageService.saveProfile(makeProfile());
    await expect(
      StorageService.saveBaseline(
        makeBaseline({
          neutralStats: {
            REGION_BROW: { left: { u: Number.NaN, v: 0.4 }, right: { u: 0, v: 0.4 } },
            REGION_EYELID: { left: { u: 0, v: 0.1 }, right: { u: 0, v: 0.1 } },
            REGION_MOUTH_CORNER: { left: { u: 0.5, v: 0 }, right: { u: -0.5, v: 0 } },
            REGION_LIP: { left: { u: 0.2, v: 0 }, right: { u: -0.2, v: 0 } },
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('accepts negative signed vector components in neutralStats', async () => {
    await StorageService.saveProfile(makeProfile());
    const baseline = makeBaseline({
      neutralStats: {
        REGION_BROW: { left: { u: -0.02, v: 0.4 }, right: { u: 0.02, v: 0.41 } },
        REGION_EYELID: { left: { u: 0, v: -0.05 }, right: { u: 0, v: -0.04 } },
        REGION_MOUTH_CORNER: { left: { u: 0.5, v: -0.3 }, right: { u: -0.5, v: -0.3 } },
        REGION_LIP: { left: { u: 0.2, v: -0.28 }, right: { u: -0.2, v: -0.28 } },
      },
    });
    await StorageService.saveBaseline(baseline);
    expect(await StorageService.getActiveBaseline()).toEqual(baseline);
  });

  it('rejects missing or negative baseline noise floors', async () => {
    await StorageService.saveProfile(makeProfile());
    await expect(
      StorageService.saveBaseline(makeBaseline({ noiseFloorSymmetry: -0.01 })),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      StorageService.saveBaseline(makeBaseline({ noiseFloorDisplacement: Number.NaN })),
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

  it('clears data visible through another open connection', async () => {
    await StorageService.saveProfile(makeProfile());
    const otherConnection = new MirrorWellDB();
    await otherConnection.open();

    try {
      expect(await otherConnection.user_profile.count()).toBe(1);

      await StorageService.deleteAllData();

      expect(await otherConnection.user_profile.count()).toBe(0);
    } finally {
      otherConnection.close();
    }
  });

  it('rolls back a mid-transaction failure and can retry successfully', async () => {
    await StorageService.saveProfile(makeProfile());
    await StorageService.saveBaseline(makeBaseline());
    await StorageService.saveSession(makeSessionInput());
    const countsBefore = await Promise.all(db.tables.map((table) => table.count()));
    const tablePrototype = Object.getPrototypeOf(db.exercise_result) as {
      clear(): Promise<void>;
    };
    const originalClear = tablePrototype.clear;
    const clear = vi.spyOn(tablePrototype, 'clear').mockImplementationOnce(async function (
      this: typeof db.exercise_result,
    ) {
      await originalClear.call(this);
      throw new Error('simulated delete failure');
    });

    await expect(StorageService.deleteAllData()).rejects.toMatchObject({ code: 'DB_UNAVAILABLE' });
    expect(await Promise.all(db.tables.map((table) => table.count()))).toEqual(countsBefore);

    clear.mockRestore();
    await expect(StorageService.deleteAllData()).resolves.toBeUndefined();
    expect(await Promise.all(db.tables.map((table) => table.count()))).toEqual(
      db.tables.map(() => 0),
    );
  });
});

describe('Demo Mode isolation', () => {
  it('blocks every sensitive read and leaves seeded history unchanged when writes are attempted', async () => {
    import.meta.env.VITE_CONSENT_VERSION = '1';
    await seedDev();
    const profile = (await StorageService.getProfile())!;
    const baseline = (await StorageService.getActiveBaseline())!;
    const sessions = await StorageService.getSessions({
      from: '1970-01-01T00:00:00.000Z',
      to: new Date().toISOString(),
    });
    const countsBefore = await Promise.all(db.tables.map((table) => table.count()));

    SafetyGate.enterDemoMode();

    for (const read of [
      () => StorageService.getProfile(),
      () => StorageService.getSettings(),
      () => StorageService.getActiveBaseline(),
      () => StorageService.getSessions({ from: '1970-01-01T00:00:00.000Z', to: new Date().toISOString() }),
    ]) {
      await expect(read()).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    }

    for (const write of [
      () => StorageService.saveProfile(profile),
      () => StorageService.saveSettings({
        settingsId: 'singleton',
        highContrast: false,
        textScale: 1,
        hapticsEnabled: true,
        audioCuesEnabled: true,
        reducedFacePreview: false,
        trendGranularity: 'monthly',
        showAffectedSideMarker: true,
        caregiverViewEnabled: false,
      }),
      () => StorageService.saveBaseline(baseline),
      () => StorageService.saveSession({ ...sessions[0]!, results: sessions[0]!.results.map((result) => ({ ...result, reps: result.reps })) }),
      () => StorageService.deleteAllData(),
    ]) {
      await expect(write()).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    }

    expect(await Promise.all(db.tables.map((table) => table.count()))).toEqual(countsBefore);

    await SafetyGate.recordAttestation('1');
  });

  it('treats demo as unattested, then recordAttestation exits demo and persists attestation', async () => {
    import.meta.env.VITE_CONSENT_VERSION = '1';
    await StorageService.saveProfile(makeProfile());
    SafetyGate.enterDemoMode();

    await expect(SafetyGate.isAttested()).resolves.toBe(false);
    await expect(SafetyGate.recordAttestation('1')).resolves.toBeUndefined();

    expect(SafetyGate.isDemoMode()).toBe(false);
    await expect(SafetyGate.isAttested()).resolves.toBe(true);
    expect(await StorageService.getProfile()).toMatchObject({ consentVersion: '1' });
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
