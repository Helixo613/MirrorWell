# MirrorWell — IMPLEMENTATION.md

> **For AI coding agents:** execute tasks in order — each lists its dependencies; do not start a task whose dependencies aren't accepted. Identifiers are canonical per ARCHITECTURE.md §12; contracts per API.md; schema per DATABASE.md; accuracy/fairness bars per MODEL_AND_DATA.md §5–§7 (referenced, never restated). Global rules on every task: no network calls (CI-enforced from Task 1); no frame/landmark persistence; every tunable from `thresholds.ts`; every user-facing string from `strings.ts`; no new dependencies beyond ARCHITECTURE §2.

## Current State

Scaffold through Task 8 exists in-repo: Vite/React/TS PWA skeleton with pinned deps and CI no-network gate (Task 1); `StorageService` + schema + seed/inspect (Task 2); `CaptureService` (Task 3); `LandmarkEngine` + bundled WASM/model lock (Task 4); `QualityMonitor` (Task 5); `NormalizationLayer` + landmark indices + V1 analysis harness (Task 6); `MetricEngine` + `RepDetector` (Task 7); `DebugHud` (Task 8).

**Kill-gate status (2026-07-21):** Task 6 closes **PROTOCOL_LIMITED — no further operator recording** (superseding the 2026-07-20 "BLOCKED, one fresh recording" note). The 2D-geometry family is exhausted (stop rule 3/3: `scalar-radial`, `face-local-vector-v1`, `face-local-vector-v2` — all REJECTED, evidence in `tests/analysis/rejected/`). Candidate `blendshape-si-v1` (new family, slot 1) is implemented end-to-end; across four recorded trials exactly one (run-1 trial 2) passed every bar, the bars were never adjusted, and no fresh trial will be captured. Per the predeclared B2 confound (`docs/MODEL_AND_DATA.md` §7), the displacement/activation failures track uncontrolled operator smile intensity (frontal activation ranges 0.656–0.907 across trials) rather than measurement instability. The pooled exploratory analysis (`tests/analysis/v1-intensity-analysis.mjs` → `v1_S01_intensity_analysis.json`; `isGateEvidence:false`) additionally found a **small residual yaw sensitivity** the intensity story does not explain — 2 B3 breaches (0.051, 0.067) at matched activation — recorded as an honest protocol lesson (B3 is a pose envelope, not invariance), not used to claim a PASS. **Acceptance moves off V1 to external evidence (V2).**

**Owner decision (2026-07-21):** the "stop all feature work" rule in Task 6 stays relaxed: backend halves of Tasks 9–11, 12, and 14–15 may be implemented **PROVISIONAL** per `docs/superpowers/plans/2026-07-20-backend-services-v1.md`, and screen integration proceeds per `docs/superpowers/plans/2026-07-20-frontend-integration.md`. Because V1 is PROTOCOL_LIMITED (no PASS forthcoming), **nothing becomes ACCEPTED until the V2 external-evidence gate passes** (`docs/MODEL_AND_DATA.md` §7); a V2 outcome that rejects or changes the metric invalidates provisional work built on it (accepted risk, given the one passing trial). **External-evidence status (folded from Stream D):** V2 runs as written on MEEI with bars frozen; MEEI access is membership/author-mediated and acquisition is **pending**; an exploratory palsynet track (`isGateEvidence:false`) may run in the interim but does **not** satisfy V2.

Dev assumptions unchanged: Node ≥ 20 and npm ≥ 10; webcam for manual checks; Android phone from Task 17.

### Acceptance ledger

