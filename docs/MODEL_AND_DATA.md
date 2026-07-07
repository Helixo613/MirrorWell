# MirrorWell — MODEL_AND_DATA.md

> **For AI coding agents (ML track):** MirrorWell trains **no models**. One pretrained model runs on-device behind `LandmarkEngine` (API.md §5); everything downstream is deterministic geometry. Your work is integration, measurement honesty, and validation — §5's fairness gaps and §6's accuracy bars are **release blockers**, equal in standing to any functional requirement. Datasets below are for **evaluation only**, never training, and never ship in the app.

## 1. Model requirements + contracts

### 1.1 The only ML component: face landmark estimation

Consumed by `LandmarkEngine.detect` on the hot path. Requirements: dense landmarks stable enough to measure regional displacement changes of **1–5% of inter-ocular distance**; head-pose output for ±15° correction; a per-frame **face-presence** signal for the `FACE_LOST` gate; ≥ 24 fps on the target hardware (ARCHITECTURE §10); fully on-device; freely licensed.

**Exact I/O contract** (canonical, matches API.md §5):

- Input: the playing `HTMLVideoElement` (camera stream ≥ 640×480), passed with a timestamp to `detectForVideo`. The model performs its own internal resize/normalization — **we never preprocess** (any preprocessing we add is a divergence between platforms and a fairness risk surface).
- Output `LandmarkFrame`: `landmarks: Point3D[478]` (x, y normalized image coords, z relative depth, float32); `headPose: Matrix4` (facial transformation matrix, row-major float[16]); `facePresent: boolean`; `timestampMs`.
- **Face-presence note:** `FaceLandmarkerResult` contains only `faceLandmarks`, `faceBlendshapes`, and `facialTransformationMatrixes` — **there is no per-frame confidence score**. `facePresent` is defined as `faceLandmarks` being non-empty; detection/presence/tracking sensitivity is configured via the FaceLandmarker options `minFaceDetectionConfidence` / `minFacePresenceConfidence` / `minTrackingConfidence` (defaults 0.5, values in `thresholds.ts`).
- Internal input tensor of the FaceLandmarker pipeline: managed by MediaPipe (**exact internal shape needs verification** from the model card; irrelevant to our contract, listed for completeness).

### 1.2 Downstream (non-ML) contracts

`NormalizationLayer`, `MetricEngine`, `RepDetector` — pure functions of `LandmarkFrame` + `CalibrationBaseline` (API.md §7–§9; math ARCHITECTURE §7). This split is deliberate: **the only fairness/robustness risk surface is the landmark model, quarantined behind one interface.**

## 2. Candidate approaches

| Approach | How | Pros | Cons |
|---|---|---|---|
| **A. Pretrained dense landmarks + raw geometry (recommended)** | MediaPipe FaceLandmarker (`face_landmarker.task`); region distances computed from raw landmark coordinates | Free, on-device, real-time, 478 points, ships head pose; geometry auditable | Landmark models carry a **canonical-face prior** that may attenuate real palsy asymmetry — the project's #1 technical risk (validated at V2) |
| B. Same model's 52 **blendshape scores** (`mouthSmileLeft/Right`, …) as displacement proxies | Read blendshapes instead of geometry | Semantically convenient; jitter-resistant | Blendshapes are *more* prior-laden (fitted to a typical-face expression basis) — worse on atypical faces; opaque. **Rejected as primary; cross-check signal only.** This is why API.md §5 forbids blendshapes downstream. |
| C. Classical optical flow (Lucas–Kanade / Farnebäck, OpenCV.js) on face regions | Track pixel motion left vs. right | No face prior — immune to the canonical-face problem | Needs landmarks anyway to place regions; lighting-sensitive; heavier tuning. **The documented fallback** if V2 fails on A. |
| D. Fine-tune a landmark model on palsy faces | Custom training | Directly addresses the prior | Violates project constraints (no large medical datasets, no training budget); palsy datasets small/restricted. **Rejected.** |

