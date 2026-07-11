import { SafetyGate } from '@/session/safety';
import {
  db,
  type CalibrationBaseline,
  type ExerciseId,
  type ExerciseResultFull,
  type RegionId,
  type SessionRecordFull,
  type UserProfile,
} from '@/data/schema';
import { MirrorWellError } from '@/data/errors';
import { thresholds } from '@/config/thresholds';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_EXERCISES: ReadonlySet<ExerciseId> = new Set([
  'EX_BROW_RAISE',
  'EX_EYE_CLOSURE',
  'EX_SMILE',
  'EX_PUCKER',
]);

const ALL_REGIONS: RegionId[] = [
  'REGION_BROW',
  'REGION_EYELID',
  'REGION_MOUTH_CORNER',
  'REGION_LIP',
];

function assertDbOpen(): void {
  if (!db.isOpen()) {
    throw new MirrorWellError(
      'DB_UNAVAILABLE',
      'IndexedDB is not available in this browser context',
      false,
    );
  }
}

function validateProfile(profile: UserProfile): void {
  if (!UUID_RE.test(profile.profileId)) {
    throw new MirrorWellError(
      'VALIDATION_FAILED',
      'profileId must be uuid v4',
      true,
    );
  }
  if (!['left', 'right', 'unknown'].includes(profile.affectedSide)) {
    throw new MirrorWellError(
      'VALIDATION_FAILED',
      'invalid affectedSide',
      true,
    );
  }
  if (profile.assignedExercises.length === 0) {
    throw new MirrorWellError(
      'VALIDATION_FAILED',
      'assignedExercises must be non-empty',
      true,
    );
  }
  const seen = new Set<ExerciseId>();
  for (const id of profile.assignedExercises) {
    if (!VALID_EXERCISES.has(id)) {
      throw new MirrorWellError(
        'VALIDATION_FAILED',
        `unknown exerciseId: ${id}`,
        true,
      );
    }
    if (seen.has(id)) {
      throw new MirrorWellError(
        'VALIDATION_FAILED',
        'duplicate assignedExercises entry',
        true,
      );
    }
    seen.add(id);
  }
}

function validateBaseline(
  baseline: CalibrationBaseline,
  profile: UserProfile | null,
): void {
  if (!UUID_RE.test(baseline.baselineId)) {
    throw new MirrorWellError(
      'VALIDATION_FAILED',
      'baselineId must be uuid v4',
      true,
    );
  }
  if (baseline.qualityScore < thresholds.calibration.minQualityScore) {
    throw new MirrorWellError(
      'QUALITY_TOO_LOW',
      `qualityScore ${baseline.qualityScore} < ${thresholds.calibration.minQualityScore}`,
      true,
    );
  }
  for (const regionId of ALL_REGIONS) {
    const entry = baseline.neutralStats[regionId];
    if (
      !entry ||
      !Number.isFinite(entry.left) ||
      !Number.isFinite(entry.right) ||
      entry.left <= 0 ||
      entry.right <= 0
    ) {
      throw new MirrorWellError(
        'VALIDATION_FAILED',
        'invalid neutralStats',
        true,
      );
    }
  }
  const assigned = new Set(profile?.assignedExercises ?? []);
  for (const [exerciseId, value] of Object.entries(baseline.comfortableMax)) {
    if (!assigned.has(exerciseId as ExerciseId)) {
      throw new MirrorWellError(
        'VALIDATION_FAILED',
        'comfortableMax key not in assignedExercises',
        true,
      );
    }
    if (!Number.isFinite(value) || value <= 0) {
      throw new MirrorWellError(
        'VALIDATION_FAILED',
        'invalid comfortableMax value',
        true,
      );
    }
  }
}

