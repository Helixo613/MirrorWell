# MirrorWell — TESTS.md

> **For AI coding agents:** tests live in `tests/{unit,e2e}` and `tests/analysis/`. Section numbers are load-bearing (SAFETY §10 cites §4.x rows; BACKEND cites §1–§2; MODEL_AND_DATA cites §3). A feature without its tests from this document is not done — IMPLEMENTATION Test lines and this doc together define acceptance.

## 1. Strategy per track

| Track | Unit (Vitest) | Integration/E2E (Playwright) | Manual |
|---|---|---|---|
| **Backend** (services) | `fake-indexeddb` for all storage suites; pure-function suites for metrics; mocked wasm runtime for `LandmarkEngine` error paths | Storage assertions inside E2E journeys (DB rows, not just UI) | `inspect-db` spot checks |
| **Frontend** (screens) | Component tests for guards/disabled states | Full journeys with the **fake camera**: Chromium flags `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=tests/fixtures/replay/<clip>.mjpeg` — Chromium accepts **only `.y4m`/`.mjpeg`**; masters (webm/mp4 in `tests/fixtures/masters/`) are converted by `scripts/convert-fixtures.sh` (ffmpeg; y4m rejected as uncompressed/too large to commit); `@axe-core/playwright` per screen | Keyboard-only journey; 200% text-scale sweep; real-device runs (IMPLEMENTATION Task 17) |
| **ML** (sensing/validation) | `QualityMonitor` gate boundaries with synthetic `LandmarkFrame`s | Fixture-replay pipelines producing DebugHud-format CSVs | `tests/analysis/` notebooks computing V1–V4 statistics against MODEL_AND_DATA bars |

CI order: build → unit → **no-network gate** → E2E → a11y. All must be green; three consecutive E2E runs without flakes before any release tag.

## 2. Per-component tests (expected results inline)

| Component | Tests → expected result |
|---|---|
| `StorageService` | Round-trip every table (equality); `saveBaseline` flips `isActive` (exactly one active row); `qualityScore 0.69` → `QUALITY_TOO_LOW`; forced mid-transaction `saveSession` failure → **zero rows**; `deleteAllData` → all six tables empty; `getSessions(from>to)` → `VALIDATION_FAILED`; Demo-Mode write → `VALIDATION_FAILED` backstop |
| `CaptureService` | Mocked `getUserMedia` rejections → `CAMERA_DENIED`/`CAMERA_UNAVAILABLE`; unsubscribe stops callbacks; `stop()` releases tracks; `stop()` fires `onStop` listeners once and unsubscribe silences them; `onFrame` subscribers **survive** a stop/start cycle (the pause → resume path); camera stopped mid-capture → the window aborts with `CAMERA_UNAVAILABLE` instead of hanging, and the next window runs **exactly one** `LandmarkEngine.detect()` per frame (no orphaned subscriber) |
| `LandmarkEngine` | `detect` before `init` → `NOT_INITIALIZED`; runtime throw → `INFERENCE_FAILED`; corrupted model file **or corrupted/missing `public/wasm/` runtime file** → `verify-model` fails install; `init()` network log shows only same-origin `/models/` + `/wasm/` requests (no CDN) |
| `QualityMonitor` | Boundary test per gate → exactly the documented state; **face-region luma** (landmark bbox +10% margin on 64×64 downsample): dark face + bright background → `LOW_LIGHT`, lit face + dark background → passes; **fractional distance** `interOcularMinFrac: 0.09` of video width — same face fraction passes at 640×480 and 1280×720 (no `interOcularMinPx`); jitter = RMS second difference / IOD (constant-velocity intentional motion passes, oscillating jitter fails); `FACE_LOST` on `lf === null` and on `facePresent === false`; gate *order* asserted (dark + no face → `FACE_LOST`, first-failure-wins) |
| `NormalizationLayer` | No baseline → `NO_BASELINE`; pixel-space aspect test (non-square frame does not distort horizontal vs vertical IOD units); face-local frame +v points forehead (brow-raise fixture); fixture replay → V1 protocol spreads (B1a ≤ 0.01 IOD, B1b ≤ 0.05, B2 < 5%, B3 < 0.05 with measured yaw ∈ [7°,13°]); **no inverse-rotation path exists** |
| `MetricEngine` + `RepDetector` | **100% branch coverage (hard requirement)**; clean rep = 1; twitch < 800 ms = 0; double-peak = 1; ease-off only when > 0.60 sustained ≥ 300 ms; SI null under `movementFloor`; **direction reversal:** equal same-direction → SI ≈ 1, equal-opposite → SI = 0, unilateral → SI = 0; spike killed by **trailing** 5-frame median (output at t uses frames t−4..t only — not centered); **gap > `gapResetMs` (250)** resets smoothing + ease-off sustain and aborts active rep without event; `reset()` leakage test → zero carry-over |
| `SessionController` | State transitions DEMO→REPS→REST→next; `start` unattested → `NOT_ATTESTED`; rep-discard at 59% OK frames, kept at 60%; `extendRest` adds, **no API exists to shorten** (type-level assertion); partial `stop` persists with correct `endReason`; **event surface is the closed 7-event set** (drive-a-session conformance: observed event names == the API §10 event table, payload keys per event) + method surface `start`/`advance`/`extendRest`/`stop`/`on` with `on` returning an unsubscribe fn; **Demo quick-setup contract** — both `NormalizationLayer.setBaseline` **and** `MetricEngine.setBaseline` required before the first REPS frame, a missing/≤0 `comfortableMax` for the demo exercise throws `NO_BASELINE` straight out of the frame callback (loud, never a phantom `FACE_LOST`), demo `stop` returns the record without calling `saveSession` |
| `CalibrationFlow` | Median (not max) of comfortable-max verified with skewed inputs; dark capture → `QUALITY_TOO_LOW`; drift fixture (median regional `|m_current − m_neutral|` > `driftMaxPct`) → `'recalibrate'`; `noiseFloorSymmetry` + `noiseFloorDisplacement` persisted on `calibration_baseline` (not `app_settings`) |
| `TrendsService` | Two-baseline seed → series never mixes `baselineId`s; sub-noise-floor change → `aboveNoiseFloor: false`; `quality_abandoned`/`red_flag_stopped` absent from aggregates; adherence math vs. hand-computed seed values |
| `ExportService` | JSON validates against `tests/schemas/export.schema.json`; extra-field injection test fails validation; `nonDiagnosticNotice` present and matches `strings.ts`; HTML prints one A4 page; contents equal `inspect-db` ground truth |
| `SettingsService` | `textScale 2.5` → `VALIDATION_FAILED`; `caregiverViewEnabled` round-trip |
| Screens | Per-screen axe scan → zero critical violations; guard tests per FRONTEND §1 (unattested deep links redirect; caregiver toggle-off redirect) |

