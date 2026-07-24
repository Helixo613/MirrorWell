# MirrorWell: API Reference (Internal Module Contracts)

> **For AI coding agents:** MirrorWell has **no HTTP API, no base URL, no auth tokens**; there is no server. This document specifies the internal module contracts at the same rigor an HTTP API doc would: exact signatures, full example inputs/outputs (shown as JSON), every error case, and inline non-negotiable rules. These contracts are what the **frontend track** and **ML track** build against; the **backend track** implements them (internals: `BACKEND.md`).
>
> Equivalents map for anyone expecting an HTTP doc:
> - **Base URL** → ES module imports from `src/sensing/`, `src/metrics/`, `src/session/`, `src/data/`.
> - **Auth scheme** → the `SafetyGate` state machine (§2). Operations are gated by attestation state, not tokens. Gate matrix: §17.
> - **Dev mode** → `VITE_ENABLE_DEBUG_HUD=true` + `npm run seed:dev` (deterministic dataset, DATABASE.md §6). Demo Mode (`SafetyGate.enterDemoMode`) is a *product* feature, not a dev bypass.
> - **Test credentials** → none exist; the seeded profile from `seed:dev` is the test identity.
>
> **Rules that apply to every contract below:** all timestamps UTC ISO 8601; all IDs uuid v4; every thrown error is a `MirrorWellError` (§1); no method performs a network call; no method accepts or returns image/video/landmark data except where explicitly typed (`LandmarkEngine`, `QualityMonitor`, `NormalizationLayer`; hot path only, never persisted).

## Table of Contents

