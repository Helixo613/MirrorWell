# MirrorWell — DATABASE.md

> **For AI coding agents:** the only persistence system is IndexedDB via Dexie, wrapped exclusively by `StorageService` (`src/data/`). **No component may touch Dexie or IndexedDB directly — every read/write goes through `StorageService`** (BACKEND.md owns its internals, API.md its contracts). Identifiers below are canonical per ARCHITECTURE.md §12.

## 1. Database choice

**Dexie 4.x over IndexedDB**, single database `mirrorwell_db` — the only storage engine available offline in a browser PWA with typed, transactional, indexable access, at zero cost and zero infrastructure. There is **no server database**; see §5.

Two properties IndexedDB does not give us, and how we compensate:

- **No CHECK constraints / foreign keys** → all validation and referential integrity are enforced in `StorageService` (validation matrix in §3; violations throw `VALIDATION_FAILED`).
- **Booleans are not indexable** → indexed flags use `0 | 1` (`isActive`, `easeOffTriggered`).

## 2. Full schema (ready-to-run)

This file is the schema. Copy verbatim to `src/data/schema.ts`.

```typescript
// src/data/schema.ts — canonical schema for mirrorwell_db, version 1.
// RULE (non-negotiable): only derived numeric data. Never images, video,
// raw landmark arrays, audio, names, emails, or free-text health notes.
// RULE: the type exports below (ExerciseId, RegionId, EndReason, row types)
// are the single canonical definitions. src/config/exercises.ts and all
// services IMPORT them from here — never redeclare them anywhere.
import Dexie, { type Table } from 'dexie';

export type ExerciseId = 'EX_BROW_RAISE' | 'EX_EYE_CLOSURE' | 'EX_SMILE' | 'EX_PUCKER';
export type RegionId = 'REGION_BROW' | 'REGION_EYELID' | 'REGION_MOUTH_CORNER' | 'REGION_LIP';
export type EndReason = 'completed' | 'user_stopped' | 'red_flag_stopped' | 'quality_abandoned';

export interface UserProfile {
  profileId: string;              // PK, uuid v4
  createdAt: string;              // UTC ISO 8601
  affectedSide: 'left' | 'right' | 'unknown';  // display orientation ONLY, never scoring
  assignedExercises: ExerciseId[];// therapist-assigned subset, length 1..4
  attestedAt: string | null;      // UTC ISO 8601; null until onboarding attestation
  consentVersion: string | null;  // must equal VITE_CONSENT_VERSION or onboarding re-runs
}

export interface CalibrationBaseline {
  baselineId: string;             // PK, uuid v4
  profileId: string;              // FK -> user_profile.profileId (enforced by StorageService)
  capturedAt: string;             // UTC ISO 8601
  neutralStats: Record<RegionId, { left: number; right: number }>; // median normalized rest distances
  comfortableMax: Partial<Record<ExerciseId, number>>; // median gentle-max displacement, keys = assignedExercises
  qualityScore: number;           // [0..1] = fraction of QUALITY_OK capture frames; >= 0.7 enforced
  isActive: 0 | 1;                // exactly one row with 1 (StorageService invariant)
}

export interface SessionRecord {
  sessionId: string;              // PK, uuid v4
  profileId: string;              // FK -> user_profile
  baselineId: string;             // FK -> calibration_baseline; trends never mix baselineIds
  startedAt: string;              // UTC ISO 8601
  endedAt: string;                // UTC ISO 8601; >= startedAt enforced
  endReason: EndReason;
}

export interface ExerciseResult {
  resultId: string;               // PK, uuid v4
  sessionId: string;              // FK -> session_record
  exerciseId: ExerciseId;
  repsCompleted: number;          // integer >= 0
  meanSymmetryIndex: number | null; // [0..1]; null if no valid (non-null) samples
  meanEffortIndex: number | null;   // >= 0; null if no valid samples
  easeOffCount: number;           // integer >= 0, times the ease-off cue fired
  lowQualityFramePct: number;     // [0..1], fraction of frames rejected by QualityMonitor
}

export interface RepMetric {
  repId: string;                  // PK, uuid v4
  resultId: string;               // FK -> exercise_result
  repIndex: number;               // integer >= 0, order within the exercise
  peakSymmetryIndex: number | null; // [0..1]; null if movement stayed under movementFloor
  peakEffortIndex: number;        // >= 0
  durationMs: number;             // integer > 0
  easeOffTriggered: 0 | 1;
}

export interface AppSettings {
  settingsId: 'singleton';        // PK, always the literal 'singleton'
  highContrast: boolean;          // default false
  textScale: number;              // default 1.0, range [1.0..2.0]
  hapticsEnabled: boolean;        // default true (effective on Android only)
  audioCuesEnabled: boolean;      // default true
  reducedFacePreview: boolean;    // default false ("show me less of my face")
  trendGranularity: 'weekly' | 'monthly'; // default 'monthly'
  noiseFloorSymmetry: number;     // default 0.05 until the noise-floor self-test measures it
  showAffectedSideMarker: boolean;// default true; no effect when affectedSide === 'unknown'
  caregiverViewEnabled: boolean;  // default false; the patient's consent act for CaregiverScreen
}

export class MirrorWellDB extends Dexie {
  user_profile!: Table<UserProfile, string>;
  calibration_baseline!: Table<CalibrationBaseline, string>;
  session_record!: Table<SessionRecord, string>;
  exercise_result!: Table<ExerciseResult, string>;
  rep_metric!: Table<RepMetric, string>;
  app_settings!: Table<AppSettings, string>;

  constructor() {
    super('mirrorwell_db');
    // Dexie index syntax: first entry = primary key; the rest = indexes.
    this.version(1).stores({
      user_profile:         'profileId',
      calibration_baseline: 'baselineId, profileId, isActive, capturedAt',
      session_record:       'sessionId, profileId, baselineId, startedAt',
      exercise_result:      'resultId, sessionId, exerciseId',
      rep_metric:           'repId, resultId',
      app_settings:         'settingsId',
    });
  }
}

export const db = new MirrorWellDB();
```

