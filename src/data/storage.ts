// src/data/storage.ts — sole owner of mirrorwell_db (docs/DATABASE.md §2).
// Every read/write goes through StorageService; no other component touches Dexie directly
// (AGENTS.md non-negotiable). Contracts: docs/API.md §3. Validation matrix: DATABASE.md §3.
// Explicit .ts extensions: these files also run under plain Node (scripts/seed-dev.ts,
// scripts/inspect-db.ts via `node --experimental-strip-types`), whose ESM loader requires
// fully-specified relative import extensions (unlike Vite/Vitest's bundler resolution).
import { db } from './schema.ts';
import type {
  AppSettings,
  CalibrationBaseline,
  ExerciseId,
  ExerciseResult,
  RegionId,
  RepMetric,
  SessionRecord,
  UserProfile,
} from './schema.ts';
import { MirrorWellError } from './errors.ts';
import { SafetyGate } from '../session/safety.ts';

export interface RepMetricInput extends Omit<RepMetric, 'resultId'> {}
export interface ExerciseResultInput extends Omit<ExerciseResult, 'sessionId'> {
  reps: RepMetricInput[];
}
export interface SessionRecordInput extends SessionRecord {
  results: ExerciseResultInput[];
}

export interface ExerciseResultFull extends ExerciseResult {
  reps: RepMetric[];
}
export interface SessionRecordFull extends SessionRecord {
  results: ExerciseResultFull[];
}

const EXERCISE_IDS: readonly ExerciseId[] = ['EX_BROW_RAISE', 'EX_EYE_CLOSURE', 'EX_SMILE', 'EX_PUCKER'];
const REGION_IDS: readonly RegionId[] = ['REGION_BROW', 'REGION_EYELID', 'REGION_MOUTH_CORNER', 'REGION_LIP'];
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function assertUuidV4(value: string, field: string): void {
  if (!UUID_V4_RE.test(value)) {
    throw new MirrorWellError('VALIDATION_FAILED', `${field} is not a valid uuid v4: ${value}`);
  }
}

function isValidIsoUtc(value: string): boolean {
  return typeof value === 'string' && ISO_UTC_RE.test(value) && !Number.isNaN(Date.parse(value));
}

function assertUnitRange(value: number, field: string): void {
  if (value < 0 || value > 1) {
    throw new MirrorWellError('VALIDATION_FAILED', `${field} must be in [0,1], got ${value}`);
  }
}

function assertDemoWritable(): void {
  if (SafetyGate.isDemoMode()) {
    throw new MirrorWellError('VALIDATION_FAILED', 'demo mode is read-only');
  }
}

function assertDemoReadable(): void {
  if (SafetyGate.isDemoMode()) {
    throw new MirrorWellError('VALIDATION_FAILED', 'demo mode cannot read saved data');
  }
}

async function withDbErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof MirrorWellError) throw err;
    throw new MirrorWellError('DB_UNAVAILABLE', err instanceof Error ? err.message : String(err));
  }
}

function assertProfileShape(p: UserProfile): void {
  assertUuidV4(p.profileId, 'profileId');
  if (!['left', 'right', 'unknown'].includes(p.affectedSide)) {
    throw new MirrorWellError('VALIDATION_FAILED', `invalid affectedSide: ${p.affectedSide}`);
  }
  if (p.assignedExercises.length === 0) {
    throw new MirrorWellError('VALIDATION_FAILED', 'assignedExercises must be non-empty');
  }
  const seen = new Set<string>();
  for (const ex of p.assignedExercises) {
    if (!EXERCISE_IDS.includes(ex)) {
      throw new MirrorWellError('VALIDATION_FAILED', `invalid exerciseId: ${ex}`);
    }
    if (seen.has(ex)) {
      throw new MirrorWellError('VALIDATION_FAILED', `duplicate exerciseId: ${ex}`);
    }
    seen.add(ex);
  }
}

function isFiniteVec(v: unknown): v is { u: number; v: number } {
  if (!v || typeof v !== 'object') return false;
  const o = v as { u?: unknown; v?: unknown };
  return Number.isFinite(o.u) && Number.isFinite(o.v);
}

function assertNeutralStats(stats: CalibrationBaseline['neutralStats']): void {
  for (const region of REGION_IDS) {
    const side = stats[region];
    if (!side || !isFiniteVec(side.left) || !isFiniteVec(side.right)) {
      throw new MirrorWellError(
        'VALIDATION_FAILED',
        `neutralStats.${region} missing or non-finite vector components`,
      );
    }
  }
}

