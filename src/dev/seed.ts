// src/dev/seed.ts, deterministic dev/demo seed data (docs/DATABASE.md §6). Browser-safe: no
// fake-indexeddb import, no `process` usage. Two callers:
//   - scripts/seed-dev.ts (Node CLI): imports 'fake-indexeddb/auto' FIRST, then this module.
//   - src/dev/DebugHud.tsx / DebugOverlay.tsx (browser "seed" button): imports this module
//     directly, so it writes to the REAL browser IndexedDB. This file must never import
//     fake-indexeddb itself, doing so would clobber globalThis.indexedDB in the browser too
//     (docs/BACKEND.md §5).
// RULE (non-negotiable): dev/test-only. src/dev/ is excluded from production bundles
// (import.meta.env.DEV dead-branch elimination, same mechanism as CaptureHarness); the
// import.meta.env.PROD guard inside seedDev() below is a defensive backstop. It lives INSIDE
// the function body, not at module top level: a top-level throw is an unconditional side
// effect that defeats tree-shaking (esbuild must keep it even when seedDev() itself is never
// called), which is exactly what Task 8's "no HUD code in the prod bundle" grep test catches.
//
// V2.8 demo profile: ~60 days ending today, 4–6 sessions/week with missed days, symmetry
// mean 0.55 → 0.78, declining easeOffCount. All rows go through StorageService (never raw
// Dexie writes). Deterministic mulberry32(42) so every demo shows identical charts.
import { db } from '../data/schema.ts';
import type { CalibrationBaseline, EndReason, UserProfile } from '../data/schema.ts';
import { StorageService, type SessionRecordInput } from '../data/storage.ts';
import { exercises, assignableExercises } from '../config/exercises.ts';

/** Inline mulberry32: no dependency. Same seed every run → identical demo charts. */
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

/** Pick `count` distinct day-of-week offsets (0–6) via Fisher–Yates; leaves 1–3 missed days. */
function pickDistinctDays(rng: () => number, count: number): number[] {
  const days = [0, 1, 2, 3, 4, 5, 6];
  for (let i = days.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = days[i]!;
    days[i] = days[j]!;
    days[j] = tmp;
  }
  return days.slice(0, count);
}