## 3. Validation matrix (enforced by `StorageService`, violations → `VALIDATION_FAILED`)

| Table.field | Rule |
|---|---|
| `user_profile.assignedExercises` | Non-empty array; every entry a valid `ExerciseId`; no duplicates |
| `user_profile.affectedSide` | One of `left`/`right`/`unknown` |
| `calibration_baseline.qualityScore` | `[0..1]`; **`< 0.7` rejected with `QUALITY_TOO_LOW` (not VALIDATION_FAILED)** |
| `calibration_baseline.neutralStats` | All four `RegionId` keys present; all values finite and `> 0` |
| `calibration_baseline.comfortableMax` | Keys ⊆ profile's `assignedExercises`; values finite `> 0` |
| `calibration_baseline.isActive` | `saveBaseline` sets new row to `1` and all others to `0` in one transaction — the "exactly one active" invariant |
| `session_record.endedAt` | `>= startedAt`; both valid UTC ISO 8601 |
| `session_record.baselineId` / `profileId` | Must reference existing rows (manual FK check) |
| `exercise_result.*Index` fields | `meanSymmetryIndex` null or `[0..1]`; `lowQualityFramePct` `[0..1]`; counts non-negative integers |
| `rep_metric.durationMs` | Integer `> 0` |
| `app_settings.textScale` | `[1.0..2.0]` |
| All string PKs/FKs | Non-empty uuid v4 format |

## 4. Per-table ownership & retention

| Table | Stores | Written by | Read by | Retention |
|---|---|---|---|---|
| `user_profile` | The single local profile: affected side, assigned exercises, attestation | `OnboardingScreen` via `SafetyGate`/`StorageService.saveProfile` | `SafetyGate`, `SessionController`, `CaregiverScreen`, `ExportService` | Until user deletes (`deleteAllData` or clearing site data). No automatic expiry — it's the user's own device and data |
| `calibration_baseline` | Neutral reference geometry + per-exercise comfortable max + capture quality | `CalibrationFlow` via `StorageService.saveBaseline` | `NormalizationLayer` (via `getActiveBaseline`), `MetricEngine`, `TrendsService` (partition key) | All baselines kept (historical sessions reference them); user deletion removes all |
| `session_record` | One row per session: window, baseline link, end reason | `SessionController.stop` via `StorageService.saveSession` (single transaction with children) | `TrendsService`, `SummaryScreen`, `CaregiverScreen`, `ExportService` | Until user deletes |
| `exercise_result` | Per-exercise aggregates within a session | Same transaction as parent | Same readers | Until user deletes |
| `rep_metric` | Per-rep peaks and timing | Same transaction as parent | `SummaryScreen` (detail), `ExportService` | Until user deletes |
| `app_settings` | Accessibility + honesty + consent-toggle settings singleton | `SettingsService.update`; `noiseFloorSymmetry` also by `CalibrationFlow` self-test | Every screen; `TrendsService` (noise floor, granularity); `SafetyGate` indirectly | Until user deletes |

