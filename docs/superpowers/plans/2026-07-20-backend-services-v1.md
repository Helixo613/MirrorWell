# Backend Services v1 Implementation Plan (SafetyGate, CalibrationFlow, SessionController, data services)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. TDD every code task: failing test → verify failure → minimal implementation → verify pass → commit. Shell via `rtk`.

**Goal:** Implement the backend halves of IMPLEMENTATION.md Tasks 9–11 and 14–15. `SafetyGate`, `CalibrationFlow`, `SessionController` (the `SessionApi` surface the frontend stub mimics), plus `SettingsService`, `TrendsService`, `ExportService`; with zero screen work (screens belong to `2026-07-20-frontend-integration.md`).

**Architecture:** All new modules are thin orchestration over the already-validated hot path (`CaptureService → LandmarkEngine → QualityMonitor → NormalizationLayer → MetricEngine → RepDetector`) and `StorageService`. The event surface in `docs/API.md` §10 is the frontend contract; nothing else is exported to screens. Camera lifecycle rule: these modules may hold the camera only while serving `CalibrationScreen`/`SessionScreen`.

**Tech Stack:** Existing pinned stack only. No new dependencies. Pure TS + Vitest (fake-indexeddb for storage-touching tests).

## Global Constraints (every task)

- Docs win. Contracts verbatim from `docs/API.md` §2, §10–§14; types from `docs/ARCHITECTURE.md` §13; schema from `docs/DATABASE.md`. Copy identifiers; never retype from memory.
- No network. No frame/video/landmark persistence. Storage via `StorageService` only.
- Every tunable in `src/config/thresholds.ts`; every user-facing string in `src/config/strings.ts`. A missing tunable/identifier means: amend `docs/ARCHITECTURE.md` §12 glossary + the owning doc in the same commit (`DOCS-CHANGE:` line), then add it to config.
- Task 6 kill-gate is still un-passed → everything here lands as **PROVISIONAL** in the acceptance ledger (same status Tasks 7–8 carry). Never claim ACCEPTED.
- Event surface is closed: `stateChanged | metricUpdate | qualityUpdate | repCompleted | easeOff | sessionEnded`; no new events without amending API.md §10 first.
- `MetricEngine.reset()` + `RepDetector.reset()` on every exercise transition; unit tests assert no state leakage.
- Work on branch `backend-services-v1` from `main`. One commit per task minimum.

## Known doc contradictions to fix first (deviation protocol)

1. `docs/IMPLEMENTATION.md` Task 10 test line says "`noiseFloorSymmetry` lands in `app_settings`", stale; DG-4 moved it to `calibration_baseline` (ARCHITECTURE §12, DATABASE §2 already agree). Fix the test line.
2. `docs/API.md` §11 `captureComfortableMax` example `0.092` is IOD-era; `comfortableMax` is now 0..1 blendshape-activation units (DATABASE §2). Update the example to e.g. `0.62`.
3. Noise-floor units after the blendshape reversal: `noiseFloorDisplacement` was defined as std of geometry displacement at neutral; the accepted candidate measures activation. Redefine `noiseFloorDisplacement` as std of activation (score units) at neutral, matching MODEL_AND_DATA §7 B1a; `noiseFloorSymmetry` stays std of smoothed SI during held comfortable-max reps (unchanged semantics, blendshape SI). Amend DATABASE §2 + BACKEND §1.4 notes.

### Task 0: Branch + doc repairs

**Files:** branch `backend-services-v1`; Modify: `docs/IMPLEMENTATION.md`, `docs/API.md` §11, `docs/DATABASE.md` §2, `docs/BACKEND.md` §1.4

- [ ] **Step 1:** `git checkout -b backend-services-v1 main`
- [ ] **Step 2:** Apply the three doc fixes above, exactly as stated.
- [ ] **Step 3:** `rtk node scripts/check-docs.mjs` → green.
- [ ] **Step 4:** Commit: `docs: pre-implementation contract repairs for backend services` with three `DOCS-CHANGE:` lines (one per doc).

### Task 1: SafetyGate

**Files:**
- Create: `src/session/safety.ts`
- Test: `tests/unit/safety.test.ts`
- Modify: `src/data/storage.ts` ONLY if the Demo-Mode write backstop (API §17: demo blocks persistence) isn't already enforceable via a check in `saveSession`; prefer the gate refusing the write over patching storage.