## 3. ML-specific tests

### 3.1 Accuracy (MODEL_AND_DATA §6 bars)

Fixture-replay through the full pipeline under the **V1 statistical protocol** (MODEL_AND_DATA §7), statistics in `tests/analysis/`: **B1a** rest pre-floor `max(mL,mR)` std ≤ 0.01 IOD/subject; **B1b** held-SI std ≤ 0.05; **B2** `|mean_disp(c) − mean_disp(frontal)| / mean_disp(frontal) < 0.05` for `c ∈ {dim, 2m}`; **B3** `|mean SI(yaw) − mean SI(frontal)| < 0.05` for left and right with measured mean |yaw| ∈ [7°, 13°]; 2 independent trials per subject, every trial every subject must pass, missing cells = FAIL; predeclared B2 confound → `PROTOCOL_LIMITED` when frontal reproduction alone exceeds 5%. **B4** one-sided vs. symmetric separated 20/20; **B5** rep count within ±1/10 for all four `EX_*`; **B6** latency ≤ 100 ms (HUD, on both gate platforms); **B7** real-asymmetric-face validity (V2 protocol: blinded human ordering agreement). Expected result: every bar met, or the MODEL_AND_DATA §7 fallback ladder is invoked and the narrowed claims documented — never a silent pass.
### 3.2 Fairness (MODEL_AND_DATA §5 — release blocker)

Identical scripted protocol per subgroup (Fitzpatrick bands, gender, age bands; glasses/beard covariates) over fixtures + licensed dataset samples: `detectionSuccessRate` gap ≤ 5 pp; `noiseFloorSymmetry` gap ≤ 0.03; `asymmetrySensitivity` — every subgroup passes B4; `gateRejectionRate` gap ≤ 10 pp under identical standard lighting. Expected result: all within bounds → release permitted; any exceedance → release and public demo blocked, §5 remediation ladder executed and re-tested.

### 3.3 Fail-safe (degraded input must never produce confident output)