| Task | Status | Evidence | Date |
| --- | --- | --- | --- |
| 1 — Scaffold, version pinning, CI no-network gate | ACCEPTED | `package.json`, `.github/workflows/`, `src/config/`; commit `efc9ba2` | 2026-07-12 |
| 2 — StorageService + schema + seed + inspector | ACCEPTED | `src/data/`, `scripts/seed-dev.ts`, `scripts/inspect-db.ts`; commit `a1846ac` | 2026-07-12 |
| 3 — CaptureService | ACCEPTED | `src/sensing/` capture path + dev harness; commit `9233aa0` | 2026-07-12 |
| 4 — LandmarkEngine + model bundling | ACCEPTED | `src/sensing/` landmarker, `public/wasm/`, `models.lock.json`, `scripts/copy-wasm.ts`; commit `81f6c86` | 2026-07-12 |
| 5 — QualityMonitor | ACCEPTED | `src/sensing/` quality path; commit `46f081c` | 2026-07-12 |
| 6 — Fixtures + NormalizationLayer + **V1 kill-gate** | **PROTOCOL_LIMITED** | `blendshape-si-v1` closed PROTOCOL_LIMITED (no further recording): 4 trials, 1 clean (run-1 t2), bars never adjusted; displacement failures = predeclared B2/activation intensity confound, plus a documented small residual yaw sensitivity. Evidence: [`docs/MODEL_AND_DATA.md`](MODEL_AND_DATA.md) §7, exploratory [`tests/analysis/v1_S01_intensity_analysis.json`](../tests/analysis/v1_S01_intensity_analysis.json) (`isGateEvidence:false`), [`tests/analysis/rejected/README.md`](../tests/analysis/rejected/README.md). Acceptance moved to V2 external evidence. | 2026-07-21 |
| 7 — MetricEngine + RepDetector | PROVISIONAL | `src/metrics/`; commit `12b19a2` — implemented; acceptance now depends on the V2 external-evidence gate (Task 6 is PROTOCOL_LIMITED, no V1 PASS forthcoming) | 2026-07-21 |
| 8 — DebugHud | PROVISIONAL | `src/dev/`; commit `c3c1b57` — implemented; acceptance now depends on the V2 external-evidence gate | 2026-07-21 |
| 9 — SafetyGate (+ OnboardingScreen, Demo Mode) | PROVISIONAL (backend half) | `src/session/safety.ts` + `tests/unit/safety.test.ts`; branch `backend-services-v1`. Screens pending `docs/superpowers/plans/2026-07-20-frontend-integration.md`; acceptance on V2 external evidence like Tasks 7–8 | 2026-07-20 |
| 10 — CalibrationFlow (+ CalibrationScreen) | PROVISIONAL (backend half) | `src/session/calibration.ts` + tests; frame-timestamp-driven capture windows (no wall-clock timers). Screens pending frontend plan | 2026-07-20 |
| 11 — SessionController (+ SessionScreen, FeedbackRenderer) | PROVISIONAL (backend half) | `src/session/controller.ts`, `src/session/emitter.ts` + tests; closed 7-event surface, session assembly. Screens + FeedbackRenderer pending frontend plan | 2026-07-20 |
| 14 — TrendsService (+ TrendsScreen, CaregiverScreen) | PROVISIONAL (backend half) | `src/data/trends.ts` + tests; baseline-scoped, noise-floor-aware. Screens pending frontend plan | 2026-07-20 |
| 15 — ExportService (+ ExportScreen, SettingsScreen) | PROVISIONAL (backend half) | `src/data/export.ts`, `src/data/settings.ts` + tests + `tests/schemas/export.schema.json`. Screens pending frontend plan | 2026-07-20 |
| 12 — Remaining exercises + SummaryScreen (backend half) | PROVISIONAL (backend half) | Config-driven `EX_BROW_RAISE`/`EX_EYE_CLOSURE` via Stream A A2 — **pending Stream A merge**; SummaryScreen pending frontend plan; acceptance on V2 external evidence | 2026-07-21 |
| 13, 16–18 — remaining | NOT_STARTED | — | 2026-07-12 |

---

## Task 1: Scaffold, version pinning, CI no-network gate

**Objective:** A building, testable, PWA-ready skeleton with the pinned stack and the privacy gate that everything else relies on.

