# MirrorWell canonical documentation audit

**Date:** 2026-07-12  
**Scope:** all ten canonical documents in `docs/`  
**Method:** cross-document contract comparison, mathematical review, validation-design review, safety/privacy review, automated section-reference scan, current implementation evidence, and primary-source checks where the documents make external platform, dataset, or regulatory claims.

This report is non-canonical. It does not amend the ten source-of-truth documents.

## Executive verdict

MirrorWell's **product architecture is conditionally viable**: a local-only PWA, clinician-assigned exercises, per-user calibration, strict quality gating, derived metrics only, and no server are mutually coherent and appropriately conservative.

The current documents are **not implementation-ready**, however. The measurement core has mathematical defects, the calibration and hot-path contracts contain circular/impossible requirements, several canonical types are named but never defined, and the V1 validation protocol cannot currently prove what it claims. The current V1 evidence also fails its own kill gate: B2 variation is 31.1%, B3 has no valid yaw samples, and downstream Tasks 7–8 were committed despite Task 6 saying all downstream work must stop.

Recommended status:

- Product concept: **continue as a bounded research prototype**.
- Current normalization/metric specification: **reject and redesign**.
- Public demo or efficacy claims: **blocked**.
- Downstream feature work: **pause until revised V1 passes**.
- Regulatory status: **undetermined; obtain qualified review before distribution**.

## Confirmed strengths

1. The local-first/no-server design materially reduces breach and operational risk.
2. Frames, video, and raw landmarks are excluded from storage and exports.
3. `StorageService` centralizes IndexedDB access and transaction validation.
4. Indexed flags correctly use `0 | 1`; boolean is not an IndexedDB key type.
5. The MediaPipe result contract correctly avoids inventing a per-frame confidence field.
6. WASM and model assets are bundled same-origin instead of loaded from a CDN.
7. `detectForVideo` correctly accepts the video element directly; WebCodecs `VideoFrame` is unnecessary.
8. Safety language, attestation, demo isolation, deletion, and degraded-input behavior are treated as testable requirements rather than aspirations.
9. Baseline partitioning prevents trends from silently mixing incompatible calibrations.
10. The explicit local section-reference scan found no missing `DOC.md §n` targets.

## P0 — specification blockers

### P0-1. The structural quality gate cannot be implemented with the declared contracts

`API.md:234–238` says `QualityMonitor.evaluate(...)` returns only a `QualityState`, while also requiring `QualityMonitor` to be the only caller of `NormalizationLayer.normalize`. `ARCHITECTURE.md:98` instead shows an orchestrator calling `evaluate`, checking `QUALITY_OK`, and then calling `normalize` separately.

Both cannot be true. If `QualityMonitor` calls `normalize`, its return type has nowhere to carry the `NormalizedFrame`. If the session loop calls `normalize`, `QualityMonitor` is not its only caller.

**Required decision:** define one owner of the per-frame pipeline and a type/return shape that makes bad-frame normalization structurally impossible. Update `ARCHITECTURE.md`, `API.md`, `BACKEND.md`, `IMPLEMENTATION.md`, and the safety enforcement map together.

### P0-2. Calibration has a circular bootstrap dependency

`NormalizationLayer.normalize` requires an existing `CalibrationBaseline` and throws `NO_BASELINE`, but `CalibrationFlow.captureNeutral` must use the same normalized geometry to create the first baseline (`neutralStats`). No baseline-free canonical measurement operation exists.

The current live harness works around this using a fake zero baseline, but that behavior is absent from the documents and violates the no-silent-default rule.

There is also a direct contract mismatch:

- `BACKEND.md:101`: `captureNeutral(): Promise<NeutralStats>`
- `API.md §11`: returns `{ neutralStats, qualityScore }`
- `ARCHITECTURE.md §4`: needs both values to create `CalibrationBaseline`

**Required decision:** specify an explicit bootstrap geometry path and one exact `captureNeutral` return type. Do not use an undocumented zero baseline.

### P0-3. The documented pose correction is mathematically ineffective for scalar distances

The normalization pipeline applies the same inverse rigid rotation to both landmarks and then computes their Euclidean distance. For a rotation matrix `R`:

`||R(a) - R(b)|| = ||R(a - b)|| = ||a - b||`