**Recommendation:** A, with fallback ladder if V2 fails: A with re-derived raw geometry → hybrid A+C (landmarks place regions, flow measures motion) → **narrowed product claims** (live in-session feedback only, no longitudinal trends) — documented, still a viable product. Alternative runtime if MediaPipe integration fails: TensorFlow.js `face-landmarks-detection` (**maintenance status needs verification** before adopting).

## 3. Datasets (evaluation only)

| Dataset | What | License / access | Size | Demographic coverage | Bias gaps / notes |
|---|---|---|---|---|---|
| **MEEI Facial Palsy Photo & Video Standard Set** (Massachusetts Eye and Ear) | Standardized photos/videos of facial palsy patients across severity | **Open-source via the Sir Charles Bell Society** (confirm exact license/redistribution terms before committing any clips to the repo) | **50 patients: 25 flaccid, 25 synkinetic** | Real palsy faces across both major presentation types; demographic breadth limited (**needs verification**) | **The anchor material for V2** — open availability materially strengthens the validation plan; likely single-clinic skew |
| **Toronto NeuroFace** | Videos of orofacial movement (stroke, ALS, healthy) with clinician ratings | Research access on request — **needs verification** | ~36 participants (**needs verification**) | Older adults, neurological conditions | Small; not palsy-specific but genuine asymmetry with expert annotation |
| **FairFace** | Face images balanced across race/gender/age | CC BY 4.0 (**needs verification**) | ~108k images | Explicitly balanced: 7 race groups, gender, 9 age bands | Stills only → landmark-detection success + static symmetry-noise checks; no palsy faces |
| **Casual Conversations (Meta)** | Videos with self-reported age, gender, Fitzpatrick skin tone | Evaluation-only license, no redistribution — **needs verification** | ~45k videos / 3k+ subjects | Designed for fairness eval incl. skin tone + lighting | No palsy faces; sample a small subset |
| **MediaPipe FaceLandmarker model card** | Google's own fairness evaluation | Public docs | — | Reports across skin tones/regions (**specifics need verification**) | Read first; our battery still runs — we verify on *our* metric |
| **Self-recorded consented clips (primary fixtures)** | Team + volunteer clips | Written consent per SAFETY §6; deletable on request | Dozens | Recruited for spread: Fitzpatrick I–VI target (≥ 3 bands minimum), gender, age incl. 60+, glasses, facial hair | What CI/E2E actually replays. **Rule:** clips enter the repo only with explicit written consent for that use; otherwise a local git-ignored fixtures dir |

**Honest gap:** no large, demographically balanced *facial palsy video* dataset exists. Real-palsy validation rests on the **openly available MEEI set (50 patients)** plus, where possible, **at least one recruited volunteer with genuine facial asymmetry** for live-pipeline testing (V2 — recorded clips validate the metric; a live volunteer additionally validates the full capture path). Stated in the writeup, not papered over.

## 4. Project-generated data & fixture rules