function parseUtcIso(iso: string): Date | null {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function validateSessionDateRange(range: {
  from: string;
  to: string;
}): void {
  const from = parseUtcIso(range.from);
  const to = parseUtcIso(range.to);
  if (!from || !to) {
    throw new MirrorWellError(
      'VALIDATION_FAILED',
      'malformed session date range',
      true,
    );
  }
  if (from.getTime() > to.getTime()) {
    throw new MirrorWellError(
      'VALIDATION_FAILED',
      'session range from > to',
      true,
    );
  }
}

async function openDb(): Promise<void> {
  try {
    if (!db.isOpen()) {
      await db.open();
    }
  } catch {
    throw new MirrorWellError(
      'DB_UNAVAILABLE',
      'Failed to open mirrorwell_db',
      false,
    );
  }
}

export const StorageService = {
  async getProfile(): Promise<UserProfile | null> {
    await openDb();
    assertDbOpen();
    const rows = await db.user_profile.toArray();
    return rows[0] ?? null;
  },

  async saveProfile(profile: UserProfile): Promise<void> {
    if (SafetyGate.isDemoMode()) {
      throw new MirrorWellError(
        'VALIDATION_FAILED',
        'demo mode is read-only',
        true,
      );
    }
    validateProfile(profile);
    await openDb();
    assertDbOpen();
    await db.user_profile.put(profile);
  },

  async saveBaseline(baseline: CalibrationBaseline): Promise<string> {
    if (SafetyGate.isDemoMode()) {
      throw new MirrorWellError(
        'VALIDATION_FAILED',
        'demo mode is read-only',
        true,
      );
    }
    await openDb();
    assertDbOpen();
    const profile = await StorageService.getProfile();
    if (!profile || profile.profileId !== baseline.profileId) {
      throw new MirrorWellError(
        'VALIDATION_FAILED',
        'profileId mismatch',
        true,
      );
    }
    validateBaseline(baseline, profile);

    await db.transaction('rw', db.calibration_baseline, async () => {
      const actives = await db.calibration_baseline
        .where('isActive')
        .equals(1)
        .toArray();
      for (const row of actives) {
        await db.calibration_baseline.put({ ...row, isActive: 0 });
      }
      await db.calibration_baseline.put({ ...baseline, isActive: 1 });
    });

    return baseline.baselineId;
  },

  async getActiveBaseline(): Promise<CalibrationBaseline | null> {
    await openDb();
    assertDbOpen();
    const rows = await db.calibration_baseline
      .where('isActive')
      .equals(1)
      .toArray();
    return rows[0] ?? null;
  },

  async getSessions(range: {
    from: string;
    to: string;
  }): Promise<SessionRecordFull[]> {
    validateSessionDateRange(range);
    await openDb();
    assertDbOpen();

    const sessions = await db.session_record
      .where('startedAt')
      .between(range.from, range.to, true, true)
      .toArray();

    sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    const fullSessions: SessionRecordFull[] = [];
    for (const session of sessions) {
      const results = await db.exercise_result
        .where('sessionId')
        .equals(session.sessionId)
        .toArray();
      const resultsWithReps: ExerciseResultFull[] = [];
      for (const result of results) {
        const reps = await db.rep_metric
          .where('resultId')
          .equals(result.resultId)
          .sortBy('repIndex');
        resultsWithReps.push({ ...result, reps });
      }
      fullSessions.push({ ...session, results: resultsWithReps });
    }

    return fullSessions;
  },

  async saveSession(session: SessionRecordFull): Promise<string> {
    if (SafetyGate.isDemoMode()) {
      throw new MirrorWellError(
        'VALIDATION_FAILED',
        'demo mode is read-only',
        true,
      );
    }

    await openDb();
    assertDbOpen();

    const profile = await StorageService.getProfile();
    if (!profile || profile.profileId !== session.profileId) {
      throw new MirrorWellError(
        'VALIDATION_FAILED',
        'profileId mismatch',
        true,
      );
    }

    const baselineRow = await db.calibration_baseline.get(session.baselineId);
    if (!baselineRow) {
      throw new MirrorWellError(
        'VALIDATION_FAILED',
        'unknown baselineId',
        true,
      );
    }

    if (new Date(session.endedAt).getTime() < new Date(session.startedAt).getTime()) {
      throw new MirrorWellError(
        'VALIDATION_FAILED',
        'endedAt before startedAt',
        true,
      );
    }

    await db.transaction(
      'rw',
      db.session_record,
      db.exercise_result,
      db.rep_metric,
      async () => {
        await db.session_record.put({
          sessionId: session.sessionId,
          profileId: session.profileId,
          baselineId: session.baselineId,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          endReason: session.endReason,
        });

        for (const result of session.results) {
          await db.exercise_result.put({
            resultId: result.resultId,
            sessionId: session.sessionId,
            exerciseId: result.exerciseId,
            repsCompleted: result.repsCompleted,
            meanSymmetryIndex: result.meanSymmetryIndex,
            meanEffortIndex: result.meanEffortIndex,
            easeOffCount: result.easeOffCount,
            lowQualityFramePct: result.lowQualityFramePct,
          });

          for (const rep of result.reps) {
            await db.rep_metric.put(rep);
          }
        }
      },
    );

    return session.sessionId;
  },
};