Rotation therefore cannot change or correct the scalar pair distance. The existing synthetic rotation test is non-diagnostic: it would pass even if the inverse-rotation step were removed.

Additionally, MediaPipe landmarks are normalized image coordinates, while the facial transformation matrix maps a canonical face model to the detected face for effects rendering. The documents never define the required coordinate-space conversion or matrix convention. Applying that matrix directly to normalized image coordinates is unsupported by the stated contract.

**Required decision:** define the feature in a single coordinate system and validate it with a test that fails when pose correction is removed.

### P0-4. X/Y/Z units are mixed without an aspect or coordinate-space conversion

MediaPipe defines X relative to image width and Y relative to image height. `ARCHITECTURE.md` and `BACKEND.md` say to calculate 3D Euclidean distances directly from those normalized values. On a 16:9 image, equal numeric changes in X and Y do not represent equal image distances. Z also needs an explicit scale convention.

Consequences include resolution/aspect-ratio dependence, distorted diagonal movement, and unreliable distance normalization.

**Required decision:** document pixel/aspect correction and the treatment of Z before defining any Euclidean feature.

### P0-5. The regional feature definition loses clinically relevant motion

The current smile feature uses scalar mouth-corner-to-nose distance. A smile often moves the corner laterally and upward, approximately tangent to that radius, so visible motion can produce a small scalar change. The same cancellation risk applies anywhere a direction-changing motion is collapsed to one pair distance.

Current fixture evidence:

- Current scalar feature: smile signal `0.0539`, B2 variation `31.1%`.
- Aspect-corrected face-local vector experiment: smile signal `0.0984`, B2 variation `6.84%`.

The experiment nearly reaches the 5% bar and materially improves sensitivity, supporting product viability, but it is not yet a valid replacement and does not solve yaw.

**Required decision:** specify per-exercise motion semantics (signed projection, face-local vector, or another validated geometry) rather than only landmark pairs and scalar distances.

### P0-6. `symmetryIndex` is sign-blind

`ARCHITECTURE.md:127–130` defines `min(dL,dR)/max(dL,dR)` after describing baseline-subtracted displacements. The implementation evidence uses absolute values. Equal-magnitude movement in opposite directions therefore scores as perfectly symmetric.

Example: left corner moves outward `+0.03`, right corner moves inward `-0.03`; the stated absolute-ratio interpretation yields `1.0` despite opposite motion.

The docs do not say whether `dL,dR` are signed, absolute, projected, or vector magnitudes. Without direction semantics, the core clinical cue is not valid.

**Required decision:** define direction-aware per-exercise displacement before defining symmetry.

### P0-7. B1 and `noiseFloorSymmetry` are undefined at rest

`symmetryIndex` is explicitly `null` below `movementFloor`, yet B1 requires the standard deviation of `symmetryIndex` on neutral clips and calibration stores that as `noiseFloorSymmetry`. True neutral data should usually be below the movement floor, leaving zero or almost zero samples.

The current V1 report had only one non-null neutral SI sample and silently fell back to displacement standard deviation. That fallback is not canonical and changes the quantity's meaning.

**Required decision:** define the rest noise floor using an observable neutral residual/noise quantity, or define a separate pre-floor raw statistic. Do not call displacement noise `noiseFloorSymmetry` without changing the contract.

### P0-8. V1 does not define a reproducible statistical protocol

Key gaps:

- B2 says “varies <5%” but does not define range/mean, max deviation, coefficient of variation, pairing, repetitions, or aggregation across subjects.
- Independently recorded “held expression” clips confound normalization error with the person's inability to reproduce exactly the same expression.
- B3 requires both `+15°` and `-15°`, while the fixture naming and current harness contain a single `yaw_15` condition.
- The quality gate rejects pose beyond 15°, leaving no tolerance around an exact 15° validation target.
- No measured pose angle is retained in the derived validation output, so “15°” is only an operator label.
- Required subject count, trial count, confidence intervals, and handling of rejected frames are absent.
- B4's “20/20” does not say whether trials, subjects, or repeated frames are independent units.
- B7 “stably lower” and “ordering agreement” have no metric or acceptance threshold.

**Required decision:** publish a statistical analysis plan before collecting more fixtures.

### P0-9. Canonical types are named but not defined

