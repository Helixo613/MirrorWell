import { SafetyGate } from '@/session/safety';
import { db, type ExerciseId, type UserProfile } from '@/data/schema';
import { MirrorWellError } from '@/data/errors';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_EXERCISES: ReadonlySet<ExerciseId> = new Set([
  'EX_BROW_RAISE',
  'EX_EYE_CLOSURE',
  'EX_SMILE',
  'EX_PUCKER',
]);

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
};