- `npm create vite@latest` (React + TypeScript); add `vite-plugin-pwa`, `dexie`, `@mediapipe/tasks-vision`, `recharts`, dev deps `vitest`, `@playwright/test`, `fake-indexeddb`, `@axe-core/playwright`. Resolve every "needs verification" version to latest stable and **record the pinned versions in ARCHITECTURE.md §2** (that table is canonical thereafter).
- Create the README repository structure: `src/config/{exercises,thresholds,strings}.ts`, `src/{sensing,metrics,session,data,screens,dev}/`, `tests/{unit,e2e,fixtures,schemas,analysis}/`, `public/{models,demo-assets}/`.
- `thresholds.ts`: every tunable from API.md §15 with its documented initial value and a comment naming the owning doc section. `exercises.ts`: all four `EX_*` entries per API.md §15 shape (landmark indices as placeholders until Task 6; dosing `repsPerSet` 10 / eye-closure 5, `sets` 1, `restSeconds` 20). `strings.ts`: empty keyed structure.
- `.env.example` per ARCHITECTURE §9 (three `VITE_*` flags, non-secret rule comment). npm scripts: `dev`, `build`, `preview`, `test`/`test:unit`, `test:e2e`, `test:a11y`, `seed:dev`.
- CI (GitHub Actions, free tier): build + unit tests + the **no-network test** — Playwright loads the built app, intercepts all requests, fails on any non-same-origin request after page load.

**Test:** `npm run build && npm run test` green; CI no-network job passes on the empty shell; `thresholds.ts` exports every named tunable (a unit test imports and asserts the full key list).

---

## Task 2: StorageService + schema + seed + inspector

**Objective:** The complete data layer: `mirrorwell_db` v1, all validation, atomic transactions, seed data, inspection utility.

- Copy DATABASE.md §2 verbatim to `src/data/schema.ts`. Implement `src/data/storage.ts` with every API.md §3 method; enforce the full DATABASE.md §3 validation matrix (`VALIDATION_FAILED`), the `qualityScore ≥ 0.7` gate (`QUALITY_TOO_LOW`), the `isActive` single-transaction flip, single-transaction `saveSession`, manual FK checks, and the Demo-Mode write backstop (checks `SafetyGate.isDemoMode()` — stub the import until Task 9).
- `scripts/seed-dev.ts` per DATABASE.md §6 (PRNG seed 42, refuses under `import.meta.env.PROD`); `scripts/inspect-db.ts` dumping all tables as JSON.
- `MirrorWellError` class in `src/data/errors.ts` with the API.md §1 shape.

**Test:** Vitest suite over `fake-indexeddb`: round-trip every table; `saveBaseline` deactivates the previous active row; `qualityScore 0.69` throws `QUALITY_TOO_LOW`; forced mid-transaction failure in `saveSession` leaves **zero** rows; `deleteAllData` empties all six tables; `getSessions` range-filters and rejects `from > to`; seed then `inspect-db` shows 6 weeks of sessions with `meanSymmetryIndex` trending 0.58 → 0.74.

---

## Task 3: CaptureService

**Objective:** Camera lifecycle exactly per API.md §4 / BACKEND §1.1.

- Implement `start/stop/onFrame/isRunning` (the callback delivers the `HTMLVideoElement` + timestamp per API.md §4 — no `VideoFrame` construction); `requestVideoFrameCallback` with rAF fallback (log which at init); latest-frame-wins drop policy; `CAMERA_DENIED`/`CAMERA_UNAVAILABLE` mapping from `getUserMedia` errors.
- Dev harness page (dev-only route) showing the raw preview + fps counter.

**Test:** Manual on the dev laptop: preview ≥ 24 fps; deny permission → `CAMERA_DENIED` surfaces with retry (no crash); `stop()` extinguishes the camera light. Unit: error mapping with mocked `getUserMedia`; unsubscribe stops callbacks.