**Interfaces (produces, exact, from API.md §2):**
```ts
export const SafetyGate = {
  isAttested(): Promise<boolean>,            // app_settings.attestedConsentVersion === import.meta.env.VITE_CONSENT_VERSION
  recordAttestation(consentVersion: string): Promise<void>,
  enterDemoMode(): void,                     // in-memory only; cleared on reload by construction
  isDemoMode(): boolean,
};
```

- [ ] **Step 1: Failing tests** (`rtk npx vitest run tests/unit/safety.test.ts` → module missing):
  - `isAttested` false on empty settings; true after `recordAttestation(currentVersion)`; false again when `VITE_CONSENT_VERSION` differs from the stored version (consent-version bump re-gates).
  - `recordAttestation` persists through `StorageService` (assert via `StorageService`, not raw Dexie).
  - `enterDemoMode()` → `isDemoMode()` true; demo state is module-memory only (re-import/reset simulation → false).
  - Demo mode + `SessionController.stop` persistence rule is tested in Task 4 (gate only exposes the flag here).
- [ ] **Step 2:** Implement (thin: one read, one write, one boolean). Strings for onboarding live in `strings.ts`, none needed in this module.
- [ ] **Step 3:** Tests green. Commit: `feat: SafetyGate (attestation vs VITE_CONSENT_VERSION, in-memory demo mode)`.

### Task 2: SettingsService

**Files:**
- Create: `src/data/settings.ts`
- Test: `tests/unit/settings.test.ts`

**Interfaces (API.md §14):** `get(): Promise<AppSettings>` · `update(partial: Partial<AppSettings>): Promise<AppSettings>`, `AppSettings` shape from `src/data/schema.ts` (do not redeclare).

- [ ] **Step 1: Failing tests:** `get` returns defaults when unset (defaults from schema/docs, not invented); `update` merges partials and persists via `StorageService`; unknown keys rejected with `VALIDATION_FAILED` (`MirrorWellError`).
- [ ] **Step 2:** Implement over `StorageService` app_settings accessors (extend `StorageService` only if a needed accessor is missing, schema untouched).
- [ ] **Step 3:** Green. Commit: `feat: SettingsService over StorageService`.

### Task 3: CalibrationFlow

**Files:**
- Create: `src/session/calibration.ts`
- Test: `tests/unit/calibration.test.ts`

**Interfaces (produces, API.md §11 verbatim):**
```ts
export const CalibrationFlow = {
  captureNeutral(): Promise<NeutralCaptureResult>,          // {neutralStats, qualityScore}
  captureComfortableMax(exerciseId: ExerciseId): Promise<number>, // 0..1 activation units
  runNoiseFloorSelfTest(): Promise<number>,                 // noiseFloorSymmetry, persisted on active baseline
  checkBaselineDrift(): Promise<'ok' | 'recalibrate'>,
};
```
**Consumes:** `measureAbsolute` + `aggregateNeutral` (`src/metrics/geometry.ts`), `QualityMonitor.evaluate`, `NormalizedFrame.blendshapes` via `NormalizationLayer` is NOT used here (no baseline yet during bootstrap); read blendshapes from the `ApprovedFrame`'s `lf.blendshapes` directly for activation math; `exercises[exerciseId].blendshapePair` for the pair; `StorageService.saveBaseline`/`getActiveBaseline`.