`ARCHITECTURE.md §12` declares types that have no exact TypeScript definition in any canonical document, including `LandmarkFrame`, `NormalizedFrame`, `MetricSample`, `RepEvent`, `NeutralStats`, `SessionRecordInput`, `SessionRecordFull`, `TrendSeries`, and `AppStateContext` (the last has only an inline shape in `FRONTEND.md`). JSON examples with ellipses are not exact contracts.

Other types are used but absent from the glossary: `Adherence`, `ExerciseResult`, `RepMetric`, `RawMetricSample`, and `SessionEvent`.

**Required decision:** add exact canonical definitions and make every other doc reference them rather than reconstructing shapes.

### P0-10. The regulatory conclusion is asserted rather than established

`SAFETY_AND_COMPLIANCE.md` declares that MirrorWell is not a medical device or treatment, while the product describes itself as a therapeutic mirror, processes patient-specific facial measurements, coaches clinician-assigned rehabilitation exercises, and gives effort/symmetry feedback.

Regulatory status follows intended purpose and function, not a disclaimer. FDA guidance indicates disease-specific supplemental coaching may still meet the device definition even where enforcement discretion may apply. EU MDR expressly includes software intended for treatment/alleviation or physiological monitoring and classifies some decision-support software under Rule 11.

**Required decision:** replace categorical legal conclusions with “regulatory status not determined” until reviewed for each intended market. Keep the conservative safety behavior regardless.

## P1 — major design and contract problems

### P1-1. `SessionController.stop` has two return types

`API.md:346` and `BACKEND.md:90` declare `Promise<SessionRecord>`, but `API.md:350` says the response is `SessionRecordFull`, and `sessionEnded` includes nested `results`. `SummaryScreen` needs the full result.

Choose one exact return/event type.

### P1-2. Feedback rendering has incompatible data rates and ownership

`metricUpdate` is throttled to ≤15 Hz, `FRONTEND.md` says screens consume only service events, and `API.md §18` says the canvas receives per-frame hot-path rendering at full FPS. The docs alternately show direct `MetricEngine → FeedbackRenderer` calls and event-mediated input.

Choose direct hot-path rendering or event rendering. Define whether the 100 ms latency includes the five-frame median and event throttle.

### P1-3. Five-frame smoothing can consume most of the latency budget

A centered five-frame median adds roughly two frames of group delay; at 24 fps that is about 83 ms before inference, processing, event dispatch, and rendering. A trailing median behaves differently and adds less conceptual delay but must be specified. The docs define neither window alignment nor latency measurement boundaries.

### P1-4. Quality gaps can falsely satisfy time-based conditions

Metric code stops running on bad frames, but ease-off requires `>0.60` sustained for 300 ms and rep duration uses timestamps. The docs do not define whether a quality gap pauses, resets, or bridges these timers. Bridging can convert one high sample plus a gap into a sustained condition.

Specify gap behavior for smoothing, ease-off, rep state, and partial reps.

### P1-5. `LOW_CONFIDENCE` confuses intentional motion with jitter

The gate is described as “rolling resting jitter,” but `QualityMonitor.evaluate` receives no session state indicating rest. During a genuine exercise, landmark displacement above 0.5% IOD may be intentional movement and could be rejected as low confidence.

Define a motion-compensated stability statistic or restrict this gate to calibration/rest phases through an explicit contract.

### P1-6. Lighting quality measures the whole frame, not the face

Mean luma of a 64×64 full-frame downsample can pass a dark face against a bright background or reject a well-lit face against a dark background. It also creates fairness risk because framing/background can dominate skin exposure.

Use a documented face region or landmark-derived face bounds, then validate per subgroup.

### P1-7. The distance gate is resolution-dependent

`TOO_FAR` uses a fixed 60-pixel inter-ocular threshold, but camera constraints are not guaranteed to produce one resolution. The same person and distance can pass at 1280×720 and fail at 640×480.

Either require and verify a capture resolution or define the threshold as a proportion of frame width/height.

### P1-8. Pose conventions are missing

The docs do not define matrix layout beyond “row-major,” canonical-to-camera direction, handedness, axis order, angle extraction order, or signs for yaw/pitch/roll. Without these, independent implementations can disagree while satisfying the prose.

Add a canonical matrix/angle convention and fixture-based sign tests.

### P1-9. Anatomical left/right versus mirrored display is undefined