| Test | Input | Expected |
|---|---|---|
| Dark segment | Fixture with 5 s low-light mid-exercise | `LOW_LIGHT` within 500 ms; **zero `MetricSample`s** during segment (CSV assert); frozen bar (pixel-diff of the bar region across the segment); rep discarded with the strings.ts explanation |
| Face exit | Subject leaves frame | `FACE_LOST`; scoring paused; resumes cleanly |
| Extreme pose | 30° yaw clip | `POSE_OUT_OF_RANGE`; no metrics |
| Camera loss mid-session | Kill fake-camera stream | Session pauses with guidance — not lost, not crashed |
| Persistent degradation | 35 s continuous low light | Offer-stop card at 30 s; accepting → `endReason: 'quality_abandoned'`; absent from trends |
| Inference crash | Mocked `INFERENCE_FAILED` burst | Absorbed as `FACE_LOST`; session survives |

## 4. Safety tests (one row per SAFETY §10 mapping)

1. **Gate:** every session/calibration route deep-linked while UNATTESTED → `OnboardingScreen`; continue disabled until all four checkboxes; attestation survives reload; `VITE_CONSENT_VERSION` bump forces re-onboarding.
2. **Red flags:** onboarding stepper cannot skip the emergency step (no route/DOM path — asserted); stop dialog "I felt pain" → `red_flag_stopped` persisted + static guidance page rendered (never a triage question); guidance page contains clinician + urgent-care routing strings.
3. **Demo Mode:** demo session end-to-end → DB row count unchanged (inspected before/after); watermark visible in every demo screenshot; Trends/Export/Caregiver unreachable in demo; reload lands on `OnboardingScreen`; the **exit** works without a reload — a client-side navigation from demo to `/onboarding` stays there (not bounced to `/session`) and clears the flag, proved by the stepper's `saveProfile` succeeding through to `CalibrationScreen` (`SafetyGate.exitDemoMode`, API §2).
4. **Caregiver:** toggle off → deep link redirects; toggle on → screen renders; **every interactive element audited** — zero state-mutating controls (Playwright walks all clickables and asserts DB + settings unchanged).
5. **Honesty:** seeded sub-noise-floor wobble renders "steady" (never up/down arrows); `SummaryScreen` contains no cross-session comparison strings.
6. **Language audit:** automated scan of `strings.ts` + export HTML for forbidden vocabulary (*diagnos-, sever-, prognos-, recovery score, normal, abnormal, streak*) → zero hits; manual checklist pass against SAFETY §8 rules 1–8 recorded in the repo.
7. **Privacy:** CI no-network green on the release build; DB inspection post-journey shows only the six canonical tables with numeric/enum/ISO-string fields; `deleteAllData` then inspection → empty; typed-confirmation required (button disabled until "DELETE" typed).

## 5. End-to-end journeys (fake camera; DB-level assertions)

### Journey 1 — First-time patient, full happy path
1. Fresh profile → any deep link redirects to `OnboardingScreen`. 2. Complete stepper (assert continue-disabled behavior), assign `EX_SMILE` + `EX_BROW_RAISE`. 3. Calibration with a good-light fixture → baseline saved, `qualityScore ≥ 0.7`, vector `neutralStats` + `noiseFloorSymmetry` / `noiseFloorDisplacement` written on `calibration_baseline`. 4. Session: demo → 10 smile reps (fixture) → rep counter reaches 10; one over-effort segment triggers ease-off (`easeOffTriggered: 1` on that rep); REST → brow raise → complete. 5. `SummaryScreen` values equal DB rows exactly. 6. `TrendsScreen` empty-state copy (one session < a trend). 7. Export → JSON schema-valid, contents match DB (`noiseFloorSymmetry` from active baseline). **Expected throughout:** no error states, no network requests, latency budget met.

### Journey 2 — Degraded conditions, honest behavior
1. Attested + calibrated (seeded). 2. Session with the degraded fixture: mid-exercise dark segment → §3.3 dark-segment expectations (banner, frozen bar, zero samples, discarded rep). 3. Light returns → scoring resumes; complete exercise. 4. 35 s dark tail → offer-stop at 30 s → accept → `quality_abandoned`. 5. `TrendsScreen`/`getTrend` exclude the abandoned session; `lowQualityFramePct` for the completed exercise reflects the dark segment. **Expected:** at no point does any metric render during a non-OK state.

### Journey 3 — Caregiver review + red-flag stop + deletion
1. Seeded 6-week history; `caregiverViewEnabled` on. 2. `CaregiverScreen`: adherence, trends (with "steady" pill), last session, measurement-quality line; zero mutating controls (audit). 3. Patient starts a session, taps Stop → "I felt pain" → `red_flag_stopped` + guidance page. 4. That session absent from caregiver trends. 5. `SettingsScreen` → Delete everything → typed "DELETE" → all tables empty → `OnboardingScreen`. **Expected:** the caregiver never gains write ability; the red-flag path never triages; deletion is total.

**Flake policy:** three consecutive green runs required; any flake is a defect to fix, not retry.