function assertBaselineNoise(b: CalibrationBaseline): void {
  if (!Number.isFinite(b.noiseFloorSymmetry) || b.noiseFloorSymmetry < 0) {
    throw new MirrorWellError(
      'VALIDATION_FAILED',
      `noiseFloorSymmetry must be finite and >= 0, got ${b.noiseFloorSymmetry}`,
    );
  }
  if (!Number.isFinite(b.noiseFloorDisplacement) || b.noiseFloorDisplacement < 0) {
    throw new MirrorWellError(
      'VALIDATION_FAILED',
      `noiseFloorDisplacement must be finite and >= 0, got ${b.noiseFloorDisplacement}`,
    );
  }
}

function assertComfortableMax(max: CalibrationBaseline['comfortableMax'], assigned: ExerciseId[]): void {
  const assignedSet = new Set(assigned);
  for (const [key, value] of Object.entries(max)) {
    if (!assignedSet.has(key as ExerciseId)) {
      throw new MirrorWellError('VALIDATION_FAILED', `comfortableMax key ${key} not in assignedExercises`);
    }
    if (!Number.isFinite(value) || (value as number) <= 0) {
      throw new MirrorWellError('VALIDATION_FAILED', `comfortableMax.${key} must be finite and > 0`);
    }
  }
}

function assertSessionRecordInput(s: SessionRecordInput): void {
  assertUuidV4(s.sessionId, 'sessionId');
  assertUuidV4(s.profileId, 'profileId');
  assertUuidV4(s.baselineId, 'baselineId');
  if (!isValidIsoUtc(s.startedAt)) {
    throw new MirrorWellError('VALIDATION_FAILED', 'startedAt is not valid UTC ISO 8601');
  }
  if (!isValidIsoUtc(s.endedAt)) {
    throw new MirrorWellError('VALIDATION_FAILED', 'endedAt is not valid UTC ISO 8601');
  }
  if (s.endedAt < s.startedAt) {
    throw new MirrorWellError('VALIDATION_FAILED', 'endedAt must be >= startedAt');
  }
  for (const r of s.results) {
    assertUuidV4(r.resultId, 'resultId');
    if (!Number.isInteger(r.repsCompleted) || r.repsCompleted < 0) {
      throw new MirrorWellError('VALIDATION_FAILED', 'repsCompleted must be a non-negative integer');
    }
    if (r.meanSymmetryIndex !== null) assertUnitRange(r.meanSymmetryIndex, 'meanSymmetryIndex');
    if (r.meanEffortIndex !== null && r.meanEffortIndex < 0) {
      throw new MirrorWellError('VALIDATION_FAILED', 'meanEffortIndex must be >= 0');
    }
    if (!Number.isInteger(r.easeOffCount) || r.easeOffCount < 0) {
      throw new MirrorWellError('VALIDATION_FAILED', 'easeOffCount must be a non-negative integer');
    }
    assertUnitRange(r.lowQualityFramePct, 'lowQualityFramePct');
    for (const rep of r.reps) {
      assertUuidV4(rep.repId, 'repId');
      if (!Number.isInteger(rep.repIndex) || rep.repIndex < 0) {
        throw new MirrorWellError('VALIDATION_FAILED', 'repIndex must be a non-negative integer');
      }
      if (rep.peakSymmetryIndex !== null) assertUnitRange(rep.peakSymmetryIndex, 'peakSymmetryIndex');
      if (!(rep.peakEffortIndex >= 0)) {
        throw new MirrorWellError('VALIDATION_FAILED', 'peakEffortIndex must be >= 0');
      }
      if (!Number.isInteger(rep.durationMs) || rep.durationMs <= 0) {
        throw new MirrorWellError('VALIDATION_FAILED', 'durationMs must be a positive integer');
      }
      if (rep.easeOffTriggered !== 0 && rep.easeOffTriggered !== 1) {
        throw new MirrorWellError('VALIDATION_FAILED', 'easeOffTriggered must be 0 or 1');
      }
    }
  }
}