---

## Task 4: LandmarkEngine + model bundling

**Objective:** Frames in, `LandmarkFrame` out, model bundled and hash-locked.

- Download `face_landmarker.task` once; commit to `public/models/`.
- **Bundle the WASM runtime (mandatory — the CDN default breaks our own rules):** write `scripts/copy-wasm.ts` copying the `@mediapipe/tasks-vision` WASM/JS runtime files from `node_modules/@mediapipe/tasks-vision/wasm/` into `public/wasm/`, wired to `postinstall`; point `FilesetResolver.forVisionTasks('/wasm')` at that local path. Standard examples load the runtime from a CDN via `FilesetResolver` — as-is that would either fail the CI no-network gate or silently break the no-network rule and the offline PWA.
- Write `models.lock.json` (SHA-256 of the model **and every copied runtime file**) and `scripts/verify-model.ts` wired to `postinstall`.
- Implement `init()` (FaceLandmarker VIDEO mode, `outputFacialTransformationMatrixes: true`, `numFaces: 1`, option thresholds from `thresholds.ts` `landmarker` block, GPU-delegate→WASM fallback logged — backend not asserted; WebGPU unverified for 0.10.35) and `detect(video, timestampMs)` via `detectForVideo`, returning the API.md §5 shape (`facePresent` = `faceLandmarks` non-empty). MediaPipe types stay inside the module; blendshapes are not exposed.
- Extend the dev harness: landmark dots overlaid on the preview.

**Test:** Harness shows 478 stable dots at ≥ 24 fps end-to-end on the dev laptop; unit tests with a mocked wasm runtime cover `NOT_INITIALIZED` and `INFERENCE_FAILED`; `verify-model` fails loudly on a corrupted model **or runtime** file; the network log during `init()` shows **only same-origin `/models/` and `/wasm/` requests** — CI no-network green proves the FilesetResolver CDN default is fully bypassed.

---

## Task 5: QualityMonitor

**Objective:** Exactly one `QualityState` per frame; the structural fail-safe gate.

- Implement `evaluate` returning discriminated `QualityResult` (ARCHITECTURE §13 / API.md §6) with the BACKEND §1.3 gate order and `thresholds.ts` values (luma via 64×64 downsample; inter-ocular pixel distance; pose from `headPose`; rolling jitter). On `QUALITY_OK`, construct branded `ApprovedFrame` **only inside `quality.ts`**. Wire the pipeline so `normalize` / geometry accept only `ApprovedFrame` — bad-frame metrics must be a **compile error**, not a runtime policy (Task 6 consumes this barrier).

**Test:** Unit boundary tests per gate with synthetic `LandmarkFrame`s. Scripted manual protocol, each detected < 500 ms: cover lamp → `LOW_LIGHT`; leave frame → `FACE_LOST`; step to 2 m → `TOO_FAR`; turn 30° → `POSE_OUT_OF_RANGE`.

---

## Task 6: Fixtures + landmark indices + NormalizationLayer + **V1 kill-gate**

**Objective:** Pose/scale/identity-invariant geometry, proven on recorded fixtures before anything is built on top. **This is the project's kill-gate.**

