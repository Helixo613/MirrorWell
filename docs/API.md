# MirrorWell — API Reference (Internal Module Contracts)

> **For AI coding agents:** MirrorWell has **no HTTP API, no base URL, no auth tokens** — there is no server. This document specifies the internal module contracts at the same rigor an HTTP API doc would: exact signatures, full example inputs/outputs (shown as JSON), every error case, and inline non-negotiable rules. These contracts are what the **frontend track** and **ML track** build against; the **backend track** implements them (internals: `BACKEND.md`).
>
> Equivalents map for anyone expecting an HTTP doc:
> - **Base URL** → ES module imports from `src/sensing/`, `src/metrics/`, `src/session/`, `src/data/`.
> - **Auth scheme** → the `SafetyGate` state machine (§2). Operations are gated by attestation state, not tokens. Gate matrix: §17.
> - **Dev mode** → `VITE_ENABLE_DEBUG_HUD=true` + `npm run seed:dev` (deterministic dataset, DATABASE.md §6). Demo Mode (`SafetyGate.enterDemoMode`) is a *product* feature, not a dev bypass.
> - **Test credentials** → none exist; the seeded profile from `seed:dev` is the test identity.
>
> **Rules that apply to every contract below:** all timestamps UTC ISO 8601; all IDs uuid v4; every thrown error is a `MirrorWellError` (§1); no method performs a network call; no method accepts or returns image/video/landmark data except where explicitly typed (`LandmarkEngine`, `QualityMonitor`, `NormalizationLayer` — hot path only, never persisted).

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
- `message`: developer-facing, console-only. **Never shown to users** — user copy comes from `src/config/strings.ts` keyed by `code`.
- `recoverable`: `true` → the UI offers retry/fix guidance; `false` → blocking screen (only `MODEL_LOAD_FAILED` and `DB_UNAVAILABLE` are ever `false`).

---

## 2. Gate model (SafetyGate)

`src/session/safety.ts`. The app's "auth": three mutually exclusive states — **UNATTESTED** (fresh install / consent version bumped), **ATTESTED** (onboarding completed at current `VITE_CONSENT_VERSION`), **DEMO** (in-memory, ARCHITECTURE §11).

### `SafetyGate.isAttested(): Promise<boolean>`

Returns `true` iff `user_profile.attestedAt != null && user_profile.consentVersion === VITE_CONSENT_VERSION`.

### `SafetyGate.recordAttestation(consentVersion: string): Promise<void>`

