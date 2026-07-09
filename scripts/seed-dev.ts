// scripts/seed-dev.ts — deterministic dev/demo seed data (docs/DATABASE.md §6).
// RULE (non-negotiable): dev/test-only. Excluded from the production bundle by never being
// imported from src/; the import.meta.env.PROD guard below is a defensive backstop for when
// this logic is reused by DebugHud's "seed" button in the browser (Task 8).
import 'fake-indexeddb/auto';
import { db } from '../src/data/schema.ts';
import type { CalibrationBaseline, EndReason, ExerciseId, UserProfile } from '../src/data/schema.ts';
import { StorageService, type SessionRecordInput } from '../src/data/storage.ts';
import { exercises } from '../src/config/exercises.ts';
import { inspectDb } from './inspect-db.ts';

// Vite injects import.meta.env; plain `node` execution leaves it undefined — guard both.
const viteEnv = (import.meta as unknown as { env?: { PROD?: boolean } }).env;
if (viteEnv?.PROD) {
  throw new Error('seed-dev must never run in a production build');
}

function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pseudoUuidV4(rng: () => number): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(rng() * 256));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const ALL_EXERCISES = Object.keys(exercises) as ExerciseId[];

export async function seedDev(): Promise<void> {
  const rng = mulberry32(42);
  await Promise.all(db.tables.map((t) => t.clear()));

  const profileId = pseudoUuidV4(rng);
  const profile: UserProfile = {
    profileId,
    createdAt: new Date(Date.now() - 45 * 86_400_000).toISOString(),
    affectedSide: 'left',
    assignedExercises: ALL_EXERCISES,
    attestedAt: new Date(Date.now() - 45 * 86_400_000).toISOString(),
    consentVersion: '1',
  };
  await StorageService.saveProfile(profile);

  const neutralStats: CalibrationBaseline['neutralStats'] = {
    REGION_BROW: { left: 0.42, right: 0.421 },
    REGION_EYELID: { left: 0.112, right: 0.108 },
    REGION_MOUTH_CORNER: { left: 0.507, right: 0.503 },
    REGION_LIP: { left: 0.231, right: 0.229 },
  };
  const comfortableMax: CalibrationBaseline['comfortableMax'] = Object.fromEntries(
    ALL_EXERCISES.map((ex) => [ex, 0.05 + rng() * 0.05]),
  );

  // Two baselines deliberately: old (inactive) and current (active), so "trends never mix
  // baselines" is testable against seeded data.
  const oldBaselineId = pseudoUuidV4(rng);
  await StorageService.saveBaseline({
    baselineId: oldBaselineId,
    profileId,
    capturedAt: new Date(Date.now() - 44 * 86_400_000).toISOString(),
    neutralStats,
    comfortableMax,
    qualityScore: 0.82,
    isActive: 1, // saveBaseline flips this to 0 once the active baseline below is saved
  });

  const activeBaselineId = pseudoUuidV4(rng);
  await StorageService.saveBaseline({
    baselineId: activeBaselineId,
    profileId,
    capturedAt: new Date(Date.now() - 40 * 86_400_000).toISOString(),
    neutralStats,
    comfortableMax,
    qualityScore: 0.91,
    isActive: 1,
  });

  // 6 weeks of sessions, oldest first, week 0 = 6 weeks ago .. week 5 = most recent.
  let qualityAbandonedUsed = false;
  const now = Date.now();
  for (let week = 0; week < 6; week++) {
    const sessionsThisWeek = 4 + Math.floor(rng() * 2); // 4-5
    const symmetryTrend = 0.58 + (0.74 - 0.58) * (week / 5);
    const easeOffTrend = Math.round(6 + (1 - 6) * (week / 5));

    for (let i = 0; i < sessionsThisWeek; i++) {
      const dayOffset = (5 - week) * 7 + Math.floor(rng() * 7);
      const startedAt = new Date(now - dayOffset * 86_400_000 - Math.floor(rng() * 6 * 3_600_000));
      const durationMin = 4 + rng() * 4;
      const endedAt = new Date(startedAt.getTime() + durationMin * 60_000);

      let endReason: EndReason = 'completed';
      if (week === 2 && i === 0 && !qualityAbandonedUsed) {
        endReason = 'quality_abandoned';
        qualityAbandonedUsed = true;
      } else if (rng() < 0.12) {
        endReason = 'user_stopped';
      }

      const results: SessionRecordInput['results'] = ALL_EXERCISES.map((exerciseId) => {
        const config = exercises[exerciseId]!;
        const meanSymmetryIndex = clamp01(symmetryTrend + (rng() * 0.08 - 0.04));
        const meanEffortIndex = 0.35 + rng() * 0.15;
        const easeOffCount = Math.max(0, easeOffTrend + Math.round(rng() * 2 - 1));
        const repsCompleted = config.repsPerSet;

        const reps = Array.from({ length: repsCompleted }, (_, repIndex) => ({
          repId: pseudoUuidV4(rng),
          repIndex,
          peakSymmetryIndex: clamp01(meanSymmetryIndex + (rng() * 0.1 - 0.05)),
          peakEffortIndex: meanEffortIndex + rng() * 0.1,
          durationMs: 1200 + Math.floor(rng() * 1000),
          easeOffTriggered: (repIndex < easeOffCount ? 1 : 0) as 0 | 1,
        }));

        return {
          resultId: pseudoUuidV4(rng),
          exerciseId,
          repsCompleted,
          meanSymmetryIndex,
          meanEffortIndex,
          easeOffCount,
          lowQualityFramePct: 0.05 + rng() * 0.15,
          reps,
        };
      });

      const session: SessionRecordInput = {
        sessionId: pseudoUuidV4(rng),
        profileId,
        baselineId: activeBaselineId,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        endReason,
        results,
      };
      await StorageService.saveSession(session);
    }
  }

  await db.app_settings.put({
    settingsId: 'singleton',
    highContrast: false,
    textScale: 1.0,
    hapticsEnabled: true,
    audioCuesEnabled: true,
    reducedFacePreview: false,
    trendGranularity: 'monthly',
    noiseFloorSymmetry: 0.04,
    showAffectedSideMarker: true,
    caregiverViewEnabled: true,
  });
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  await seedDev();
  console.log('Seeded mirrorwell_db (seed=42). Dumping via inspect-db in the same process:');
  console.log(JSON.stringify(await inspectDb(), null, 2));
}