- Record the MODEL_AND_DATA §4 fixture set (consent forms first — SAFETY §6): per subject, neutral / four gentle exercises / over-effort / one-sided expression, plus degraded variants (low light, ~15° yaw, 2 m). Masters as webm/mp4 under `tests/fixtures/masters/`; write `scripts/convert-fixtures.sh` (ffmpeg) producing `.mjpeg` replays under `tests/fixtures/replay/` — **Chromium's fake capture accepts only `.y4m`/`.mjpeg`, and y4m is uncompressed/too large to commit**. `fixtures_manifest.json` tracks both paths per fixture. (Dev prerequisite: `ffmpeg` on PATH.)
- Fix the **landmark indices** per region in `exercises.ts` (brow: eyebrow-to-eye vertical distances; eyelid: lid apertures; mouth corner: excursion from neutral; lip: corner convergence) — comment each with the MediaPipe mesh point IDs chosen.
- Implement the geometry kernel + `NormalizationLayer` per API.md §7: `measureAbsolute(af: ApprovedFrame): AbsoluteFeatures` (baseline-free bootstrap) and `normalize(af: ApprovedFrame): NormalizedFrame` (kernel minus stored `neutralStats` → vector `regionDisplacements`). Both accept **only** `ApprovedFrame`; zero/default baselines forbidden. Calibration bootstrap uses `measureAbsolute` directly.
- Run **V1** (MODEL_AND_DATA §7): replay fixture variants; compute B1/B2/B3 spreads in a `tests/analysis/` notebook from DebugHud-format CSVs (write a minimal headless CSV dumper now; full DebugHud is Task 8).

**Test:** V1 passes — B1 rest std ≤ 0.05; B2 held-expression variation < 5% across lighting/distance; B3 ±15° yaw shifts SI < 0.05. **If V1 fails, stop all feature work and fix normalization; nothing downstream is valid.** Unit: `normalize` without `setBaseline` throws `NO_BASELINE`; passing a raw `LandmarkFrame` to `normalize`/`measureAbsolute` fails to compile.

---

## Task 7: MetricEngine + RepDetector

**Objective:** The clinical-core math, pure and fully covered.

- Implement per ARCHITECTURE §7 / API.md §8–§9: `symmetryIndex` with `movementFloor` null-guard; `effortIndex`; 5-frame rolling median; ease-off condition (> 0.60 sustained ≥ 300 ms); rep state machine (0.15 / ≥ 800 ms / 0.10); `reset()`.

**Test:** Vitest on synthetic series — clean rep counted once; < 800 ms twitch rejected; double-peak without full drop = one rep; ease-off only on sustained over-effort; null SI under `movementFloor`; single-frame spike killed by smoothing; `reset()` prevents cross-exercise leakage (explicit leakage test). **100% branch coverage on both modules** (cheap to test, catastrophic to get wrong).

---

## Task 8: DebugHud

**Objective:** Live pipeline introspection + CSV capture for all later validation.

- Dev-only overlay (`VITE_ENABLE_DEBUG_HUD`): live `QualityState`, raw + smoothed indices, rep state, fps; "record 30 s CSV" (columns per ARCHITECTURE §12); "seed" button calling `seed-dev`. Excluded from prod bundle via Vite define + tree-shaking.

**Test:** HUD renders in dev; `npm run build` output contains no HUD code (grep the bundle); a 30 s CSV opens with the exact canonical column set.

---

## Task 9: SafetyGate + OnboardingScreen + Demo Mode

**Objective:** The gate model (API.md §2) and the only UNATTESTED entry point.

- Implement `SafetyGate` (attestation check against `VITE_CONSENT_VERSION`; `enterDemoMode` with the full ARCHITECTURE §11 rule set). Build `OnboardingScreen` per FRONTEND §2.1 (stepper, red-flag education incl. the emergency sentence, four checkboxes, exercise picker, demo entry). Wire route guards per FRONTEND §1. Activate the Demo-Mode write backstop in `StorageService`.
- Write all onboarding strings in `strings.ts`; run the first SAFETY §8 language audit over the file.

**Test:** Playwright: deep-link to any route while UNATTESTED → redirected to `OnboardingScreen`; continue disabled until all four boxes checked; attestation persists across reload; bumping `VITE_CONSENT_VERSION` re-runs onboarding; demo session leaves **zero** DB rows (DB inspected); reload exits demo. Unit: gate-state logic.

---

## Task 10: CalibrationFlow + CalibrationScreen

**Objective:** Valid, comparable baselines with live coaching (ARCHITECTURE §4 steps 3–6).

