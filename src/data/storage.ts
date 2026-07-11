import { SafetyGate } from '@/session/safety';
import {
  db,
  type CalibrationBaseline,
  type ExerciseId,
  type RegionId,
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
};
