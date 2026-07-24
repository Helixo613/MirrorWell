import { type Page } from '@playwright/test';

// Raw-IndexedDB seeding for the ATTESTED-gated data screens (Trends, Caregiver, Export).
//
// Why raw IDB and not StorageService: exposing a service on `window` would need a frozen
// `src/main.tsx` edit (S3 must not touch it) and would leave test-only reachable code in
// dist/, which Reconvergence's dist-purity grep is designed to catch. Raw IDB adds nothing
// to the bundle. The seed writes rows in exactly the on-disk shape src/data/storage.ts uses
// (mirrorwell_db v1 stores from src/data/schema.ts), so Dexie reads them back unchanged.
//
// CLAUDE.md fact 6: IndexedDB cannot index booleans. `isActive` is the numeric literal 1 so
// `getActiveBaseline()`'s `.where('isActive').equals(1)` matches. A boolean `true` here would
// silently return no active baseline -> NO_BASELINE / empty screen.
//
// Call ORDER matters (advisor): the app must open the DB first (a `page.goto('/')` mounts
// AppStateContext -> hydrateAppState -> getProfile, opening mirrorwell_db v1 with the correct
// stores/indexes). Only then seed, then navigate/reload so hydration re-reads with data.

type ExerciseId = 'EX_BROW_RAISE' | 'EX_EYE_CLOSURE' | 'EX_SMILE' | 'EX_PUCKER';
type EndReason = 'completed' | 'user_stopped' | 'red_flag_stopped' | 'quality_abandoned';

/** One session's worth of seed input. Reps are omitted — no data screen reads rep_metric. */
export interface SeedSession {
  /** Whole days before now the session started (local time buckets it, ARCH §13). */
  daysAgo: number;
  endReason?: EndReason;
  /** meanSymmetryIndex per assigned exercise; missing exercises get `fallbackSymmetry`. */
  symmetry?: Partial<Record<ExerciseId, number>>;
  /** [0..1] fraction of rejected frames, surfaced as "measurement quality". */
  lowQualityFramePct?: number;
  easeOffCount?: number;
}

export interface SeedSpec {
  affectedSide?: 'left' | 'right' | 'unknown';
  assignedExercises?: ExerciseId[];
  /** The patient's CaregiverScreen consent act. Default false (guard redirects). */
  caregiverViewEnabled?: boolean;
  trendGranularity?: 'weekly' | 'monthly';
  noiseFloorSymmetry?: number;
  fallbackSymmetry?: number;
  sessions?: SeedSession[];
  /** Overrides the seeded consentVersion. Default undefined to match this build (no .env). */
  consentVersion?: string | undefined;
}

// Static, valid uuid-v4 constants (xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx). Read paths do
// not re-validate, but valid shapes keep the seed faithful to what StorageService would write.
const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const BASELINE_ID = '22222222-2222-4222-8222-222222222222';

function uuid(prefix: string, n: number): string {
  const h = (prefix.charCodeAt(0) + n).toString(16).padStart(2, '0');
  return `${h}${h}${h}${h}-${h}${h}-4${h}${h.slice(0, 1)}-8${h}${h.slice(0, 1)}-${h}${h}${h}${h}${h}${h}`;
}

// Two full months apart guarantees >= minPeriodsForChart (2) monthly buckets, so TrendsScreen
// reaches 'ready' and the chart<->table toggle is exercisable — not the empty state.
const DEFAULT_SESSIONS: SeedSession[] = [
  { daysAgo: 44, symmetry: { EX_SMILE: 0.58, EX_BROW_RAISE: 0.55 } },
  { daysAgo: 40, symmetry: { EX_SMILE: 0.6, EX_BROW_RAISE: 0.57 } },
  { daysAgo: 5, symmetry: { EX_SMILE: 0.74, EX_BROW_RAISE: 0.7 } },
  { daysAgo: 2, symmetry: { EX_SMILE: 0.73, EX_BROW_RAISE: 0.71 } },
];

interface SeedPayload {
  profile: unknown;
  baseline: unknown;
  settings: unknown;
  sessions: unknown[];
  results: unknown[];
}