- **Fixture clips** (recorded in IMPLEMENTATION Task 6; used by CI/E2E and V1–V4): 5–10 s, ≥ 640×480, front-facing. Per volunteer: neutral; each assigned exercise done gently; one deliberate over-effort; one one-sided expression; degraded variants (low light, ~15° yaw, 2 m distance). Masters recorded as webm/mp4 at `tests/fixtures/masters/fixture_<subjectId>_<condition>.{webm,mp4}`; Playwright replays are ffmpeg-converted to `tests/fixtures/replay/fixture_<subjectId>_<condition>.mjpeg` via `scripts/convert-fixtures.sh` (Chromium's fake capture accepts only `.y4m`/`.mjpeg`; y4m is uncompressed and too large to commit). `fixtures_manifest.json` records **both paths** per fixture + condition labels + consented self-reported demographics (Fitzpatrick band, gender, age band, glasses/facial hair) — **never names**.
- **Validation outputs:** DebugHud CSVs (numeric samples only — columns per ARCHITECTURE §12), analyzed in notebooks under `tests/analysis/`.
- **No user data ever becomes evaluation data** — app users' metrics stay on their devices; the team never receives them.

## 5. Fairness plan (release blocker)

Per-user calibration removes *anatomy* as a confounder (everyone is compared to their own baseline). The fairness question is therefore precise: **does the sensing pipeline work equally well for everyone?**

**Subgroup axes:** Fitzpatrick skin tone (I–II / III–IV / V–VI), gender, age (<40 / 40–60 / 60+); glasses and facial hair as robustness covariates. Body type is not directly relevant to face sensing; face-shape variation is absorbed by per-user calibration and covered via diverse recruitment.

**Subgroup metrics** (identical scripted protocol per subgroup, fixtures + dataset samples):

1. `detectionSuccessRate` — frames with `facePresent === true` (non-empty `faceLandmarks`) under standard conditions, with the FaceLandmarker option thresholds at their 0.5 defaults.
2. `noiseFloorSymmetry` at rest — std of `symmetryIndex` on neutral clips.
3. `asymmetrySensitivity` — separation (Cohen's d) of held one-sided vs. symmetric expressions.
4. `gateRejectionRate` — frames rejected by `QualityMonitor` under identical standard lighting (catches gates that quietly exclude a subgroup — e.g., a luma gate tuned only on light skin).

**Maximum acceptable subgroup gaps — exceeding any one blocks release and public demo** (IMPLEMENTATION Definition of Done; TESTS.md §3):

| Metric | Max gap (worst vs. best subgroup) |
|---|---|
| `detectionSuccessRate` | 5 percentage points |
| `noiseFloorSymmetry` | 0.03 absolute |
| `asymmetrySensitivity` | every subgroup individually passes the §6 B4 protocol |
| `gateRejectionRate` (standard conditions) | 10 percentage points |

These are project-set engineering bars, not published standards — stated as such in the writeup.

**If a subgroup underperforms (ordered remediation):** (1) diagnose the vector — lighting/exposure is the most common skin-tone failure path: recalibrate the `LOW_LIGHT` gate and improve exposure coaching in `QualityMonitor` strings; (2) adjust capture guidance (distance/angle/background light), re-verified per subgroup; (3) swap the landmark model (§2 alternatives); (4) if still failing: **restrict claims honestly** — prominent in-app + writeup limitation, and the affected functionality is not presented as working for everyone. **Silent shipping is not an option.** (Classic balancing/augmentation doesn't apply — no training; balanced fixture recruitment is our equivalent obligation.)

## 6. Measurement realism (accuracy bars — other docs reference, never restate)

**Commodity camera + landmarks CAN reliably capture:** gross regional displacement (mouth-corner excursion, brow elevation, lid aperture) as *relative* measures vs. a same-baseline reference; left/right displacement ratios; movement timing; head pose within ±15°.

**CANNOT capture (and the app must never imply):** muscle force/activation (EMG's job); absolute millimeters (no metric scale reference); subtle synkinesis (near the noise floor — why synkinesis *detection* is a non-goal); nerve function, severity, prognosis (out of scope by design); week-over-week change below `noiseFloorSymmetry` (why the trends honesty rule exists).

**Accuracy bars** (verified at V1–V3; failing any bar → fix or narrow claims, never ship confident wrong numbers):

| Bar | Requirement |
|---|---|
| **B1** Rest stability | `symmetryIndex` std at neutral ≤ **0.05** per subject, standard conditions (this measured value becomes that user's `noiseFloorSymmetry`) |
| **B2** Held-expression repeatability | Regional displacement of a held expression varies < **5%** across two lighting conditions and two distances |
| **B3** Pose invariance | ±15° yaw changes a held expression's `symmetryIndex` by < **0.05** |
| **B4** Sensitivity | One-sided vs. symmetric expression separated **20/20 trials** (e.g., SI < 0.7 vs. > 0.85; exact cut set from pilot data into `thresholds.ts`) |
| **B5** Rep fidelity | `RepDetector` within **±1 per 10 reps** of human count, all four exercises |
| **B6** Latency | Capture-to-feedback ≤ **100 ms** (ARCHITECTURE §10) |
| **B7** Real-face validity | On a genuinely asymmetric face: SI stably lower on affected-side exercises than a symmetric control's, direction matching visible reality (V2 gate) |

## 7. Validation plan (V1 at IMPLEMENTATION Task 6; V2–V4 at Task 18)

| # | What | Protocol | Pass |
|---|---|---|---|
| **V1 Normalization invariance** (kill-gate) | B1–B3 | Replay fixture variants (lighting × distance × yaw) through the pipeline; compute spreads | B1, B2, B3 met. Fail → stop feature work; nothing downstream is valid |
| **V2 Real-asymmetric-face gate** (earliest possible; no later than Task 18) | Does the canonical-face prior suppress real asymmetry? | MEEI Standard Set clips (open via the Sir Charles Bell Society — 25 flaccid + 25 synkinetic patients) as the primary material, plus ≥ 1 consented volunteer with genuine asymmetry for live-pipeline testing where possible; compare app `symmetryIndex` ordering vs. blinded human ordering of the same clips | B7 met + ordering agreement. Fail → §2 fallback ladder; longitudinal-trend claims dropped until a fallback passes |
| **V3 Robustness matrix** | Devices × conditions | Full scripted protocol on: mid-range Windows laptop (Chromium + Firefox), mid-range Android (Chrome); glasses on/off; facial hair; lamp vs. daylight; 0.5 m vs. 1 m | B4, B5, B6 in every cell; a persistently failing cell must produce the correct `QualityState` (honest refusal), never metrics |
| **V4 Fairness battery** (release blocker) | §5 metrics per subgroup | Identical protocol per fixture subject; FairFace stills + Casual Conversations subset (licenses permitting, **needs verification**) for larger-n detection/noise checks | All §5 gaps within bounds |

**Failure modes → safe fallbacks:** landmark prior suppresses asymmetry → raw-geometry / optical-flow fallback → narrowed claims. Noise floor too high for trends → live-feedback-only product (documented). Subgroup gap → §5 remediation ladder ending in honest restriction. Any bar unmet → the feature is disabled or its claim narrowed; the fail-safe rules (ARCHITECTURE §8) are the last line of defense, not the first.

## 8. Clinical grounding (how measurements stay faithful)

- **Practice:** facial **neuromuscular retraining (NMR) / mime therapy** for peripheral facial paresis — mime therapy trials (Beurskens & Heymans), NMR principles (Diels), Cochrane review of physical therapy for Bell's palsy (Teixeira et al.). Evidence honestly characterized: moderate, strongest for chronic/moderate cases and synkinesis management.
- **Vocabulary, not scoring:** regions/movements named per the **Sunnybrook Facial Grading System** (Ross et al., 1996) — the app never computes a Sunnybrook or House-Brackmann score (clinician-administered; automating them would cross into assessment/diagnosis).
- **The measured quantities are the therapy's own instructions:** NMR prescribes small, slow, *symmetric*, low-effort movements — `symmetryIndex` operationalizes "symmetric"; `effortIndex` + ease-off operationalize "small and low-effort"; the guide arc operationalizes "slow". The `effortTargetZone` [0.30, 0.50] is a design parameter reflecting the small-movement principle — **needs verification** against published protocol descriptions; users follow their clinician if instructions differ.
- **Faithfulness guardrails:** exercises enabled only from the clinician-assigned list; `comfortableMax` captured with explicit "gentle, no straining" copy (median of 3, not max); NMR phase-specificity respected by scoping to users whose clinician has started retraining (README non-goals; SAFETY §2).