The preview is mirrored, landmark indices are labeled left/right, `affectedSide` drives a display marker, and scoring must remain orientation-independent. The docs never state whether “left” means the subject's anatomical side, image side, or mirrored display side.

Define this once and test both affected sides; otherwise the focus-side marker can be reversed.

### P1-10. Noise floor belongs to a baseline, but is stored globally

Trends are partitioned by `baselineId`, while `noiseFloorSymmetry` is a singleton `app_settings` field overwritten by each calibration. Historical/current series can therefore be judged using a noise floor measured for a different baseline.

Store the noise statistic with its calibration or explicitly make trends use only the active baseline and its paired measurement.

### P1-11. Baseline drift is not an algorithm

“>8% drift from `neutralStats`” does not define per-side relative error, region aggregation, median/max, rejected frames, or whether one bad region forces recalibration. The value is also marked “needs verification” while treated as a hard gate.

Define the statistic and tune it with fixtures before using it to block sessions.

### P1-12. Adherence has no denominator

`getAdherence` returns `completionRate`, but the app deliberately has no schedule/prescription cadence and does not penalize missed days. It is unclear whether completion means completed vs. started sessions, completed exercises, or expected sessions. A planned-session denominator would contradict the no-prescription/no-pressure scope.

Rename or define it as completion of user-started sessions only.

### P1-13. Trend aggregation is underspecified

The documents do not define weighting across reps/sessions, exclusion of null SI, minimum samples per point, period boundaries/time zone, treatment of partial `user_stopped` sessions, or what the first point's `aboveNoiseFloor` means.

### P1-14. Demo Mode can read existing patient data

The API gate matrix permits all `StorageService` reads in DEMO. Although sensitive screens are hidden, this leaves a future code path able to load an existing profile/baseline during an evaluator demo. Demo promises isolation and should not consume existing health data unless a narrowly specified gate read is required.

### P1-15. Camera lifecycle contradicts the required dev harness

Global rules say the camera may be open only while `CalibrationScreen` or `SessionScreen` is mounted, but Tasks 3–4 require a separate dev harness with live camera preview and landmarks. Add a narrowly scoped development-only exception or implement diagnostics inside a canonical screen.

### P1-16. The single-profile invariant is not enforceable from the schema

`user_profile` is described as a single local profile, but the primary key permits multiple rows and no canonical `StorageService` rule defines replacement/rejection behavior. Define the invariant transactionally.

### P1-17. Demo/write gating creates an architectural dependency not shown in the component graph

Task 2 requires `StorageService` to call `SafetyGate.isDemoMode()`, while `SafetyGate` itself depends on `StorageService`. The documents do not define how this circular module dependency is avoided.

Use an injected gate state or move write authorization to a layer that does not introduce a cycle.

### P1-18. Validation/fairness bars lack statistical power rules

The fairness table sets exact subgroup gaps but specifies no minimum N, uncertainty interval, resampling unit, multiple-comparison treatment, or intersectional analysis. Frame counts must not be treated as independent subjects. Stills cannot validate motion sensitivity, rep fidelity, or pose invariance.

The MediaPipe Face Mesh model card itself reports subgroup landmark error, but target clinical populations are a separate domain. Toronto NeuroFace specifically reports higher landmark localization error in clinical groups than age-matched controls; this strengthens the need for patient-domain validation.

### P1-19. Dataset access and redistribution are unresolved dependencies

- MEEI publication language supports an open research/education set, but current direct access and redistribution terms are not established in the docs. The Society site currently describes 65 photo sets including 10 normals, not only the 50 palsy cases summarized in the docs.
- Toronto NeuroFace requires an access request and attribution conditions.
- FairFace CC BY 4.0 is verified.
- Casual Conversations licensing and usable subset selection remain unresolved.

No external clinical images/videos should enter the repository until exact license, access, consent, and redistribution terms are recorded.

### P1-20. Current runtime/platform claims have changed or are inaccurate

- The stack says MediaPipe Vision uses “WASM/WebGPU.” Google maintainers state Web Vision Tasks use WebGL; WebGPU support was focused elsewhere. Treat the delegate as `GPU` without naming WebGPU unless verified for version 0.10.35.
- Official Mozilla documentation now says Firefox for Windows supports web apps beginning with Firefox 143 (with a later Microsoft Store threshold). The “Firefox desktop does not support PWA installation” claim is now stale as of this audit date.
- The current MediaPipe repository privacy notice says Tasks APIs send performance/utilization metrics to Google. It is unclear whether this applies to the pinned web package/configuration. Because MirrorWell forbids telemetry and all outbound requests, this must be resolved by source inspection and a runtime network test rather than assumption.