**Design (fixed):**
- Frame acquisition: inject a frame source `(onFrame: (video, lf) => void) => stop()` wrapping `CaptureService`+`LandmarkEngine`, so unit tests drive synthetic frames without a camera (same pattern the harness uses). Gate every frame through `QualityMonitor.evaluate`; only `QUALITY_OK` frames enter math.
- `captureNeutral`: 3 windows × 3 s; per window collect `measureAbsolute(af)`; `aggregateNeutral` over all OK samples; `qualityScore` = OK frames / total frames; if `qualityScore < calibration.minOkFraction` (existing threshold; verify in `thresholds.ts`, add via DOCS-CHANGE if absent) → throw `QUALITY_TOO_LOW`. Also collect neutral activation samples (`act = max(pair.L, pair.R)` per assigned exercise's pair) → `noiseFloorDisplacement` = std of act.
- `captureComfortableMax(id)`: `exercises[id].blendshapePair` absent (EX_PUCKER) → throw `VALIDATION_FAILED` (loud stop, MODEL_AND_DATA §7 open decision). Else 3 gentle reps; per rep peak `act`; **median** of the 3 peaks. Copy shown by UI must include "gentle", string key exists in `strings.ts` (add if missing).
- `runNoiseFloorSelfTest`: during a held comfortable-max capture, compute smoothed SI per frame (same min/max + trailing-median-5 as MetricEngine; reuse `MetricEngine` with a throwaway baseline? No: MetricEngine needs `comfortableMax`; here it exists already, so `setBaseline` with the in-progress baseline and use `compute()`), `noiseFloorSymmetry` = std of the smoothed SI; persist both noise floors + `neutralStats` + `comfortableMax` via one `saveBaseline` call (baseline row assembled here; `isActive` flip handled by `StorageService.saveBaseline` per API §3).
- `checkBaselineDrift`: per BACKEND §1.4: current `measureAbsolute` vs stored `neutralStats`, per region-side displacement magnitude, median across regions > `thresholds.calibration.driftMaxPct` (8%) → `'recalibrate'`. Geometry kernel is retained for exactly this (it is valid at frontal/neutral pose; the yaw weakness that killed it as an SI source doesn't apply to a frontal neutral re-check).
- All gated: `SafetyGate.isAttested()` false and not demo → throw `NOT_ATTESTED`.

- [ ] **Step 1: Failing tests** (synthetic frame source; no camera):
  - `captureNeutral` happy path: known synthetic landmarks → `neutralStats` equals `aggregateNeutral` of the fed frames; `qualityScore` correct with mixed OK/non-OK frames.
  - `captureNeutral` with OK fraction below floor → `QUALITY_TOO_LOW`, nothing persisted.
  - `captureComfortableMax('EX_SMILE')`: three reps with peak acts 0.5/0.7/0.9 → returns 0.7 (median, not max).
  - `captureComfortableMax('EX_PUCKER')` → `VALIDATION_FAILED`.
  - `runNoiseFloorSelfTest`: constant SI stream → ~0; alternating stream → matches hand-computed std; persisted on the active baseline row (assert via `StorageService.getActiveBaseline`).
  - `checkBaselineDrift`: identical frames → `'ok'`; frames offset by >8% median displacement → `'recalibrate'`; no baseline → `NO_BASELINE`.
  - UNATTESTED (no demo) → every method throws `NOT_ATTESTED`.
- [ ] **Step 2:** Implement. Zero/ephemeral baselines forbidden (API §7), bootstrap uses `measureAbsolute` only.
- [ ] **Step 3:** Green. Commit: `feat: CalibrationFlow (neutral bootstrap, activation comfortableMax, noise floors, drift check)`.

### Task 4: SessionController

**Files:**
- Create: `src/session/controller.ts`, `src/session/emitter.ts`
- Test: `tests/unit/controller.test.ts`, `tests/unit/emitter.test.ts`

**Interfaces (produces, API.md §10 verbatim; this IS the `SessionApi` the frontend stub mimics):**
```ts
export type SessionEvent =
  | { type: 'stateChanged';  payload: { exerciseId: ExerciseId; state: 'DEMO' | 'REPS' | 'REST' } }
  | { type: 'metricUpdate';  payload: { sample: MetricSample } }          // ≤ 15 Hz
  | { type: 'qualityUpdate'; payload: { state: QualityState } }
  | { type: 'repCompleted';  payload: { event: RepEvent } }
  | { type: 'easeOff';       payload: { active: boolean } }
  | { type: 'sessionEnded';  payload: { record: SessionRecordFull } };

export const SessionController = {
  start(exerciseIds: ExerciseId[]): Promise<void>,
  advance(): void,
  extendRest(seconds: number): void,   // extension only; shortening does not exist
  stop(reason: EndReason): Promise<SessionRecordFull>,
  on<E>(event: E, cb): () => void,     // returns unsubscribe
};
```
**Consumes:** full hot path + `SafetyGate` + `CalibrationFlow.checkBaselineDrift` + `StorageService.saveSession` + `MetricEngine`/`RepDetector` reset rules.

**Design (fixed):**
- `src/session/emitter.ts`: minimal typed emitter (~20 lines: `Map<string, Set<cb>>`, `on` returns unsubscribe, `emit` iterates a copy). No dependency.
- `start` preconditions **in order** (API §10): gate (ATTESTED or DEMO, else `NOT_ATTESTED`) → `StorageService.getActiveBaseline()` (else `NO_BASELINE`; DEMO uses its in-memory quick-calibration baseline instead) → `checkBaselineDrift()` `'recalibrate'` → reject with recalibration signal (existing error code from §12 glossary; copy it, don't invent) → camera start (`CAMERA_DENIED`/`CAMERA_UNAVAILABLE` pass through). Empty list / exercise without `blendshapePair` → `VALIDATION_FAILED`.
- Frame loop identical to the harness pattern: `detect` in try/catch (`INFERENCE_FAILED` → `evaluate(video, null)` → `FACE_LOST`), `evaluate`, on OK → `normalize` → `compute` → `feed`. Non-OK → `qualityUpdate` emit (deduped, only on state change) and nothing reaches metrics (type barrier already guarantees this).
- Machine: per exercise `DEMO → REPS → REST`; `advance()` DEMO→REPS or ends REST early; REST → next exercise's DEMO; after last exercise auto-`stop('completed')`. `extendRest(s)` adds seconds, never subtracts.
- `metricUpdate` throttle: emit at most every `thresholds.session.metricEventMinIntervalMs` (existing? verify; the ≤15 Hz rule is ARCH DG-8. 66 ms). Canvas-rate rendering is the frontend's job from the same samples it gets; events stay ≤15 Hz.
- Rep discard: rep with < 60% OK frames during its span → discarded (no `repCompleted`), counter untouched (`thresholds.session.repMinOkFraction` 0.6: add via DOCS-CHANGE if absent; the 60% figure is IMPLEMENTATION Task 11, canonical).
- Offer-stop: ≥30 s continuous non-OK → emit `qualityUpdate` state unchanged but UI offer-stop is frontend concern; controller only tracks and exposes it via the existing documented mechanism; check §12 for `qualityOfferStop`; **the frontend branch listened for a `qualityOfferStop` event that API.md §10's closed table does NOT list.** Resolution: API §10 is canonical (six events). The offer-stop signal must therefore ride on an existing event or the table gets amended. Amend API.md §10 to add `qualityOfferStop: { visible: boolean }` as a seventh documented event (DOCS-CHANGE, glossary entry); the frontend already consumes exactly that shape, and a 30 s quality-degradation offer is a documented Task 11 behavior needing a channel.
- Ease-off: bridge `MetricEngine.isEaseOffActive()` transitions to `easeOff {active}` events.
- Exercise transition: `MetricEngine.reset()` + `RepDetector.reset()`, leakage test mandatory.
- Session assembly on `stop(reason)`: build `SessionRecordInput` per ARCH §13 (per-exercise results, reps with `easeOffTriggered` converted `boolean → 0|1`), persist via `saveSession`; **except demo**: return the record, skip persistence, and assert nothing was written. Always emit `sessionEnded` with the full record. Camera torn down before the promise resolves (mirrors the harness teardown).

- [ ] **Step 1: Failing emitter tests:** subscribe/emit/unsubscribe; unsubscribe during emit doesn't skip others.
- [ ] **Step 2: Failing controller tests** (fake frame source + fake timers; storage via fake-indexeddb):
  - Precondition order: unattested → `NOT_ATTESTED` before baseline is even read; attested+no baseline → `NO_BASELINE`; drift `'recalibrate'` → documented recalibration rejection; bad exercise list → `VALIDATION_FAILED`.
  - State machine walk: `stateChanged` sequence DEMO→REPS→REST→DEMO(next)→…; `advance` skips; auto-stop after last REST emits `sessionEnded` with `endReason: 'completed'`.
  - `metricUpdate` ≤ 15 Hz under a 30 Hz synthetic frame stream (count events over fake-timer window).
  - Rep with 50% OK frames discarded; 70% OK passes through as `repCompleted`.
  - 30 s continuous non-OK → `qualityOfferStop {visible: true}`; recovery → `{visible: false}`.
  - `easeOff` events mirror `isEaseOffActive()` transitions exactly once per transition.
  - Exercise transition calls both resets (spy) and no metric state leaks (feed asymmetric frames in exercise A, symmetric in B → B's first samples unaffected).
  - `stop('user_stopped')` mid-REPS persists partial record; `easeOffTriggered` stored as `0|1`; demo-mode stop persists nothing (DB row count 0) yet returns the record.
  - `extendRest(10)` lengthens REST; no API to shorten exists (type-level).
- [ ] **Step 3:** Implement emitter → machine → loop → assembly, in that order, keeping tests green incrementally.
- [ ] **Step 4:** Full suite + coverage: `rtk npx vitest run --coverage`; no regression on metrics/reps 100% branch.
- [ ] **Step 5:** Commit: `feat: SessionController (state machine, closed event surface, session assembly)` with `DOCS-CHANGE: API.md §10: qualityOfferStop event added to the closed table (Task 11 offer-stop needs a channel; frontend contract)`.

### Task 5: TrendsService

**Files:**
- Create: `src/data/trends.ts`
- Test: `tests/unit/trends.test.ts`

**Interfaces (API.md §12 verbatim):** `getTrend(exerciseId, granularity): Promise<TrendSeries>`, `getAdherence(range): Promise<Adherence>`, shapes from ARCH §13.

- [ ] **Step 1: Failing tests** (seed sessions via `StorageService` over fake-indexeddb):
  - One series = active `baselineId` only; sessions from an older baseline excluded.
  - `quality_abandoned` and `red_flag_stopped` sessions excluded from aggregation.
  - `aboveNoiseFloor: false` when period-over-period change < active baseline's `noiseFloorSymmetry` (read from `calibration_baseline`, never `app_settings`; assert it still works when app_settings carries no such field).
  - Weekly vs monthly bucketing by `periodStart` ISO dates; `sampleCount` correct.
  - `getAdherence`: `sessionsPerWeek` array + `completionRate` = completed / total (excluding demo).
  - Unknown exercise → `VALIDATION_FAILED`; storage failure → `DB_UNAVAILABLE`.
- [ ] **Step 2:** Implement (pure aggregation over `StorageService.getSessions` + `getActiveBaseline`).
- [ ] **Step 3:** Green. Commit: `feat: TrendsService (baseline-scoped, noise-floor-aware aggregation)`.

### Task 6: ExportService

**Files:**
- Create: `src/data/export.ts`
- Test: `tests/unit/export.test.ts` (+ validate against `tests/schemas/export.schema.json`, arrives with the frontend branch; if not yet on this branch, copy it: `git checkout origin/sai-shanmukh-progress -- tests/schemas/export.schema.json`)

**Interfaces (API.md §13):** `generateSummary(range): Promise<{json: Blob; html: Blob}>`, ATTESTED-gated.

- [ ] **Step 1: Failing tests:**
  - JSON payload validates against `export.schema.json` (plain recursive checker in the test, no new deps); no extra fields.
  - `nonDiagnosticNotice` present, text sourced from `strings.ts` (assert equality with the strings key).
  - `noiseFloorSymmetry` sourced from active `calibration_baseline`.
  - Unattested → `NOT_ATTESTED`; bad range → `VALIDATION_FAILED`.
  - HTML blob contains the same notice text (string containment).
- [ ] **Step 2:** Implement: assemble from `TrendsService` + `StorageService`; two Blobs; download-only (no share/clipboard code anywhere).
- [ ] **Step 3:** Green. Commit: `feat: ExportService (schema-validated JSON + printable HTML, attested-only)`.

### Task 7: Verification + ledger + handoff

- [ ] **Step 1:** `rtk npx vitest run` full suite green; `npx tsc --noEmit` green; `rtk node scripts/check-docs.mjs` green; `rtk npm run build` green; grep dist for `sessionApiStub` absence (stub is frontend's, but verify no cross-import).
- [ ] **Step 2:** `docs/IMPLEMENTATION.md` ledger: Tasks 9, 10, 11, 14, 15 backend halves → **PROVISIONAL** (evidence: this plan + test files; note "screens pending frontend-integration; acceptance blocked on Task 6 kill-gate like Tasks 7–8").
- [ ] **Step 3:** Commit: `docs: ledger, backend services provisional pending V1 gate`. Notify the frontend track: real `SessionApi` exists; stub swap = replacing the `@/dev/sessionApiStub` import with `src/session/controller.ts`/`calibration.ts` exports.

## Out of scope

Screens/FeedbackRenderer/routing (frontend plan); protocol-v2 intensity band + demo harness view (separate, user-gated); EX_PUCKER mapping (open decision, code throws `VALIDATION_FAILED`); V2 palsy-dataset validation; geometry-path consolidation; Task 12 demo WebM assets.