**Global retention rules:** no automatic deletion or expiry — the data is the user's exercise history on their own device; `StorageService.deleteAllData()` (typed-confirmation in `SettingsScreen`) drops every table in one transaction; Demo Mode writes **nothing** to any table (structural rule, ARCHITECTURE §11).

## 5. On-device vs. server split

There is no server; **100% of data is on-device**. Per-category privacy reasoning (why local is the only acceptable location):

| Category | Tables/fields | Why on-device only |
|---|---|---|
| Condition-adjacent identity | `affectedSide`, `assignedExercises` | Reveals a medical condition; combined with any identifier off-device it becomes regulated health data. Locally it never joins an identity — the app stores no name, email, or account. |
| Face-derived calibration geometry | `neutralStats`, `comfortableMax` | Derived from the user's face at rest. Deliberately reduced to a handful of region distances (not a biometric template, not landmarks), but face-derived data leaving the device would demand consent and security machinery a student project cannot honestly operate. |
| Exercise performance | `session_record`, `exercise_result`, `rep_metric` | Longitudinal health-behavior data. The clinician gets it via user-initiated export files; a server copy would add breach risk and zero product value. |
| Preferences/consents | `app_settings`, attestation fields | Low sensitivity, but no reason to exist anywhere else. |

The **only** way any data leaves the device: `ExportService.generateSummary` producing a local file download that the user explicitly shares (SAFETY §6).

## 6. Seed / fixture data (development & demo)

Script: `scripts/seed-dev.ts`, run with `npm run seed:dev` (uses `fake-indexeddb` under Vitest; in the browser it runs via the `DebugHud` "seed" button, dev builds only).

- Deterministic PRNG (seed `42`) so E2E assertions are stable.
- Inserts: 1 `user_profile` (`affectedSide: 'left'`, all four exercises assigned, attested); 2 `calibration_baseline` rows (an old inactive one and the active one, `qualityScore` 0.82/0.91) — two baselines exist deliberately so the "trends never mix baselines" rule is testable; 6 weeks of `session_record`s (4–5/week, a few `user_stopped` and one `quality_abandoned`) with nested results/reps: `meanSymmetryIndex` trending 0.58 → 0.74 with realistic noise, `easeOffCount` trending 6 → 1 (the app's own efficacy signal), `lowQualityFramePct` 0.05–0.20.
- `app_settings` with `noiseFloorSymmetry: 0.04`, `caregiverViewEnabled: true` (so `CaregiverScreen` is reachable in dev).
- **RULE:** seed code is dev/test-only — excluded from the production bundle; the seed script must refuse to run when `import.meta.env.PROD`.

Camera fixtures (masters `tests/fixtures/masters/*.{webm,mp4}` + Playwright replays `tests/fixtures/replay/*.mjpeg` + `fixtures_manifest.json`) are owned by MODEL_AND_DATA.md §4; they are test inputs, not database seeds.

## 7. Migration / versioning

- Dexie versioning: every schema change adds `this.version(n).stores({...}).upgrade(tx => ...)` — **never edit `version(1)` after first release**; history is append-only.
- Additive-only policy: add fields with defaults in `upgrade()`; never rename or repurpose a field (add new + backfill + deprecate in comments instead). Removing a table requires an explicit data-export prompt to the user first — silently dropping health history is forbidden.
- Every migration ships with a Vitest test: open a fixture DB at version *n−1* (JSON dump checked into `tests/unit/migrations/`), run the upgrade, assert row-level equality with expected output.
- `consentVersion` (env `VITE_CONSENT_VERSION`) is **not** a schema version — bumping it re-runs onboarding but never migrates data.