export async function seedDev(): Promise<void> {
  // Vite injects import.meta.env; plain `node` execution (the scripts/seed-dev.ts CLI
  // wrapper) leaves it undefined, guard both.
  const viteEnv = (import.meta as unknown as { env?: { PROD?: boolean } }).env;
  if (viteEnv?.PROD) {
    throw new Error('seedDev must never run in a production build');
  }

  const rng = mulberry32(42);
  await Promise.all(db.tables.map((t) => t.clear()));

  // ~9 weeks ≈ 63 calendar days of history ending today (two-month demo window).
  const WEEKS = 9;
  const HISTORY_MS = WEEKS * 7 * 86_400_000;
  const now = Date.now();
  const historyStart = now - HISTORY_MS;

  const profileId = pseudoUuidV4(rng);
  const profile: UserProfile = {
    profileId,
    createdAt: new Date(historyStart - 2 * 86_400_000).toISOString(),
    affectedSide: 'left',
    assignedExercises: [...assignableExercises],
    attestedAt: new Date(historyStart - 2 * 86_400_000).toISOString(),
    consentVersion: '1',
    // Demo-visible profile fields so Home greeting + "why" are obvious after seed.
    nickname: 'Alex',
    motivation: 'Practice gently every day',
  };
  await StorageService.saveProfile(profile);

  const neutralStats: CalibrationBaseline['neutralStats'] = {
    REGION_BROW: { left: { u: 0.0, v: 0.418 }, right: { u: 0.0, v: 0.421 } },
    REGION_EYELID: { left: { u: 0.0, v: 0.112 }, right: { u: 0.0, v: 0.108 } },
    REGION_MOUTH_CORNER: { left: { u: 0.507, v: 0.05 }, right: { u: -0.503, v: 0.05 } },
    REGION_LIP: { left: { u: 0.231, v: 0.08 }, right: { u: -0.229, v: 0.08 } },
  };
  // Keep comfortableMax clearly above activationFloor and leave room for neutralActivation.
  const comfortableMax: CalibrationBaseline['comfortableMax'] = Object.fromEntries(
    assignableExercises.map((ex) => [ex, 0.35 + rng() * 0.25]),
  );
  // Post-rebase sessions require neutralActivation (SessionController.start → RECALIBRATION_REQUIRED).
  const neutralActivation: CalibrationBaseline['neutralActivation'] = Object.fromEntries(
    assignableExercises.map((ex) => [ex, 0.02 + rng() * 0.05]),
  );

  // Two baselines deliberately: old (inactive) and current (active), so "trends never mix
  // baselines" is testable against seeded data.
  const oldBaselineId = pseudoUuidV4(rng);
  await StorageService.saveBaseline({
    baselineId: oldBaselineId,
    profileId,
    capturedAt: new Date(historyStart - 1 * 86_400_000).toISOString(),
    neutralStats,
    comfortableMax,
    neutralActivation,
    qualityScore: 0.82,
    noiseFloorSymmetry: 0.04,
    noiseFloorDisplacement: 0.008,
    isActive: 1, // saveBaseline flips this to 0 once the active baseline below is saved
  });

  const activeBaselineId = pseudoUuidV4(rng);
  await StorageService.saveBaseline({
    baselineId: activeBaselineId,
    profileId,
    capturedAt: new Date(historyStart + 1 * 86_400_000).toISOString(),
    neutralStats,
    comfortableMax,
    neutralActivation,
    qualityScore: 0.91,
    noiseFloorSymmetry: 0.041,
    noiseFloorDisplacement: 0.007,
    isActive: 1,
  });

  // Week 0 = oldest (~60 days ago) … week WEEKS-1 = most recent (this week).
  // Symmetry mean drifts 0.55 → 0.78; easeOffCount declines 6 → 1; 4–6 sessions/week on
  // distinct days (1–3 missed days per week for realism).
  let qualityAbandonedUsed = false;
  const lastWeek = WEEKS - 1;
  for (let week = 0; week < WEEKS; week++) {
    const progress = week / lastWeek; // 0 … 1
    const sessionsThisWeek = 4 + Math.floor(rng() * 3); // 4–6
    const symmetryTrend = 0.55 + (0.78 - 0.55) * progress;
    const easeOffTrend = Math.round(6 + (1 - 6) * progress);
    const dayOffsets = pickDistinctDays(rng, sessionsThisWeek);
    const weekAge = lastWeek - week; // days-ago base for this week's day-0

    for (let i = 0; i < sessionsThisWeek; i++) {
      const dayInWeek = dayOffsets[i]!;
      const daysAgo = weekAge * 7 + dayInWeek;
      // Integer ms only, StorageService requires integer durationMs on reps; keep session
      // wall-clock integer too so ISO timestamps stay stable under the PRNG.
      const hourOffsetMs = Math.floor(rng() * 6 * 3_600_000);
      const startedAt = new Date(now - daysAgo * 86_400_000 - hourOffsetMs);
      const durationMs = Math.round((4 + rng() * 4) * 60_000);
      const endedAt = new Date(startedAt.getTime() + durationMs);

      let endReason: EndReason = 'completed';
      if (week === 3 && i === 0 && !qualityAbandonedUsed) {
        endReason = 'quality_abandoned';
        qualityAbandonedUsed = true;
      } else if (rng() < 0.12) {
        endReason = 'user_stopped';
      }

      const results: SessionRecordInput['results'] = assignableExercises.map((exerciseId) => {
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
          // Positive integer required by StorageService validation.
          durationMs: 1200 + Math.floor(rng() * 1000),
          // IndexedDB flag: 0 | 1 only (not boolean).
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
    voiceCoachEnabled: false,
    remindersEnabled: false,
    reminderTime: '09:00',
    reducedFacePreview: false,
    trendGranularity: 'monthly',
    showAffectedSideMarker: true,
    caregiverViewEnabled: true,
  });
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