### P1-21. The implementation plan's current state and acceptance tracking are stale

`IMPLEMENTATION.md:7` still says the repository is empty. It has no accepted/in-progress/blocked status per task, yet agent rules require checking that dependencies are accepted. The current Git history includes Tasks 7 and 8 after Task 6 was explicitly committed as V1 unrun, and current V1 evidence fails.

Add an authoritative acceptance ledger and mark Task 6 blocked until a revised protocol passes.

## P2 — clarity, maintainability, and evidence gaps

1. `README.md` still marks package versions “needs verification” although `ARCHITECTURE.md §2` records exact resolved versions.
2. Several hard product tunables remain “needs verification”: effort zone, ease-off boundary rationale, drift threshold, stale days, dosing, and Android haptics.
3. `qualityScore` is clearly defined for neutral capture, but the docs should state whether failed comfortable-max/noise-floor captures affect the stored baseline score or only throw.
4. Rep behavior is missing for session stop while active, maximum-duration/stuck reps, exact-threshold equality, and quality failure before the end crossing.
5. `meanSymmetryIndex` and `meanEffortIndex` aggregation rules are absent.
6. Export files are sensitive local health data; warnings exist, but optional at-rest encryption is not discussed. Keeping plain files is acceptable for v1 only if the risk is explicit at download time.
7. “No automatic retention expiry” is coherent for longitudinal trends but should be presented as a conscious data-minimization tradeoff with storage/quota failure handling.
8. `deleteAllData` promises one transaction; IndexedDB/Dexie behavior on partial table-clearing failure and blocked database connections should be tested.
9. The `MODEL_LOAD_FAILED` retry screen calls a failure “recoverable: false” while also describing blocking retry; clarify whether `recoverable` controls navigation, retry visibility, or error permanence.
10. Browser test matrices need exact supported minimum versions, not only browser families.
11. The full validation matrix can grow combinatorially; define a smallest complete design rather than “every cell” without a recruitment budget.
12. The “one fresh user needs zero verbal help” demo criterion is useful usability evidence but not an adequate usability study.
13. Medical efficacy wording is generally cautious, but the evidence base is low/moderate quality and heterogeneous; any outcome claim must remain narrower than “treatment” or “recovery.”
14. The “affected functionality is not presented as working for everyone” fairness fallback is too vague; define whether release is blocked, a platform is removed, or a subgroup limitation is displayed before use.
15. No canonical rule defines how model/package upgrades invalidate V1–V4 evidence and existing baselines.

## Per-document assessment

| Document | What works | Primary corrections |
|---|---|---|
| `README.md` | Strong bounded scope and non-goals | Remove stale version placeholders; reconcile “therapeutic” positioning with undetermined regulatory status; update Firefox statement through owning architecture doc |
| `ARCHITECTURE.md` | Coherent local-first components and privacy boundaries | Replace normalization math; fix hot-path ownership; define exact coordinate/side conventions; add acceptance/versioning rules |
| `DATABASE.md` | Good normalized schema, transactions, indexed-boolean handling | Pair noise floor with baseline; define single-profile invariant; define missing composed types; resolve retention and upgrade semantics |
| `API.md` | Useful method-level examples and error taxonomy | Resolve impossible quality gate, return-type mismatches, missing exact interfaces, demo read permissions, timing/gap semantics |
| `BACKEND.md` | Clear service responsibilities and “never” rules | Remove circular dependencies; define calibration bootstrap, orchestration, pose math, luma/distance/jitter algorithms |
| `FRONTEND.md` | Strong calm UX and accessibility intent | Resolve full-FPS vs 15 Hz rendering; define mirrored side mapping; reconcile dev camera exception; specify invalid-capture/retry states |
| `MODEL_AND_DATA.md` | Honest non-goals and explicit release blockers | Replace unsupported geometry claims; create statistical analysis plan; verify datasets/licenses; add clinical-domain and intersectional power rules |
| `IMPLEMENTATION.md` | Good dependency-oriented task decomposition | Make current state truthful; add acceptance ledger; enforce Task 6 stop; prevent later tasks from encoding unsettled math |
| `SAFETY_AND_COMPLIANCE.md` | Excellent enforcement-map approach | Stop asserting regulatory classification; isolate Demo reads; obtain clinical/legal review; make residual export/retention risks explicit |
| `TESTS.md` | Strong safety/fail-safe intent | Add property tests that can fail without pose correction; exact metric oracle tests; contract/type tests; gap/timing tests; statistical protocol tests |