export const StorageService = {
  async getProfile(): Promise<UserProfile | null> {
    return withDbErrors(async () => {
      assertDemoReadable();
      const row = await db.user_profile.toCollection().first();
      return row ?? null;
    });
  },

  async saveProfile(p: UserProfile): Promise<void> {
    return withDbErrors(async () => {
      assertDemoWritable();
      assertProfileShape(p);
      await db.transaction('rw', db.user_profile, async () => {
        const existing = await db.user_profile.toCollection().first();
        if (existing && existing.profileId !== p.profileId) {
          throw new MirrorWellError('VALIDATION_FAILED', 'a different local profile already exists');
        }
        await db.user_profile.put(p);
      });
    });
  },

  async getSettings(): Promise<AppSettings | null> {
    return withDbErrors(async () => {
      assertDemoReadable();
      const row = await db.app_settings.get('singleton');
      return row ?? null;
    });
  },

  async saveSettings(settings: AppSettings): Promise<void> {
    return withDbErrors(async () => {
      assertDemoWritable();
      await db.app_settings.put(settings);
    });
  },

  async saveBaseline(b: CalibrationBaseline): Promise<string> {
    return withDbErrors(async () => {
      assertDemoWritable();
      assertUuidV4(b.baselineId, 'baselineId');
      assertUuidV4(b.profileId, 'profileId');
      assertUnitRange(b.qualityScore, 'qualityScore');
      if (b.qualityScore < 0.7) {
        throw new MirrorWellError(
          'QUALITY_TOO_LOW',
          `Calibration capture rejected: qualityScore ${b.qualityScore} < 0.7`,
        );
      }
      assertNeutralStats(b.neutralStats);
      assertBaselineNoise(b);

      await db.transaction('rw', db.calibration_baseline, db.user_profile, async () => {
        const profile = await db.user_profile.get(b.profileId);
        if (!profile) {
          throw new MirrorWellError('VALIDATION_FAILED', `unknown profileId: ${b.profileId}`);
        }
        assertComfortableMax(b.comfortableMax, profile.assignedExercises);

        // "Exactly one active" invariant: deactivate this profile's current active row
        // in the same transaction as the insert.
        await db.calibration_baseline
          .where({ profileId: b.profileId, isActive: 1 })
          .modify({ isActive: 0 });
        await db.calibration_baseline.add({ ...b, isActive: 1 });
      });

      return b.baselineId;
    });
  },

  async getActiveBaseline(): Promise<CalibrationBaseline | null> {
    return withDbErrors(async () => {
      assertDemoReadable();
      const row = await db.calibration_baseline.where('isActive').equals(1).first();
      return row ?? null;
    });
  },

  async saveSession(s: SessionRecordInput): Promise<string> {
    return withDbErrors(async () => {
      assertDemoWritable();
      assertSessionRecordInput(s);

      await db.transaction(
        'rw',
        db.session_record,
        db.exercise_result,
        db.rep_metric,
        db.user_profile,
        db.calibration_baseline,
        async () => {
          const profile = await db.user_profile.get(s.profileId);
          if (!profile) {
            throw new MirrorWellError('VALIDATION_FAILED', `unknown profileId: ${s.profileId}`);
          }
          const baseline = await db.calibration_baseline.get(s.baselineId);
          if (!baseline) {
            throw new MirrorWellError('VALIDATION_FAILED', `unknown baselineId: ${s.baselineId}`);
          }

          await db.session_record.add({
            sessionId: s.sessionId,
            profileId: s.profileId,
            baselineId: s.baselineId,
            startedAt: s.startedAt,
            endedAt: s.endedAt,
            endReason: s.endReason,
          });

          for (const r of s.results) {
            await db.exercise_result.add({
              resultId: r.resultId,
              sessionId: s.sessionId,
              exerciseId: r.exerciseId,
              repsCompleted: r.repsCompleted,
              meanSymmetryIndex: r.meanSymmetryIndex,
              meanEffortIndex: r.meanEffortIndex,
              easeOffCount: r.easeOffCount,
              lowQualityFramePct: r.lowQualityFramePct,
            });
            for (const rep of r.reps) {
              await db.rep_metric.add({
                repId: rep.repId,
                resultId: r.resultId,
                repIndex: rep.repIndex,
                peakSymmetryIndex: rep.peakSymmetryIndex,
                peakEffortIndex: rep.peakEffortIndex,
                durationMs: rep.durationMs,
                easeOffTriggered: rep.easeOffTriggered,
              });
            }
          }
        },
      );

      return s.sessionId;
    });
  },

  async getSessions(range: { from: string; to: string }): Promise<SessionRecordFull[]> {
    return withDbErrors(async () => {
      assertDemoReadable();
      if (!isValidIsoUtc(range.from) || !isValidIsoUtc(range.to)) {
        throw new MirrorWellError('VALIDATION_FAILED', 'malformed date in range');
      }
      if (range.from > range.to) {
        throw new MirrorWellError('VALIDATION_FAILED', 'range.from must be <= range.to');
      }

      const sessions = await db.session_record
        .where('startedAt')
        .between(range.from, range.to, true, true)
        .sortBy('startedAt');
      sessions.reverse(); // newest first

      const full: SessionRecordFull[] = [];
      for (const session of sessions) {
        const results = await db.exercise_result.where('sessionId').equals(session.sessionId).toArray();
        const resultsFull: ExerciseResultFull[] = await Promise.all(
          results.map(async (r) => ({
            ...r,
            reps: await db.rep_metric.where('resultId').equals(r.resultId).sortBy('repIndex'),
          })),
        );
        full.push({ ...session, results: resultsFull });
      }
      return full;
    });
  },

  async deleteAllData(): Promise<void> {
    return withDbErrors(async () => {
      assertDemoWritable();
      // Dexie's typed transaction() overloads cap out below 6 explicit tables — pass
      // db.tables (all six) directly instead.
      await db.transaction('rw', db.tables, async () => {
        await Promise.all(db.tables.map((t) => t.clear()));
      });
    });
  },
};