- Implement `captureNeutral` (3×3 s, median, `qualityScore` = OK-frame fraction), `captureComfortableMax` (3 gentle reps, **median**), `runNoiseFloorSelfTest` (persists `noiseFloorSymmetry`), `checkBaselineDrift` (> 8% → `'recalibrate'`). Build `CalibrationScreen` per FRONTEND §2.2 with `QualityMonitor`-driven coaching; "gentle — do not strain" copy in `strings.ts`.

**Test:** Full calibration < 4 min by a first-time tester with no verbal help; deliberately dark capture → `QUALITY_TOO_LOW` + coaching + redo (never silently accepted); recalibration flips `isActive` (DB check); `noiseFloorSymmetry` lands on the active `calibration_baseline` row (DG-4; never `app_settings`); drift check returns `'recalibrate'` when replaying a mismatched fixture baseline.

---

## Task 11: SessionController + SessionScreen + FeedbackRenderer (EX_SMILE only)

**Objective:** The product loop, wired end-to-end for one exercise.

- Implement the DEMO→REPS→REST machine, the six events (payloads per API.md §10 — no others), preconditions (`NOT_ATTESTED`/`NO_BASELINE`/drift check/camera), rep-discard (< 60% OK frames), the 30 s offer-stop, `extendRest` (extension only), partial-save on `stop`, Demo-Mode non-persistence. Build `SessionScreen` + `FeedbackRenderer` per FRONTEND §2.4/§5: symmetry bar (canvas, full fps), guide arc, ease-off cue (amber + tone + Android haptic), quality banners, focus-side dot, `reducedFacePreview`, watermark in demo, the two-path stop dialog (`user_stopped` / `red_flag_stopped` → static guidance page).

**Test:** On-device: capture-to-bar latency ≤ 100 ms (HUD-measured); deliberate over-effort → ease-off < 500 ms; gentle reps never trigger it (3 testers); covering the light mid-rep pauses feedback with the named reason and discards the rep; mid-session stop saves a partial `SessionRecord` with the chosen `endReason` (DB check); frozen-bar rule — bar provably static during every non-OK state (Playwright fixture with a dark segment).

---

## Task 12: Remaining exercises + SummaryScreen

**Objective:** All four exercises config-driven; kind close-out.

- Enable `EX_BROW_RAISE`, `EX_EYE_CLOSURE`, `EX_PUCKER` purely via `exercises.ts` (if any needs component changes, the config schema is wrong — fix the schema). Record/insert demo WebM assets (line-art SVG placeholders acceptable until clips exist). Build `SummaryScreen` per FRONTEND §2.5 (renders the `sessionEnded` record only; no cross-session comparisons).

**Test:** Each exercise passes the Task 11 battery; exercise switch mid-session leaks no metric state (unit, via `RepDetector.reset` assertion); post-session DB rows match on-screen numbers exactly; summary copy passes the language audit.

---

## Task 13: HomeScreen + route completion

**Objective:** The hub, staleness prompts, and the finished guard graph.