## Recommended correction order

1. **Freeze downstream feature work.** Mark Task 6 blocked and Tasks 7+ provisional.
2. **Resolve contracts first:** hot-path owner, calibration bootstrap, exact canonical types, return types, and Demo/storage dependency.
3. **Replace the measurement specification:** coordinate system, aspect correction, pose convention, signed per-exercise features, symmetry, effort, and neutral noise.
4. **Write a V1 statistical analysis plan:** fixture capture method, repeated trials, paired conditions, actual pose angles, formulas, subject-level aggregation, rejection rules, and pass/fail uncertainty.
5. **Write failing property/fixture tests** for aspect ratio, distance, positive/negative yaw, sign reversal, neutral noise, light changes, and quality gaps.
6. **Implement the minimum candidate geometry** that preserves existing storage contracts if it passes; expand the schema only if evidence requires it.
7. **Run V1 on valid repeated fixtures.** Continue only after B1–B3 pass without undocumented fallback logic.
8. **Then validate clinical-domain behavior** before restoring trend/efficacy work.
9. **Obtain regulatory and clinical review** before any public distribution or treatment-adjacent claim.
10. **Re-run platform/privacy checks** for the exact pinned browser and MediaPipe versions.

## External primary/authoritative sources checked

- [Google Face Landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker) — result content and canonical-to-detected transformation-matrix purpose.
- [Google JS `NormalizedLandmark`](https://developers.google.com/edge/api/mediapipe/js/tasks-vision.normalizedlandmark) — X/Y normalization semantics.
- [MediaPipe Face Mesh V2 model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf) — landmark error and subgroup evaluation.
- [MediaPipe repository privacy notice](https://github.com/google-ai-edge/mediapipe) — current on-device and metrics notice.
- [MediaPipe WebGPU support issue](https://github.com/google-ai-edge/mediapipe/issues/5826) — maintainer statement that Web Vision Tasks use WebGL.
- [W3C IndexedDB 3.0](https://www.w3.org/TR/IndexedDB-3/) — valid key types.
- [Mozilla: Web apps in Firefox for Windows](https://support.mozilla.org/en-US/kb/web-apps-firefox-windows) — Firefox 143+ Windows support.
- [FDA Digital Health Policy Navigator, step 7](https://www.fda.gov/medical-devices/digital-health-center-excellence/step-7-does-device-software-functions-dsf-and-mobile-medical-applications-mma-guidance-apply) — disease-specific coaching and enforcement discretion.
- [EU Medical Device Regulation 2017/745](https://eur-lex.europa.eu/eli/reg/2017/745/oj) — intended purpose, medical-device definition, and software classification.
- [Cochrane: physical treatments for idiopathic facial paralysis](https://www.cochrane.org/evidence/CD006283_physical-treatments-idiopathic-facial-paralysis) — limited/heterogeneous exercise evidence.
- [International facial synkinesis recommendations](https://pmc.ncbi.nlm.nih.gov/articles/PMC9682287/) — specialist-guided facial training context.
- [MEEI/Sir Charles Bell photographic standards](https://pmc.ncbi.nlm.nih.gov/articles/PMC5697767/) and [Society site](https://www.sircharlesbell.com/home-) — standardized material and current site description.
- [Toronto NeuroFace access page](https://slp.utoronto.ca/faculty/yana-yunusova/speech-production-lab/datasets/) — access process, clinical metadata, and reported clinical-group landmark bias.
- [FairFace repository](https://github.com/joojs/fairface) — CC BY 4.0 license.

## Bottom line

The best parts of MirrorWell are its scope, privacy model, fail-safe intent, and refusal to diagnose. The weakest part is the one everything depends on: the geometry and its validation. The concept should not be abandoned yet—the face-local candidate materially improved signal and invariance—but the present documents overstate what the current algorithm proves. Fix the specification and V1 first; the rest of the architecture can remain largely intact.