Persists attestation onto the **existing** profile row. `StorageService.saveProfile` (with the user's selected `assignedExercises`) must be called first — throws `VALIDATION_FAILED` if no valid profile exists. `OnboardingScreen` therefore saves in this order on its final step: profile first, attestation second (FRONTEND §2.1).

**Input example:** `"1"` · **Output:** resolves void · **Errors:** `DB_UNAVAILABLE`, `VALIDATION_FAILED` (version ≠ current env value)

> **Rule:** the four attestation checkboxes (diagnosed / clinician-assigned / 18+ / understands non-diagnostic scope) are UI-level; this method must only be called after all four are checked. TESTS.md verifies the screen cannot call it otherwise.

### `SafetyGate.enterDemoMode(): void` / `SafetyGate.isDemoMode(): boolean`

Enters DEMO (in-memory flag). Full rule set in ARCHITECTURE §11 — watermark, no persistence, blocked screens, reload exits.

> **Rule:** while `isDemoMode()` is true, **every `StorageService` write throws** `VALIDATION_FAILED` with message `"demo mode is read-only"`. This is a backstop — correctly written callers never reach it.

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

### `saveBaseline(b: CalibrationBaseline): Promise<string>`

Persists a new calibration and atomically deactivates the previous active baseline.

**Request example:**
```json
{
  "baselineId": "0b7e4d2a-1c3f-4a8b-b6d9-5e2f8a7c4d10",
  "profileId": "6f1a2c9e-8b1d-4e5f-9a3c-2d7b8e4f0a11",
  "capturedAt": "2026-07-01T09:25:11.000Z",
  "neutralStats": {
    "REGION_BROW":        { "left": 0.418, "right": 0.421 },
    "REGION_EYELID":      { "left": 0.112, "right": 0.108 },
    "REGION_MOUTH_CORNER":{ "left": 0.507, "right": 0.503 },
    "REGION_LIP":         { "left": 0.231, "right": 0.229 }
  },
  "comfortableMax": { "EX_SMILE": 0.092, "EX_BROW_RAISE": 0.064 },
  "qualityScore": 0.91,
  "isActive": 1
}
```
**Response:** `"0b7e4d2a-1c3f-4a8b-b6d9-5e2f8a7c4d10"`
**Errors:** `DB_UNAVAILABLE`; `VALIDATION_FAILED` (missing region keys, non-finite values, `comfortableMax` keys ⊄ `assignedExercises`); `QUALITY_TOO_LOW` (`qualityScore < 0.7` — distinct code so `CalibrationScreen` can show capture coaching, not a generic error)

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
> **Type-conversion note:** `RepEvent.easeOffTriggered` is `boolean` on the event surface; `SessionController` converts it to `0 | 1` during session assembly (IndexedDB indexability, DATABASE.md §1).

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
| `start(constraints?)` | optional `MediaTrackConstraints` | `Promise<void>` | `CAMERA_DENIED` (user refused — recoverable, show permission guidance), `CAMERA_UNAVAILABLE` (no device / in use — recoverable, show device guidance) |
| `stop()` | — | `void` (camera light must go off) | — |
| `onFrame(cb)` | `(video: HTMLVideoElement, timestampMs: number) => void` | `() => void` unsubscribe | — |
| `isRunning()` | — | `boolean` | — |

> **Rule:** latest-frame-wins; never queue. > **Rule:** the stream may be open only while `CalibrationScreen` or `SessionScreen` is mounted.

---

## 5. LandmarkEngine

`src/sensing/landmarks.ts`. The only ML call site (MODEL_AND_DATA.md owns model selection/validation).

### `init(): Promise<void>`

Loads the bundled WASM runtime from `/wasm/` (via `FilesetResolver.forVisionTasks('/wasm')` — never a CDN) and `/models/face_landmarker.task` (both hash-verified at postinstall; BACKEND §1.2). **Errors:** `MODEL_LOAD_FAILED` (`recoverable: false` → blocking retry screen; covers both runtime and model load failures)

### `detect(video: HTMLVideoElement, timestampMs: number): LandmarkFrame`

Passes the playing video element straight to FaceLandmarker's `detectForVideo` — no `VideoFrame`/WebCodecs construction (avoids a Firefox compatibility risk entirely).

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

**Errors (detect):** `NOT_INITIALIZED` (call `init()` first), `INFERENCE_FAILED` (treated as `FACE_LOST` by `QualityMonitor` — never crashes a session)

> **Rule:** MediaPipe types never escape this module. Downstream consumes `LandmarkFrame` only, and **raw landmark geometry only — never blendshapes** (MODEL_AND_DATA §2).

---

## 6. QualityMonitor

`src/sensing/quality.ts`.

### `evaluate(video: HTMLVideoElement, lf: LandmarkFrame | null): QualityState`

Returns exactly one of `"QUALITY_OK" | "LOW_LIGHT" | "FACE_LOST" | "TOO_FAR" | "POSE_OUT_OF_RANGE" | "LOW_CONFIDENCE"`. Gate order and initial thresholds: BACKEND §1.3 / ARCHITECTURE §7.

> **Rule (structural fail-safe):** `QualityMonitor` is the only caller of `NormalizationLayer.normalize`, and calls it only on `QUALITY_OK`. Metric code running on a bad frame must be *impossible*, not just avoided.

---

## 7. NormalizationLayer

`src/metrics/normalize.ts`.

### `setBaseline(b: CalibrationBaseline): void` · `clearBaseline(): void`

**Errors:** `NO_BASELINE` (invalid/missing baseline object)

### `normalize(lf: LandmarkFrame): NormalizedFrame`

**Response example:**
```json
{
  "regionDisplacements": {
    "REGION_BROW":        { "left": 0.004, "right": 0.005 },
    "REGION_EYELID":      { "left": 0.001, "right": 0.002 },
    "REGION_MOUTH_CORNER":{ "left": 0.041, "right": 0.028 },
    "REGION_LIP":         { "left": 0.006, "right": 0.007 }
  },
  "timestampMs": 187423.6
}
```
Values are displacements from `neutralStats`, in inter-ocular-distance units, pose-corrected. **Errors:** `NO_BASELINE`, `POSE_OUT_OF_RANGE` (defensive; normally pre-gated)

---

## 8. MetricEngine

`src/metrics/metrics.ts`. Pure function. Math: ARCHITECTURE §7.

### `compute(nf: NormalizedFrame, exerciseId: ExerciseId): MetricSample`

**Response example (normal):**
```json
{ "symmetryIndex": 0.68, "effortIndex": 0.44, "timestampMs": 187423.6 }
```
**Response example (below movementFloor — no movement, no score):**
```json
{ "symmetryIndex": null, "effortIndex": 0.02, "timestampMs": 187423.6 }
```

> **Rule:** raw and 5-frame-median-smoothed values both exist internally; everything downstream (display, reps, storage) consumes **smoothed**; `DebugHud` shows both.

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

---

## 10. SessionController

`src/session/controller.ts`. The frontend's primary integration surface.

### `start(exerciseIds: ExerciseId[]): Promise<void>`

Preconditions checked in order: gate (ATTESTED or DEMO) → active baseline exists → baseline drift re-check passes (else recalibration prompt) → camera starts.

**Errors:** `NOT_ATTESTED`, `NO_BASELINE`, `CAMERA_DENIED`, `CAMERA_UNAVAILABLE`, `VALIDATION_FAILED` (empty list or non-assigned exercise)

### `advance(): void` · `extendRest(seconds: number): void`

`advance` moves DEMO→REPS or ends REST early. `extendRest` adds time — **shortening does not exist** (accessibility no-time-pressure rule, FRONTEND §4).

### `stop(reason: EndReason): Promise<SessionRecord>`

Always persists the partial/full session (except DEMO, where it returns the record without persisting).

**Response:** the saved `SessionRecordFull` (shape as §3 `saveSession` request).

### `on(event, cb): () => void` — the event surface (complete)

| Event | Payload example |
|---|---|
| `stateChanged` | `{ "exerciseId": "EX_SMILE", "state": "REPS" }` |
| `metricUpdate` (≤ 15 Hz) | `{ "sample": { "symmetryIndex": 0.68, "effortIndex": 0.44, "timestampMs": 187423.6 } }` |
| `qualityUpdate` | `{ "state": "LOW_LIGHT" }` |
| `repCompleted` | `{ "event": { "repIndex": 4, "peakSymmetryIndex": 0.71, "peakEffortIndex": 0.47, "durationMs": 1900, "easeOffTriggered": false } }` |
| `easeOff` | `{ "active": true }` |
| `sessionEnded` | `{ "record": { "sessionId": "…", "endReason": "completed", "results": ["…"] } }` |

> **Rule:** no other events exist. The UI must not reach into pipeline internals; if a screen needs data not carried by these events, the event surface is amended here first.

---

## 11. CalibrationFlow

`src/session/calibration.ts`. Gated: ATTESTED only (DEMO uses its own in-memory quick-calibration; UNATTESTED blocked).

| Method | Output example | Errors |
|---|---|---|
| `captureNeutral()` | `{"neutralStats": {"REGION_BROW": {"left": 0.418, "right": 0.421}, "…": "…"}, "qualityScore": 0.91}` | `QUALITY_TOO_LOW` (coaching UI, retry), `CAMERA_*`, `NOT_ATTESTED` |
| `captureComfortableMax("EX_SMILE")` | `0.092` | same |
| `runNoiseFloorSelfTest()` | `0.041` (persisted to `app_settings.noiseFloorSymmetry`) | same + `DB_UNAVAILABLE` |
| `checkBaselineDrift()` | `"ok"` \| `"recalibrate"` | `NO_BASELINE`, `CAMERA_*` |

> **Rule:** `comfortableMax` = **median** of 3 gentle reps, never max (resists the straining outlier). Copy for these captures must include the word "gentle" (SAFETY §8 audit checks this).

---

## 12. TrendsService

`src/data/trends.ts`. Consumers: `TrendsScreen`, `CaregiverScreen`, `ExportService`.

### `getTrend(exerciseId: ExerciseId, granularity: 'weekly' | 'monthly'): Promise<TrendSeries>`

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

> **Rules:** one series = one `baselineId` (the active one); `aboveNoiseFloor: false` when period-over-period change < `app_settings.noiseFloorSymmetry` — UI renders those as "steady", never up/down; `quality_abandoned` and `red_flag_stopped` sessions are excluded from aggregation.

### `getAdherence(range): Promise<Adherence>`

**Response example:**
```json
{ "sessionsPerWeek": [4, 5, 3, 5, 4, 2], "completionRate": 0.86 }
```

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

The HTML blob is a printable one-page A4 summary with the same content and the same non-diagnostic header. **Errors:** `DB_UNAVAILABLE`, `VALIDATION_FAILED` (bad range)

> **Rules:** download only — no Web Share API, no clipboard auto-copy; no fields beyond the schema; `nonDiagnosticNotice` is mandatory and its text lives in `strings.ts` (audited, SAFETY §8).

---

## 14. SettingsService

`src/data/settings.ts`.

### `get(): Promise<AppSettings>` · `update(partial: Partial<AppSettings>): Promise<AppSettings>`

**`update` request example:** `{ "caregiverViewEnabled": true }` → **response:** the full updated `AppSettings` (shape: DATABASE §2). **Errors:** `DB_UNAVAILABLE`, `VALIDATION_FAILED` (e.g. `textScale` outside `[1.0..2.0]`)

> **Rule:** `caregiverViewEnabled` may only be toggled from `SettingsScreen` (it is the patient's consent act for `CaregiverScreen`); `noiseFloorSymmetry` may only be written by `CalibrationFlow.runNoiseFloorSelfTest`.

---

## 15. Config module shapes

### `src/config/exercises.ts`

```json
{
  "EX_SMILE": {
    "exerciseId": "EX_SMILE",
    "regionId": "REGION_MOUTH_CORNER",
    "landmarkIndices": { "left": ["<mesh point ids, fixed in IMPLEMENTATION Task 6>"], "right": ["…"] },
    "displayName": "Gentle smile",
    "instruction": "Let a small, slow smile come — about half of what feels possible. Gentle is the goal.",
    "demoAssetPath": "/demo-assets/EX_SMILE.webm",
    "repsPerSet": 10, "sets": 1, "restSeconds": 20
  }
}
```
All four `EX_*` entries follow this shape; `EX_EYE_CLOSURE.repsPerSet = 5` (eye-comfort rule). Dosing fixed in v1, **needs verification** with mentor.

### `src/config/thresholds.ts`

Every tunable, exported as a single frozen object, each with a comment naming its owning doc section: `landmarker {minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5}` (FaceLandmarker option thresholds — the only confidence controls that exist), `qualityGates {lumaMin: 60, interOcularMinPx: 60, poseMaxDeg: 15, jitterMaxPct: 0.005}`, `metrics {movementFloorPct: 0.008, effortTargetZone: [0.30, 0.50], easeOffThreshold: 0.60, easeOffSustainMs: 300, smoothingWindow: 5}`, `reps {startThreshold: 0.15, endThreshold: 0.10, minDurationMs: 800, minQualityFramePct: 0.60}`, `calibration {minQualityScore: 0.7, neutralCaptures: 3, captureSeconds: 3, driftMaxPct: 0.08, staleDays: 14}`, `session {qualityProblemOfferStopMs: 30000}`.

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
| `INFERENCE_FAILED` | LandmarkEngine.detect | true | Absorbed by QualityMonitor as `FACE_LOST`; never user-visible as an error |
| `NO_BASELINE` | NormalizationLayer, SessionController | true | Route to `CalibrationScreen` |
| `POSE_OUT_OF_RANGE` | NormalizationLayer (defensive) | true | Absorbed by quality UX ("face the camera straight on") |
| `NOT_ATTESTED` | SafetyGate-gated methods | true | Redirect to `OnboardingScreen` |
| `CAMERA_DENIED` | CaptureService.start | true | Permission guidance screen with retry |
| `CAMERA_UNAVAILABLE` | CaptureService.start | true | Device guidance screen ("is another app using the camera?") |

---

## 17. Gate quick-reference matrix

Operation × gate state. ✅ allowed · ❌ blocked (error in parentheses) · ◐ allowed with Demo rules (in-memory only, watermarked, nothing persisted).

| Operation | UNATTESTED | ATTESTED | DEMO |
|---|---|---|---|
| `OnboardingScreen` / `recordAttestation` | ✅ | ✅ (re-consent) | ✅ (exits demo) |
| `enterDemoMode` | ✅ | ✅ | — |
| `CalibrationFlow.*` | ❌ (`NOT_ATTESTED`) | ✅ | ◐ in-memory quick-calibration only |
| `SessionController.start/advance/stop` | ❌ (`NOT_ATTESTED`) | ✅ | ◐ no persistence on `stop` |
| `StorageService` reads | ✅ (gate needs profile) | ✅ | ✅ reads only |
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

**Responsibility split:** **canvas layer** (redrawn at full fps): symmetry bar, guide arc, focus-side dot, camera-preview dimming. **DOM layer** (updated ≤ 15 Hz, `aria-live` where FRONTEND §4 requires): quality banners, ease-off chip, rep counter, rest timer, DEMO watermark. Audio cues via Web Audio; haptics via the Vibration API (Android only; never the sole channel).

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

> **Rules:** during any non-`QUALITY_OK` state the bar is frozen and visibly labeled — a moving bar on a bad frame is a critical defect (TESTS.md §3.3 pixel-diff test). No user-facing text is composed here; all strings come from `strings.ts` keyed by state.