1. [Error model](#1-error-model)
2. [Gate model (SafetyGate)](#2-gate-model-safetygate)
3. [StorageService](#3-storageservice)
4. [CaptureService](#4-captureservice)
5. [LandmarkEngine](#5-landmarkengine)
6. [QualityMonitor](#6-qualitymonitor)
7. [NormalizationLayer](#7-normalizationlayer)
8. [MetricEngine](#8-metricengine)
9. [RepDetector](#9-repdetector)
10. [SessionController](#10-sessioncontroller)
11. [CalibrationFlow](#11-calibrationflow)
12. [TrendsService](#12-trendsservice)
13. [ExportService](#13-exportservice)
14. [SettingsService](#14-settingsservice)
15. [Config module shapes](#15-config-module-shapes)
16. [Error-code reference](#16-error-code-reference)
17. [Gate quick-reference matrix](#17-gate-quick-reference-matrix)
18. [FeedbackRenderer](#18-feedbackrenderer)

---

## 1. Error model

Every error thrown by any service:

```json
{
  "name": "MirrorWellError",
  "code": "QUALITY_TOO_LOW",
  "message": "Calibration capture rejected: qualityScore 0.54 < 0.7",
  "recoverable": true
}
```

- `code`: one of the canonical codes (§16). Screens branch on `code` only.
- `message`: developer-facing, console-only. **Never shown to users**, user copy comes from `src/config/strings.ts` keyed by `code`.
- `recoverable`: `true` → the UI offers retry/fix guidance; `false` → blocking screen (only `MODEL_LOAD_FAILED` and `DB_UNAVAILABLE` are ever `false`).

---

## 2. Gate model (SafetyGate)

`src/session/safety.ts`. The app's "auth": three mutually exclusive states, **UNATTESTED** (fresh install / consent version bumped), **ATTESTED** (onboarding completed at current `VITE_CONSENT_VERSION`), **DEMO** (in-memory, ARCHITECTURE §11).

### `SafetyGate.isAttested(): Promise<boolean>`

Returns `true` iff `user_profile.attestedAt != null && user_profile.consentVersion === VITE_CONSENT_VERSION`.

### `SafetyGate.recordAttestation(consentVersion: string): Promise<void>`

Persists attestation onto the **existing** profile row. `StorageService.saveProfile` (with the user's selected `assignedExercises`) must be called first, throws `VALIDATION_FAILED` if no valid profile exists. `OnboardingScreen` therefore saves in this order on its final step: profile first, attestation second (FRONTEND §2.1).

**Input example:** `"1"` · **Output:** resolves void · **Errors:** `DB_UNAVAILABLE`, `VALIDATION_FAILED` (version ≠ current env value)

> **Rule:** the four attestation checkboxes (diagnosed / clinician-assigned / 18+ / understands non-diagnostic scope) are UI-level; this method must only be called after all four are checked. TESTS.md verifies the screen cannot call it otherwise.

### `SafetyGate.enterDemoMode(): void` / `SafetyGate.isDemoMode(): boolean` / `SafetyGate.exitDemoMode(): void`

Enters/leaves DEMO (in-memory flag). Full rule set in ARCHITECTURE §11: watermark, no persistence, blocked screens, reload exits.

`exitDemoMode()` clears the flag and touches nothing else (no storage read or write, so it is callable from inside demo, where every write is refused). Its one caller is `OnboardingScreen` on mount: reaching that screen **is** the documented demo close-out (§17 lists `OnboardingScreen` as ✅ *"exits demo"* in DEMO; FRONTEND §2.5 "ends at `OnboardingScreen`"), and the screen re-derives the gate from `isAttested()` afterwards rather than assuming UNATTESTED.

> **DOCS-CHANGE (Reconvergence, 2026-07-23):** `exitDemoMode` is new. `recordAttestation` was the only documented exit and it *writes*, impossible from DEMO, so demo was a one-way door until a page reload, and the `SummaryScreen` → `OnboardingScreen` close-out silently landed elsewhere. ARCHITECTURE §11 makes the exit a safety property, so it needed a real one. Named to match the existing `enterDemoMode`/`isDemoMode` pair; no new canonical identifier (ARCHITECTURE §12 tracks services, screens, tables, fields, events, error codes and types; not method names).

> **Rule:** while `isDemoMode()` is true, **every `StorageService` write throws** `VALIDATION_FAILED` with message `"demo mode is read-only"`. This is a backstop, correctly written callers never reach it.

---

## 3. StorageService

`src/data/storage.ts`. Sole owner of `mirrorwell_db` (schema: DATABASE.md §2; validation matrix: DATABASE.md §3).

### `getProfile(): Promise<UserProfile | null>`

**Response example:**
```json
{
  "profileId": "6f1a2c9e-8b1d-4e5f-9a3c-2d7b8e4f0a11",
  "createdAt": "2026-07-01T09:14:03.000Z",
  "affectedSide": "left",
  "assignedExercises": ["EX_SMILE", "EX_BROW_RAISE"],
  "attestedAt": "2026-07-01T09:16:40.000Z",
  "consentVersion": "1"
}
```
**Errors:** `DB_UNAVAILABLE`

### `saveProfile(p: UserProfile): Promise<void>`

**Errors:** `DB_UNAVAILABLE`, `VALIDATION_FAILED` (any DATABASE §3 rule; e.g. empty `assignedExercises`, invalid `affectedSide`)

### `getSettings(): Promise<AppSettings | null>`

Gets the `app_settings` row with singleton key `"singleton"`. **Errors:** `DB_UNAVAILABLE`

### `saveSettings(settings: AppSettings): Promise<void>`

Persists the `app_settings` singleton. **Errors:** `DB_UNAVAILABLE`, `VALIDATION_FAILED` (Demo Mode is read-only)

### `saveBaseline(b: CalibrationBaseline): Promise<string>`

Persists a new calibration and atomically deactivates the previous active baseline.

**Request example:**
```json
{
  "baselineId": "0b7e4d2a-1c3f-4a8b-b6d9-5e2f8a7c4d10",
  "profileId": "6f1a2c9e-8b1d-4e5f-9a3c-2d7b8e4f0a11",
  "capturedAt": "2026-07-01T09:25:11.000Z",
  "neutralStats": {
    "REGION_BROW":         { "left": { "u": 0.0, "v": 0.418 }, "right": { "u": 0.0, "v": 0.421 } },
    "REGION_EYELID":       { "left": { "u": 0.0, "v": 0.112 }, "right": { "u": 0.0, "v": 0.108 } },
    "REGION_MOUTH_CORNER": { "left": { "u": 0.0, "v": 0.507 }, "right": { "u": 0.0, "v": 0.503 } },
    "REGION_LIP":          { "left": { "u": 0.0, "v": 0.231 }, "right": { "u": 0.0, "v": 0.229 } }
  },
  "comfortableMax": { "EX_SMILE": 0.62, "EX_BROW_RAISE": 0.41 },
  "neutralActivation": { "EX_SMILE": 0.02, "EX_BROW_RAISE": 0.11 },
  "qualityScore": 0.91,
  "noiseFloorSymmetry": 0.041,
  "noiseFloorDisplacement": 0.008,
  "isActive": 1
}
```
**Response:** `"0b7e4d2a-1c3f-4a8b-b6d9-5e2f8a7c4d10"`
**Errors:** `DB_UNAVAILABLE`; `VALIDATION_FAILED` (missing region keys, non-finite vector components, missing noise fields, `comfortableMax` keys ⊄ `assignedExercises`; `neutralActivation`, optional field, DATABASE §3: keys ⊄ `assignedExercises`, values outside `[0, 1)`, or value ≥ `comfortableMax[key]`); `QUALITY_TOO_LOW` (`qualityScore < 0.7`, distinct code so `CalibrationScreen` can show capture coaching, not a generic error)

> **Rule:** the isActive flip (old → 0, new → 1) happens inside the same Dexie transaction as the insert. Two active baselines must be impossible at any observable instant.

### `getActiveBaseline(): Promise<CalibrationBaseline | null>`

Same shape as above. **Errors:** `DB_UNAVAILABLE`

### `saveSession(s: SessionRecordInput): Promise<string>`

One transaction: `session_record` + all `exercise_result` rows + all `rep_metric` rows.

**Request example:**
```json
{
  "sessionId": "3c8f5b1d-9e2a-4c7b-8d4f-1a6e9b3c5d20",
  "profileId": "6f1a2c9e-8b1d-4e5f-9a3c-2d7b8e4f0a11",
  "baselineId": "0b7e4d2a-1c3f-4a8b-b6d9-5e2f8a7c4d10",
  "startedAt": "2026-07-05T08:00:12.000Z",
  "endedAt": "2026-07-05T08:06:47.000Z",
  "endReason": "completed",
  "results": [
    {
      "resultId": "a1b2c3d4-0001-4000-8000-000000000001",
      "exerciseId": "EX_SMILE",
      "repsCompleted": 10,
      "meanSymmetryIndex": 0.66,
      "meanEffortIndex": 0.43,
      "easeOffCount": 2,
      "lowQualityFramePct": 0.08,
      "reps": [
        { "repId": "a1b2c3d4-0002-4000-8000-000000000002", "repIndex": 0,
          "peakSymmetryIndex": 0.71, "peakEffortIndex": 0.47,
          "durationMs": 1900, "easeOffTriggered": 0 }
      ]
    }
  ]
}
```
**Response:** `"3c8f5b1d-9e2a-4c7b-8d4f-1a6e9b3c5d20"`
**Errors:** `DB_UNAVAILABLE`; `VALIDATION_FAILED` (any DATABASE §3 rule; unknown `baselineId`/`profileId`; demo mode)

> **Rule:** a thrown error anywhere in the transaction leaves **zero** rows. TESTS.md includes a forced mid-transaction failure test.
> **Type-conversion note:** `RepEvent.easeOffTriggered` is `boolean` on the event surface; `SessionController` converts it to `0 | 1` during session assembly (IndexedDB indexability, DATABASE.md §1). Likewise `RepEvent.durationMs` is a raw difference of frame timestamps (fractional performance-clock ms); `SessionController` rounds it to the integer `rep_metric.durationMs` (DATABASE §3: "integer > 0") during the same assembly; an unrounded value would make `saveSession` reject the whole completed session.

### `getSessions(range: {from: string; to: string}): Promise<SessionRecordFull[]>`

Returns sessions (with nested results and reps) whose `startedAt` ∈ range, newest first. **Errors:** `DB_UNAVAILABLE`, `VALIDATION_FAILED` (malformed dates, `from > to`)

### `deleteAllData(): Promise<void>`

Clears all six tables in one transaction. **Errors:** `DB_UNAVAILABLE`

> **Rule:** callable only from `SettingsScreen` after typed confirmation ("DELETE"). No other code path may call it.

---

## 4. CaptureService

`src/sensing/capture.ts`. Hot-path head. See BACKEND §1.1 for internals.

| Method | Input | Output | Errors |
|---|---|---|---|
| `start(constraints?)` | optional `MediaTrackConstraints` | `Promise<void>` | `CAMERA_DENIED` (user refused, recoverable, show permission guidance), `CAMERA_UNAVAILABLE` (no device / in use; recoverable, show device guidance) |
| `stop()` |, | `void` (camera light must go off) |, |
| `onFrame(cb)` | `(video: HTMLVideoElement, timestampMs: number) => void` | `() => void` unsubscribe |, |
| `onStop(cb)` | `() => void` | `() => void` unsubscribe |, |
| `isRunning()` |, | `boolean` |, |

> **DOCS-CHANGE (Reconvergence, 2026-07-23):** `onStop` is new. `stop()` announces itself to these listeners **after** the tracks are released; `stop()` does **not** clear `onFrame` subscribers, because `SessionScreen`'s pause → resume stops and restarts the camera on the *same* subscription. The one consumer that cannot survive a stop is a capture window that closes only on an arriving frame: it hung forever and orphaned its subscriber for the page lifetime, so the next session ran two `LandmarkEngine.detect()` per frame on one timestamp. `openFrameSource` (`src/session/frames.ts`) takes an optional `onCameraStopped` and does the subscribing; no other caller needs `onStop` directly.

> **Rule:** latest-frame-wins; never queue.
> **Rule (abort):** a consumer whose window closes only on an arriving frame must pass `onCameraStopped` and treat the abort as `CAMERA_UNAVAILABLE`. Resolving a partial capture instead would let the next window re-open the camera on an unmounted screen.
> **Rule (camera lifecycle):** in production, the stream may be open only while `CalibrationScreen` or `SessionScreen` is mounted. Narrow exception: **dev-only harnesses under `src/dev/`** (excluded from the prod bundle) may open the camera for validation and live tooling, and may record its stream via `MediaRecorder` solely for consented fixture-master capture (download-only; SAFETY §6 exception); no production screen or service may rely on either path.

---

## 5. LandmarkEngine

`src/sensing/landmarks.ts`. The only ML call site (MODEL_AND_DATA.md owns model selection/validation).

### `init(): Promise<void>`

Loads the bundled WASM runtime from `/wasm/` (via `FilesetResolver.forVisionTasks('/wasm')`; never a CDN) and `/models/face_landmarker.task` (both hash-verified at postinstall; BACKEND §1.2). **Errors:** `MODEL_LOAD_FAILED` (`recoverable: false` → blocking retry screen; covers both runtime and model load failures)

### `detect(video: HTMLVideoElement, timestampMs: number): LandmarkFrame`

Passes the playing video element straight to FaceLandmarker's `detectForVideo`; no `VideoFrame`/WebCodecs construction (avoids a Firefox compatibility risk entirely).

**Response example (truncated array):**
```json
{
  "landmarks": [ { "x": 0.4312, "y": 0.5127, "z": -0.0231 }, "… 478 total …" ],
  "headPose": [0.998, -0.021, 0.055, 0.0, "… 16 floats, row-major 4×4 …"],
  "facePresent": true,
  "timestampMs": 187423.6
}
```

> **Contract note:** `FaceLandmarkerResult` exposes **no per-frame confidence score** (it contains only `faceLandmarks`, `faceBlendshapes`, `facialTransformationMatrixes`). `facePresent` is defined as `faceLandmarks` being non-empty. Detection sensitivity is configured via the FaceLandmarker *options* `minFaceDetectionConfidence` / `minFacePresenceConfidence` / `minTrackingConfidence` (defaults 0.5, values from `thresholds.ts` §15).

### `isReady(): boolean`

Returns `true` after a successful `init()`.

**Errors (detect):** `NOT_INITIALIZED` (call `init()` first), `INFERENCE_FAILED` (orchestrator converts to `FACE_LOST` **before** `QualityMonitor.evaluate` by passing `null`; never crashes a session)

> **Rule:** MediaPipe types never escape this module; downstream consumes `LandmarkFrame` only. The former "never blendshapes downstream" rule is REVERSED 2026-07-19 (blendshape-si-v1): after the geometry family exhausted its stop rule on V1 B3 (three rejected candidates, `tests/analysis/rejected/`), blendshape probes on the same fixtures showed B3 0.006–0.051 and demonstrated unilateral sensitivity (smirk SI 0.43/0.72 vs 0.99 symmetric). Blendshapes are now the primary SI/effort source; the atypical-face concern stands as a documented risk gated at V2 palsy-fixture validation, and geometry modules are retained as cross-check (MODEL_AND_DATA §2/§7).

---

## 6. QualityMonitor

`src/sensing/quality.ts`.

### `evaluate(video: HTMLVideoElement, lf: LandmarkFrame | null): QualityResult`

Returns a discriminated `QualityResult` (exact shape: ARCHITECTURE §13):

- `{ state: 'QUALITY_OK', frame: ApprovedFrame }`, only branch that carries a frame
- `{ state: <non-OK QualityState> }`; **no** `frame` key

`QualityState` values: `"QUALITY_OK" | "LOW_LIGHT" | "FACE_LOST" | "TOO_FAR" | "POSE_OUT_OF_RANGE" | "LOW_CONFIDENCE"`. Gate order and initial thresholds: BACKEND §1.3 / ARCHITECTURE §7.

`INFERENCE_FAILED` is **not** observed inside `evaluate`. The orchestrator (`SessionController` or a `src/dev/` harness) catches it from `LandmarkEngine.detect` and calls `evaluate(video, null)`, which yields `{ state: 'FACE_LOST' }`.

> **Rule (structural fail-safe / type barrier):** `ApprovedFrame` is constructible only inside `quality.ts`; `normalize` / geometry (`measureAbsolute`) accept only `ApprovedFrame`, bad-frame metrics are a **compile error**, not a runtime policy.

---

## 7. NormalizationLayer

`src/metrics/normalize.ts` (+ geometry kernel `src/metrics/geometry.ts`).

### Geometry kernel (baseline-free bootstrap)

```typescript
measureAbsolute(af: ApprovedFrame): AbsoluteFeatures
```

`AbsoluteFeatures` = face-local vector features per region/side in IOD units (ARCHITECTURE §13). Used by calibration bootstrap (`CalibrationFlow.captureNeutral`) and as the inner step of `normalize`. **Baseline-free by design (DG-2):** this is the only path that may produce geometry without a stored baseline. **Zero baselines, identity defaults, and ephemeral fake baselines are explicitly forbidden**; if no real baseline exists yet, call `measureAbsolute`, never invent neutral zeros.

### `setBaseline(b: CalibrationBaseline): void` · `clearBaseline(): void`

**Errors:** `NO_BASELINE` (invalid/missing baseline object)

### `normalize(af: ApprovedFrame): NormalizedFrame`

Accepts **only** `ApprovedFrame` (ARCHITECTURE §13). Pipeline: `measureAbsolute(af)` → subtract stored `neutralStats` → vector `regionDisplacements`.

**Response example:**
```json
{
  "regionDisplacements": {
    "REGION_BROW":         { "left": { "u": 0.001, "v": 0.004 }, "right": { "u": -0.001, "v": 0.005 } },
    "REGION_EYELID":       { "left": { "u": 0.0,   "v": 0.001 }, "right": { "u": 0.0,    "v": 0.002 } },
    "REGION_MOUTH_CORNER": { "left": { "u": 0.041, "v": 0.012 }, "right": { "u": -0.028, "v": 0.010 } },
    "REGION_LIP":          { "left": { "u": 0.006, "v": 0.0   }, "right": { "u": -0.007, "v": 0.0   } }
  },
  "timestampMs": 187423.6
}
```
Values are vector displacements from `neutralStats`, in inter-ocular-distance units. **Errors:** `NO_BASELINE` only. `POSE_OUT_OF_RANGE` is **not** thrown here, pose is gated inside `QualityMonitor` before an `ApprovedFrame` can exist, so that error is unreachable behind the type barrier (removed from this contract).

---

## 8. MetricEngine

`src/metrics/metrics.ts`. Deterministic module-singleton (same held-state pattern as `NormalizationLayer` §7); not React state, not storage, not DOM.

> **DOCS-CHANGE (Task 7, 2026-07-10):** `compute()`'s `effortIndex` denominator is `comfortableMax[exerciseId]` (ARCHITECTURE §7), which lives on `CalibrationBaseline`; a value `MetricEngine` cannot fetch itself (BACKEND §1.5 forbids storage access) and that a per-frame `NormalizedFrame` has no business carrying (it's a per-session constant, not a per-frame value). ARCHITECTURE §7 also assigns 5-frame smoothing and the ease-off sustained-duration condition to `MetricEngine`, both of which are cross-frame state that a single `compute(nf, exerciseId)` call cannot hold. Three methods are added below, mirroring `NormalizationLayer`'s existing `setBaseline`/state pattern; no new identifiers invented, only the already-canonical `setBaseline`/`reset` shapes extended to this module.

### `setBaseline(b: CalibrationBaseline): void`

Called once by `SessionController.start` (alongside `NormalizationLayer.setBaseline`), and again by `CalibrationFlow`/tests as needed. **Errors:** `NO_BASELINE` (invalid/missing baseline object, same rule as §7).

### `compute(nf: NormalizedFrame, exerciseId: ExerciseId): MetricSample`

**Response example (normal):**
```json
{ "symmetryIndex": 0.68, "effortIndex": 0.44, "timestampMs": 187423.6 }
```
**Response example (below movementFloor; no movement, no score):**
```json
{ "symmetryIndex": null, "effortIndex": 0.02, "timestampMs": 187423.6 }
```
**Errors:** `NO_BASELINE` (no `setBaseline` call yet)

> **Rule:** raw and 5-frame-median-smoothed values both exist internally; everything downstream (display, reps, storage) consumes **smoothed**; `DebugHud` shows both.

### `isEaseOffActive(): boolean`

`true` once smoothed `effortIndex` has stayed `> easeOffThreshold` (0.60) continuously for ≥ `easeOffSustainMs` (300 ms); resets the moment `effortIndex` drops back to ≤ 0.60. Naming mirrors the existing `isReady()`/`isRunning()`/`isDemoMode()` boolean-query convention.

### `getLastRaw(): { symmetryIndex: number | null; effortIndex: number } | null`

> **DOCS-CHANGE (Task 8, 2026-07-10):** the canonical `DebugHud` CSV columns (ARCHITECTURE §12) include `symmetryIndexRaw`/`effortIndexRaw` alongside the smoothed pair, and this section already stated "DebugHud shows both"; but `MetricSample` (consumed by `RepDetector`/`SessionController`/`StorageService`) is deliberately smoothed-only and stays that way. `getLastRaw()` is a dev-only accessor returning the most recent pre-smoothing values, captured as a side-value inside `compute()` itself. `null` before the first `compute()` call or immediately after `reset()`.

### `reset(): void`

Clears the smoothing window, the ease-off sustain timer, and `getLastRaw()`'s cached value. `SessionController` calls this on every exercise transition (same rule as `RepDetector.reset()` below); a unit test asserts no state leakage between exercises.

---

## 9. RepDetector

`src/metrics/reps.ts`. Stateful per exercise.

### `feed(sample: MetricSample): RepEvent | null` · `reset(): void`

**`RepEvent` example:**
```json
{
  "repIndex": 4,
  "peakSymmetryIndex": 0.71,
  "peakEffortIndex": 0.47,
  "durationMs": 1900,
  "easeOffTriggered": false
}
```
Thresholds (`repStartThreshold` 0.15, `repMinDurationMs` 800, `repEndThreshold` 0.10) from `thresholds.ts`.

> **Rule:** `SessionController` must call `reset()` on every exercise transition; a unit test asserts no state leakage between exercises.

### `getState(): 'idle' | 'active'`

> **DOCS-CHANGE (Task 8, 2026-07-10):** the canonical `DebugHud` CSV columns (ARCHITECTURE §12) include `repState`, and `feed()`/`reset()` alone give no way to observe whether a rep is currently in progress. `'idle' | 'active'` is not defined elsewhere in the docs; it is the simplest honest exposure of the state `feed()` already tracks internally, named to match the `isReady()`/`isRunning()`/`isDemoMode()` boolean-query convention used elsewhere in this codebase.

---

## 10. SessionController

`src/session/controller.ts`. The frontend's primary integration surface.

### `start(exerciseIds: ExerciseId[]): Promise<void>`

Preconditions checked in order: gate (ATTESTED or DEMO) → active baseline exists → baseline drift re-check passes (else recalibration prompt) → camera starts.

**Errors:** `NOT_ATTESTED`, `NO_BASELINE`, `RECALIBRATION_REQUIRED`, `CAMERA_DENIED`, `CAMERA_UNAVAILABLE`, `VALIDATION_FAILED` (empty list or non-assigned exercise)

### `advance(): void` · `extendRest(seconds: number): void`

`advance` moves DEMO→REPS or ends REST early. `extendRest` adds time, **shortening does not exist** (accessibility no-time-pressure rule, FRONTEND §4).

### `stop(reason: EndReason): Promise<SessionRecordFull>`

Always persists the partial/full session (except DEMO, where it returns the record without persisting).

**Response:** the saved `SessionRecordFull` (exact shape: ARCHITECTURE §13; nested results + reps as in §3 `saveSession` request).

**Errors:** `VALIDATION_FAILED` (no active session; `stop()` called before any `start()`; the rejection is not cached, so a subsequent real session still resolves normally). `stop()` is otherwise idempotent: repeated calls within one session return the same settled promise.

### `on(event, cb): () => void`: the event surface (complete)

| Event | Payload example |
|---|---|
| `stateChanged` | `{ "exerciseId": "EX_SMILE", "state": "REPS" }` |
| `metricUpdate` (≤ 15 Hz) | `{ "sample": { "symmetryIndex": 0.68, "effortIndex": 0.44, "timestampMs": 187423.6 } }` |
| `qualityUpdate` | `{ "state": "LOW_LIGHT" }` |
| `repCompleted` | `{ "event": { "repIndex": 4, "peakSymmetryIndex": 0.71, "peakEffortIndex": 0.47, "durationMs": 1900, "easeOffTriggered": false } }` |
| `easeOff` | `{ "active": true }` |
| `sessionEnded` | `{ "record": { "sessionId": "…", "endReason": "completed", "results": ["…"] } }` |
| `qualityOfferStop` | `{ "visible": true }` |

> **Rule:** no other events exist. The UI must not reach into pipeline internals; if a screen needs data not carried by these events, the event surface is amended here first.

---

## 11. CalibrationFlow

`src/session/calibration.ts`. Gated: ATTESTED only (DEMO uses its own in-memory quick-calibration; UNATTESTED blocked).

| Method | Signature / output | Errors |
|---|---|---|
| `captureNeutral()` | `Promise<NeutralCaptureResult>`, `{ neutralStats, qualityScore }` (exact shape: ARCHITECTURE §13). Example: `{"neutralStats": {"REGION_BROW": {"left": {"u": 0.0, "v": 0.418}, "right": {"u": 0.0, "v": 0.421}}, "…": "…"}, "qualityScore": 0.91}` | `QUALITY_TOO_LOW` (coaching UI, retry), `CAMERA_*`, `NOT_ATTESTED` |
| `captureComfortableMax("EX_SMILE")` | `Promise<number>`, e.g. `0.62` (0..1 blendshape-activation units, DATABASE §2) | same |
| `runNoiseFloorSelfTest()` | `Promise<number>`, e.g. `0.041` (persisted with the active baseline; field ownership: ARCHITECTURE §12) | same + `DB_UNAVAILABLE` |
| `checkBaselineDrift()` | `Promise<'ok' \| 'recalibrate'>` | `NO_BASELINE`, `CAMERA_*` |

> **Rule:** `comfortableMax` = **median** of 3 gentle reps, never max (resists the straining outlier). Copy for these captures must include the word "gentle" (SAFETY §8 audit checks this).

---

## 12. TrendsService

`src/data/trends.ts`. Consumers: `TrendsScreen`, `CaregiverScreen`, `ExportService`.

### `getTrend(exerciseId: ExerciseId, granularity: 'weekly' | 'monthly'): Promise<TrendSeries>`

Exact shape: ARCHITECTURE §13.

**Response example:**
```json
{
  "exerciseId": "EX_SMILE",
  "granularity": "monthly",
  "baselineId": "0b7e4d2a-1c3f-4a8b-b6d9-5e2f8a7c4d10",
  "points": [
    { "periodStart": "2026-05-01", "meanSymmetryIndex": 0.61, "sampleCount": 14, "aboveNoiseFloor": true  },
    { "periodStart": "2026-06-01", "meanSymmetryIndex": 0.63, "sampleCount": 17, "aboveNoiseFloor": false },
    { "periodStart": "2026-07-01", "meanSymmetryIndex": 0.71, "sampleCount": 4,  "aboveNoiseFloor": true  }
  ]
}
```
**Errors:** `DB_UNAVAILABLE`, `VALIDATION_FAILED` (unknown exercise)

> **Rules:** one series = one `baselineId` (the active one); `aboveNoiseFloor: false` when period-over-period change < the **active baseline's** `noiseFloorSymmetry` (read from `calibration_baseline`, never `app_settings`; ARCHITECTURE §4 / §12), UI renders those as "steady", never up/down; `quality_abandoned` and `red_flag_stopped` sessions are excluded from aggregation.

### `getAdherence(range): Promise<Adherence>`

Exact shape: ARCHITECTURE §13.

**Response example:**
```json
{ "sessionsPerWeek": [4, 5, 3, 5, 4, 2], "completionRate": 0.86 }
```

`completionRate` is completed sessions divided by **all sessions in the requested range**. Every `session_record` represents a user-started session; MirrorWell has no planned-session schedule, so non-completed sessions remain in the denominator and no missed or expected sessions are invented.

---

## 13. ExportService

`src/data/export.ts`. Gated: ATTESTED only.

### `generateSummary(range: {from: string; to: string}): Promise<{json: Blob; html: Blob}>`

JSON validates against `tests/schemas/export.schema.json`. **Full example:**

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-05T10:02:00.000Z",
  "nonDiagnosticNotice": "MirrorWell is an exercise-support tool. This summary describes exercise activity and movement symmetry relative to the user's own calibration. It is not a clinical assessment, score, or measure of recovery.",
  "range": { "from": "2026-05-01", "to": "2026-07-05" },
  "profile": { "affectedSide": "left", "assignedExercises": ["EX_SMILE", "EX_BROW_RAISE"] },
  "noiseFloorSymmetry": 0.041,
  "adherence": { "sessionsPerWeek": [4, 5, 3, 5, 4, 2], "completionRate": 0.86 },
  "trends": [ { "exerciseId": "EX_SMILE", "granularity": "monthly", "baselineId": "…", "points": ["…"] } ],
  "sessions": [ { "sessionId": "…", "startedAt": "…", "endedAt": "…", "endReason": "completed", "results": ["…"] } ]
}
```

`noiseFloorSymmetry` in the export is sourced from the **active `calibration_baseline`** row (not `app_settings`). The HTML blob is a printable one-page A4 summary carrying the same non-diagnostic header and the same underlying data (trend series, adherence, sessions); it may present that data more compactly than the JSON to stay one page. **Errors:** `NOT_ATTESTED` (unattested **or** in Demo Mode; an attested user can `enterDemoMode()`, and export is ❌ in DEMO per §17), `NO_BASELINE` (attested but never calibrated; reachable, since §17 gates `ExportScreen` on attestation alone), `DB_UNAVAILABLE`, `VALIDATION_FAILED` (bad range, or no profile row)

> **Rules:** download only; no Web Share API, no clipboard auto-copy; no fields beyond the schema; `nonDiagnosticNotice` is mandatory and its text lives in `strings.ts` (audited, SAFETY §8).
---

## 14. SettingsService

`src/data/settings.ts`.

### `get(): Promise<AppSettings>` · `update(partial: Partial<AppSettings>): Promise<AppSettings>`

**`update` request example:** `{ "caregiverViewEnabled": true }` → **response:** the full updated `AppSettings` (shape: DATABASE §2). **Errors:** `DB_UNAVAILABLE`, `VALIDATION_FAILED` (e.g. `textScale` outside `[1.0..2.0]`)

> **Rule:** `caregiverViewEnabled` may only be toggled from `SettingsScreen` (it is the patient's consent act for `CaregiverScreen`). Noise floors (`noiseFloorSymmetry`, `noiseFloorDisplacement`) live on `calibration_baseline` and are written only via `CalibrationFlow` → `StorageService.saveBaseline`; not through `SettingsService`.

---

## 15. Config module shapes

### `src/config/exercises.ts`

```json
{
  "EX_SMILE": {
    "exerciseId": "EX_SMILE",
    "regionId": "REGION_MOUTH_CORNER",
    "landmarkIndices": { "left": ["<mesh point ids, fixed in IMPLEMENTATION Task 6>"], "right": ["…"] },
    "blendshapePair": { "left": "mouthSmileLeft", "right": "mouthSmileRight" },  // absent for EX_PUCKER (open decision; no per-side pucker blendshape; MetricEngine throws VALIDATION_FAILED)
    "displayName": "Gentle smile",
    "instruction": "Let a small, slow smile come; about half of what feels possible. Gentle is the goal.",
    "demoAssetPath": "/demo-assets/EX_SMILE.webm",
    "repsPerSet": 10, "sets": 1, "restSeconds": 20
  }
}
```
All four `EX_*` entries follow this shape; `EX_EYE_CLOSURE.repsPerSet = 5` (eye-comfort rule). Dosing fixed in v1, **needs verification** with mentor.

### `src/config/thresholds.ts`

Every tunable, exported as a single frozen object, each with a comment naming its owning doc section: `landmarker {minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5}` (FaceLandmarker option thresholds; the only confidence controls that exist), `qualityGates {lumaMin: 60, interOcularMinFrac: 0.09, poseMaxDeg: 22, jitterMaxPct: 0.012}` (`interOcularMinFrac` replaces the retired `interOcularMinPx`, distance gate is a fraction of video width so the same face scale passes at 640×480 and 1280×720; `lumaMin` is face-region mean luma on the 64×64 downsample; `jitterMaxPct` is RMS second-difference / IOD), `metrics {movementFloorPct: 0.006, effortTargetZone: [0.30, 0.50], easeOffThreshold: 0.60, easeOffSustainMs: 300, smoothingWindow: 5, gapResetMs: 250}`, `blendshapes {activationFloor: 0.03, strainAccessoryFloor: 0.08}` (SI undefined below this max per-side blendshape score, candidate blendshape-si-v1, probe-derived initial value), `reps {startThreshold: 0.10, endThreshold: 0.06, fullRepEffortMin: 0.45, strainMax: 0.40, minDurationMs: 800, minQualityFramePct: 0.60}`, `calibration {comfortableMaxMinRise: 0.15, minQualityScore: 0.7, neutralCaptures: 3, captureSeconds: 3, driftMaxPct: 0.08, staleDays: 14}` (`comfortableMaxMinRise` is the minimum rise ABOVE the resting read for a comfortable-max capture to be accepted; deliberately a separate, much higher tunable than `blendshapes.activationFloor`, which it previously shared. The two pull opposite ways: `activationFloor` wants to be low so faint movement still yields a symmetry ratio, while this must stay high because the value it guards becomes the DENOMINATOR of every later `effortIndex`. Sharing one constant meant loosening sensitivity silently loosened calibration, so a resting face could be accepted as a comfortable max), `session {qualityProblemOfferStopMs: 30000, metricEventMinIntervalMs: 66, restExtendSeconds: 30}` (`metricEventMinIntervalMs` throttles `SessionController`'s `metricUpdate` event to the ~15 Hz text-update rate `ARCHITECTURE.md` §3 specifies for `FeedbackRenderer`; the rep-close OK-frame fraction reuses `reps.minQualityFramePct` rather than a second `session`-scoped copy; `restExtendSeconds` is the seconds added per `SessionScreen` "+30 s" rest extension; the amount the screen passes to `SessionController.extendRest`, extend-only per FRONTEND §4), `feedback {voiceMinGapMs: 2500}` (minimum interval between accepted local `VoiceCoach` utterances; FRONTEND §2.4), `v1Protocol {neutralMs: 10000, smileHoldMs: 8000, prepMs: 3000, yawTargetMinDeg: 7, yawTargetMaxDeg: 13, trials: 2, minOkFramePct: 0.7, qualityOkRecentMs: 2000}` (dev-only live capture harness for the `MODEL_AND_DATA.md` §7 V1 statistical protocol, phase durations, trial count, yaw target band, and per-phase OK-frame bar for the B1a/B1b/B2/B3 kill-gate run; `qualityOkRecentMs` is the start-protocol enable window: last `QUALITY_OK` frame must be within this many ms), `liveDemo {symmetryBoundary: 0.85}` (dev-only live demo readout band; the symmetry index at or above which the demo reads "even on both sides"; sits in the gap the demo arc names, a real symmetric smile ≈ 0.98 versus one side deliberately restrained ≈ 0.4–0.7. Consumed only by `src/dev/liveDemoState.ts`, which is excluded from the production bundle; tune on real hardware).

**Local profile and UI presentation tunables:** `profile {nicknameMaxLength: 30, motivationMaxLength: 120}` (DATABASE §3: optional local-only profile text limits); `home {sessionLookbackDays: 7, morningStartHour: 12, eveningStartHour: 18, gardenWeeks: 8, gardenBloomSessions: 3, daysPerWeek: 7, sessions10: 10, sessions25: 25, practiceWeeks4Days: 28, gentleReps100: 100}` (FRONTEND §2.3/§2.5: local-date garden buckets and derived practice milestones); `summary {symmetryMostlyEvenMin: 0.85, symmetryFairlyEvenMin: 0.7, symmetrySomeDifferenceMin: 0.55}` (FRONTEND §2.5: plain-language symmetry buckets; no numeric grades shown), `trends {minPeriodsForChart: 2}` (FRONTEND §2.6: minimum periods before a trend chart renders), `export {defaultRangeWeeks: 8}` (FRONTEND §2.8: default export date window), `settings {textScaleMin: 1.0, textScaleMax: 2.0, textScaleStep: 0.1, saveFeedbackDismissMs: 2500}` (FRONTEND §2.9/§4: text-size control bounds + save-confirmation dismiss delay), `caregiver {noteMaxLength: 200}` (DATABASE §3. SAFETY §5 encouragement-note length limit).

> **Rule:** a numeric literal used by any service that does not come from this file is a review-blocking defect.

---

## 16. Error-code reference

| Code | Thrown by | Recoverable | UI behavior (strings.ts key) |
|---|---|---|---|
| `DB_UNAVAILABLE` | StorageService, all persisting services | **false** | Blocking notice: can't save progress in this browser mode; sessions/calibration disabled (Demo Mode still offered) |
| `VALIDATION_FAILED` | StorageService, SettingsService, SessionController | true | Generic "something went wrong" + log; indicates a caller bug, not a user problem |
| `QUALITY_TOO_LOW` | CalibrationFlow / saveBaseline | true | Capture coaching UI ("more light", "come closer") + retry |
| `MODEL_LOAD_FAILED` | LandmarkEngine.init | **false** | Blocking retry screen before calibration/session |
| `NOT_INITIALIZED` | LandmarkEngine.detect | true | Internal ordering bug; screens show generic error |
| `INFERENCE_FAILED` | LandmarkEngine.detect | true | Orchestrator converts to `FACE_LOST` before `evaluate` (passes `null`); never user-visible as an error |
| `NO_BASELINE` | NormalizationLayer, MetricEngine, SessionController | true | Route to `CalibrationScreen` |
| `RECALIBRATION_REQUIRED` | SessionController.start | true | Route to recalibration |
| `POSE_OUT_OF_RANGE` | QualityMonitor only (`QualityResult` state; not thrown by `normalize`) | true | Quality UX ("face the camera straight on") |
| `NOT_ATTESTED` | SafetyGate-gated methods | true | Redirect to `OnboardingScreen` |
| `CAMERA_DENIED` | CaptureService.start | true | Permission guidance screen with retry |
| `CAMERA_UNAVAILABLE` | CaptureService.start | true | Device guidance screen ("is another app using the camera?") |

---

## 17. Gate quick-reference matrix

Operation × gate state. ✅ allowed · ❌ blocked (error in parentheses) · ◐ allowed with Demo rules (in-memory only, watermarked, nothing persisted).

| Operation | UNATTESTED | ATTESTED | DEMO |
|---|---|---|---|
| `OnboardingScreen` / `recordAttestation` | ✅ | ✅ (re-consent) | ✅ (exits demo) |
| `enterDemoMode` | ✅ | ✅ |, |
| `CalibrationFlow.*` | ❌ (`NOT_ATTESTED`) | ✅ | ◐ in-memory quick-calibration only |
| `SessionController.start/advance/stop` | ❌ (`NOT_ATTESTED`) | ✅ | ◐ no persistence on `stop` |
| `StorageService` reads | ✅ (gate needs profile) | ✅ | ❌ except non-sensitive static config (implementation deferred; documented intent) |
| `StorageService` writes | ❌ except `saveProfile`/attestation | ✅ | ❌ (`VALIDATION_FAILED`, backstop) |
| `TrendsScreen` / `TrendsService` | ❌ (redirect) | ✅ | ❌ (screen unreachable) |
| `CaregiverScreen` | ❌ | ✅ **and** `caregiverViewEnabled === true` | ❌ |
| `ExportScreen` / `ExportService` | ❌ | ✅ | ❌ |
| `SettingsScreen` / `SettingsService.update` | ❌ (redirect) | ✅ | ❌ |
| `deleteAllData` | ✅ via the "start over" link on blocking-notice screens only (typed confirmation still required) | ✅ typed confirmation via `SettingsScreen` | ❌ |

> **Note on `deleteAllData` while UNATTESTED:** `SettingsScreen` is unreachable before attestation, so the §3 "SettingsScreen-only" rule has exactly one documented exception: blocking-notice screens (e.g. `DB_UNAVAILABLE`, corrupted-state recovery) may offer a "start over" link that invokes the same typed-confirmation flow. No other call path exists.

---

## 18. FeedbackRenderer

`src/session/renderer.ts`. All in-session output. Consistent with FRONTEND §2.4 layout and the FRONTEND §5 state table.

**Inputs consumed (nothing else):** smoothed `MetricSample`s (via `SessionController` `metricUpdate`), `QualityState` (via `qualityUpdate`), `easeOff {active}`, `repCompleted`, `stateChanged`, plus `AppSettings` display fields (`reducedFacePreview`, `showAffectedSideMarker`, `highContrast`, `audioCuesEnabled`, `hapticsEnabled`) and `user_profile.affectedSide` for the focus-side dot.

**Responsibility split:** **canvas layer** (redrawn at full fps): symmetry bar, **effort meter** (vertical gauge of the smoothed `effortIndex`; the value `RepDetector` counts on; with the `effortTargetZone` band drawn as a fixed landmark; fill clamped to [0..1], frozen/dimmed on non-`QUALITY_OK` exactly like the bar), guide arc, focus-side dot, camera-preview dimming. **DOM layer** (updated ≤ 15 Hz, `aria-live` where FRONTEND §4 requires): quality banners, ease-off chip, rep counter, rest timer, DEMO watermark. Audio cues via Web Audio; haptics via the Vibration API (Android only; never the sole channel).

**Public interface:**

```typescript
mount(canvas: HTMLCanvasElement, video: HTMLVideoElement): void
unmount(): void                                  // releases canvas/audio resources
render(sample: MetricSample | null, quality: QualityState): void   // called per frame by the hot path
setEaseOff(active: boolean): void
setExercise(exerciseId: ExerciseId): void        // switches arc pacing + labels
setRepCount(done: number, total: number): void
setWatermark(on: boolean): void                  // DEMO mode strip
applySettings(s: AppSettings, affectedSide: UserProfile['affectedSide']): void
```

> **Rules:** during any non-`QUALITY_OK` state the bar is frozen and visibly labeled; a moving bar on a bad frame is a critical defect (TESTS.md §3.3 pixel-diff test). No user-facing text is composed here; all strings come from `strings.ts` keyed by state.