/** Build the fully-resolved row set on the Node side; page.evaluate only writes it. */
function buildPayload(spec: SeedSpec): SeedPayload {
  const assigned = spec.assignedExercises ?? ['EX_SMILE', 'EX_BROW_RAISE'];
  const noiseFloor = spec.noiseFloorSymmetry ?? 0.04;
  const fallback = spec.fallbackSymmetry ?? 0.6;
  const sessionSpecs = spec.sessions ?? DEFAULT_SESSIONS;
  const nowMs = Date.now();

  const neutralStats = {
    REGION_BROW: { left: { u: 0.0, v: 0.418 }, right: { u: 0.0, v: 0.421 } },
    REGION_EYELID: { left: { u: 0.0, v: 0.112 }, right: { u: 0.0, v: 0.108 } },
    REGION_MOUTH_CORNER: { left: { u: 0.507, v: 0.05 }, right: { u: -0.503, v: 0.05 } },
    REGION_LIP: { left: { u: 0.231, v: 0.08 }, right: { u: -0.229, v: 0.08 } },
  };
  const comfortableMax = Object.fromEntries(assigned.map((ex) => [ex, 0.06]));

  const profile = {
    profileId: PROFILE_ID,
    createdAt: new Date(nowMs - 60 * 86_400_000).toISOString(),
    affectedSide: spec.affectedSide ?? 'left',
    assignedExercises: assigned,
    attestedAt: new Date(nowMs - 60 * 86_400_000).toISOString(),
    // isAttested() requires consentVersion === import.meta.env.VITE_CONSENT_VERSION. No .env
    // exists in this repo, so the build inlines that as undefined (dist: `consentVersion===void
    // 0`) and real onboarding also writes undefined here. `null` would NOT match (null !==
    // undefined); the key is set explicitly to undefined and survives page.evaluate's transfer.
    consentVersion: spec.consentVersion,
  };

  const baseline = {
    baselineId: BASELINE_ID,
    profileId: PROFILE_ID,
    capturedAt: new Date(nowMs - 55 * 86_400_000).toISOString(),
    neutralStats,
    comfortableMax,
    qualityScore: 0.9,
    noiseFloorSymmetry: noiseFloor,
    noiseFloorDisplacement: 0.008,
    isActive: 1, // numeric — see fact 6 note above
  };

  const settings = {
    settingsId: 'singleton',
    highContrast: false,
    textScale: 1.0,
    hapticsEnabled: true,
    audioCuesEnabled: true,
    voiceCoachEnabled: false,
    reducedFacePreview: false,
    trendGranularity: spec.trendGranularity ?? 'monthly',
    showAffectedSideMarker: true,
    caregiverViewEnabled: spec.caregiverViewEnabled ?? false,
  };

  const sessions: unknown[] = [];
  const results: unknown[] = [];
  sessionSpecs.forEach((s, i) => {
    const startedMs = nowMs - s.daysAgo * 86_400_000;
    const sessionId = uuid('s', i);
    sessions.push({
      sessionId,
      profileId: PROFILE_ID,
      baselineId: BASELINE_ID,
      startedAt: new Date(startedMs).toISOString(),
      endedAt: new Date(startedMs + 5 * 60_000).toISOString(),
      endReason: s.endReason ?? 'completed',
    });
    assigned.forEach((exerciseId, j) => {
      results.push({
        resultId: uuid('r', i * 10 + j),
        sessionId,
        exerciseId,
        repsCompleted: 10,
        meanSymmetryIndex: s.symmetry?.[exerciseId] ?? fallback,
        meanEffortIndex: 0.4,
        easeOffCount: s.easeOffCount ?? 0,
        lowQualityFramePct: s.lowQualityFramePct ?? 0.08,
      });
    });
  });

  return { profile, baseline, settings, sessions, results };
}

/**
 * Seed an attested profile + one active baseline + sessions into the already-open
 * mirrorwell_db. Precondition: the app has opened the DB (do a `page.goto('/')` first).
 * After seeding, navigate to the target route (or reload) so hydration reads the data.
 */
export interface DbCounts {
  profiles: number;
  baselines: number;
  sessions: number;
  results: number;
  appSettings: number;
  caregiverViewEnabled: boolean;
}

/** Row counts across the writable stores + the settings blob, for before/after mutation audits. */
export async function readCounts(page: Page): Promise<DbCounts> {
  return page.evaluate(async () => {
    const req = indexedDB.open('mirrorwell_db');
    const db: IDBDatabase = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    function count(store: string): Promise<number> {
      return new Promise((res, rej) => {
        const r = db.transaction(store).objectStore(store).count();
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    function settings(): Promise<{ caregiverViewEnabled?: boolean }> {
      return new Promise((res, rej) => {
        const r = db.transaction('app_settings').objectStore('app_settings').get('singleton');
        r.onsuccess = () => res(r.result ?? {});
        r.onerror = () => rej(r.error);
      });
    }
    const [profiles, baselines, sessions, results, appSettings, s] = await Promise.all([
      count('user_profile'),
      count('calibration_baseline'),
      count('session_record'),
      count('exercise_result'),
      count('app_settings'),
      settings(),
    ]);
    db.close();
    return {
      profiles,
      baselines,
      sessions,
      results,
      appSettings,
      caregiverViewEnabled: s.caregiverViewEnabled === true,
    };
  });
}

export async function seedDatabase(page: Page, spec: SeedSpec = {}): Promise<void> {
  const payload = buildPayload(spec);
  await page.evaluate(async (data) => {
    await new Promise<void>((resolve, reject) => {
      // No version arg: open the existing DB at its current version, no upgrade.
      const req = indexedDB.open('mirrorwell_db');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(
          [
            'user_profile',
            'calibration_baseline',
            'session_record',
            'exercise_result',
            'app_settings',
          ],
          'readwrite',
        );
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.objectStore('user_profile').put(data.profile);
        tx.objectStore('calibration_baseline').put(data.baseline);
        tx.objectStore('app_settings').put(data.settings);
        for (const s of data.sessions) tx.objectStore('session_record').put(s);
        for (const r of data.results) tx.objectStore('exercise_result').put(r);
      };
    });
  }, payload);
}