- Build `HomeScreen` per FRONTEND §2.3 (single primary action, last-session line, recalibration card via a **date-only** `staleDays` comparison on the active baseline's `capturedAt` — **no camera on `HomeScreen`**; the 3 s `checkBaselineDrift` capture belongs in `SessionController.start`, already wired in Task 11, conditional Caregiver entry). Complete all FRONTEND §1 guards including the `caregiverViewEnabled` guard.

**Test:** Playwright: empty state shows encouraging first-run copy (no guilt strings — audit assertion); stale baseline (seeded `capturedAt` 20 days back) shows the recalibration card; Caregiver entry absent until the toggle is on.

---

## Task 14: TrendsService + TrendsScreen + CaregiverScreen

**Objective:** Honest longitudinal views for patient and caregiver.

- Implement `getTrend` (single `baselineId`, noise-floor marking, `quality_abandoned`/`red_flag_stopped` excluded) and `getAdherence`. Build `TrendsScreen` (FRONTEND §2.6: steady pills, plain-language caption, text-table toggle) and `CaregiverScreen` (FRONTEND §2.7: read-only, banner, guard).

**Test:** Seeded data (two baselines, injected noise): series never mixes baselines; sub-noise-floor wobble renders "steady"; genuine improvement renders as improvement; a non-technical viewer reads the chart in < 10 s. CaregiverScreen: deep link with toggle off → redirect; zero mutating controls (Playwright audits every interactive element); excluded sessions provably absent from aggregates (unit).

---

## Task 15: ExportService + ExportScreen + SettingsScreen

**Objective:** The clinician handoff and the user's control panel.

- Write `tests/schemas/export.schema.json` from the API.md §13 example; implement `generateSummary` (JSON validating against it + one-page A4 HTML, both with the mandatory `nonDiagnosticNotice`; download only). Build `ExportScreen` (FRONTEND §2.8) and `SettingsScreen` (FRONTEND §2.9) incl. typed-DELETE confirmation → `deleteAllData` → onboarding.

**Test:** Export JSON validates against the schema (CI); HTML prints to one A4 page; export contents match `inspect-db` ground truth on seeded data; no network during export (CI); deletion leaves all six tables empty and lands on `OnboardingScreen`; `textScale: 2.5` update throws `VALIDATION_FAILED`.

---

## Task 16: Accessibility pass + full E2E suite

**Objective:** WCAG 2.1 AA across all nine screens; deterministic journey coverage.

- Whole-app pass per FRONTEND §4 (targets, contrast, 200% text scale, keyboard, ARIA, live regions, no color-only signals, no flashing). Build the Playwright suite with the fake camera (`--use-fake-device-for-media-stream --use-file-for-fake-video-capture=tests/fixtures/replay/<clip>.mjpeg`): full journey onboarding → calibration → session → summary → trends → export, plus the degraded-input journey (dark mid-session segment) and the three TESTS.md §5 journeys.

**Test:** `npm run test:a11y` — zero critical axe-core violations on every screen; keyboard-only full journey succeeds (manual); E2E suite green three consecutive runs (zero flakes), asserting on DB rows, not just UI; degraded-input test proves zero metrics recorded during the dark segment.

---

## Task 17: Real-hardware integration (release gates)

**Objective:** Prove the non-functional targets on both hard-gate platforms.

- Scripted run on (a) mid-range Windows laptop — Chromium **and** Firefox, (b) mid-range Android — Chrome: fps ≥ 24, latency ≤ 100 ms (HUD), haptics on Android / audio+visual sufficiency on desktop, PWA offline (airplane mode after first load), cold start ≤ 5 s.

**Test:** All five targets met in every cell of the platform matrix; results table committed to `tests/analysis/hardware-matrix.md`.

---

## Task 18: Validation battery (V2–V4) + demo hardening

**Objective:** The trust gates — real faces, robustness, fairness — then a bulletproof demo.

- Execute MODEL_AND_DATA §7 **V2** (real-asymmetric-face gate: ≥ 1 consented volunteer and/or licensed clinical clips; blinded ordering comparison), **V3** (robustness matrix), **V4** (fairness battery vs. the §5 gaps). Apply the documented fallback ladder on any failure. Then demo hardening: rehearse the 2-minute demo (Demo Mode) five consecutive times; one fresh user completes calibration + a session unaided.

**Test:** V2 B7 + ordering agreement; V3 bars met per cell (or honest `QualityState` refusal); **V4 within all §5 gaps — any exceedance blocks release and public demo**; five flawless consecutive demo runs; the fresh-user run needs zero verbal help.

---

## Anticipated hurdles → mitigations

| Hurdle | Mitigation / fallback |
|---|---|
| Landmark model attenuates real palsy asymmetry (canonical-face prior) | V1 at Task 6 and V2 as early as a volunteer is available; fallback ladder MODEL_AND_DATA §2 (raw geometry → hybrid optical flow → live-feedback-only claims) |
| Jittery symmetry bar | 5-frame median (Task 7); eased bar animation; `LOW_CONFIDENCE` gate blocks unstable frames rather than showing noise |
| Latency > 100 ms on weak hardware | GPU-delegate→WASM fallback; drop to 480p before dropping fps; reduce UI cadence; never queue frames |
| Bad calibration poisons downstream data | `qualityScore ≥ 0.7` hard gate; session-start drift check; trends partitioned by `baselineId` |
| Device/user variation (webcams, glasses, facial hair, elderly head tremor) | Per-user calibration absorbs anatomy/optics; quality gates absorb the rest; V3 covers glasses/beard cells; persistent failure → honest refusal, never guessing |
| `comfortableMax` captured while straining | "Gentle" copy + demo; median-of-3; one-tap recalibration in `SettingsScreen` |
| Vibration API absent on desktop (expected; Android support **needs verification**) | Haptics never the sole channel — every cue is visual + audio (FRONTEND §4) |
| Volunteer with real asymmetry unavailable | The MEEI Standard Set (50 patients: 25 flaccid, 25 synkinetic) anchors V2; access is **membership/author-mediated, acquisition pending** (Stream D D1 — MODEL_AND_DATA §3), not public-open; a live volunteer remains preferred for full capture-path validation; worst case: live-path V2 deferred, longitudinal-trend claims withheld — documented |

## Fail-safe behavior (implementation view)

The quality short-circuit is **structural via a type barrier**: `ApprovedFrame` is constructible only inside `quality.ts`; `normalize` / `measureAbsolute` accept only `ApprovedFrame` (Task 5/6 wiring), so metric code on a non-`QUALITY_OK` frame is a compile error. Rep-discard, the 30 s offer-stop, `quality_abandoned` exclusion from trends, and the frozen-bar rule are individually tested (Tasks 11, 14, 16). Quality messages describe conditions, never faces (strings audit).

## Efficacy & outcomes (anti-gimmick — from the app's own local data only)

- **Adherence:** `getAdherence` sessions/week + completion rate; credible-prototype signal: an informal pilot user (n = 1–3) sustains ≥ 2 weeks at ≥ 70% completion.
- **Control learning (the core mechanic's own evidence):** `easeOffCount` per session trending **down** at stable effort — users learning restraint, visible in the export for the clinician.
- **Movement symmetry:** `meanSymmetryIndex` trends, only above `noiseFloorSymmetry`; the app never calls it "recovery" — the clinician interprets.
- **Data honesty:** `lowQualityFramePct` in every export — judges and clinicians see how much data was gate-rejected instead of being shown a false picture.
- **Qualitative:** verbatim feedback notes from 2–3 consented pilot users, kept outside the app for the writeup.

## Definition of Done (credible, safe, demo-ready)

1. Tasks 1–18 accepted; CI green including no-network.
2. V1 (Task 6) and V2–V4 (Task 18) passed — **including the real-asymmetric-face gate and the MODEL_AND_DATA §5 fairness blocker**. No public demo without these.
3. Fail-safe verified: every `QualityState` reproducible on demand with zero metric output; frozen-bar test green.
4. Accessibility: zero critical axe violations; keyboard-only journey; 200% text scale intact.
5. Safety: attestation gate active; language audit clean (no diagnosis/recovery/severity/prognosis vocabulary anywhere, incl. export); two-path stop flow wired to `red_flag_stopped`.
6. Privacy: no outbound requests (CI); DB contains only the six canonical tables of numeric data; `deleteAllData` verified; PWA fully offline; Demo Mode persistence-free (DB-inspected).
7. Efficacy instrumentation live: trends, `easeOffCount` trajectory, adherence, `lowQualityFramePct` all present in the export.
8. Both hardware gates (Task 17) met; five consecutive flawless demo runs; one fresh user unaided.
