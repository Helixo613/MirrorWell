# MirrorWell Remediation Implementation Plan (Sonnet-executable, through V1-ready)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Steps use checkbox syntax. TDD every code task: failing test first, verify failure, minimal fix, verify pass, commit.

> This plan is intentionally self-contained: an agent with zero prior context has the formulas, exact file paths, type shapes, thresholds, and test assertions needed; the canonical docs in `docs/` plus `DOCS_AUDIT_2026-07-12.md` are the only other required reading. Tick the checkboxes in THIS file as tasks complete.

**Goal:** Repair canonical docs (remove stale/contradictory info), replace the mathematically-dead geometry, and deliver a V1 capture harness + runner so the user can record fixtures and run the kill gate.

**Architecture:** Local-only PWA preserved. New pure geometry kernel (face-local 2D vectors, aspect-corrected, eye-aligned) feeds both calibration bootstrap and normalization. Structural quality gating moves from "only caller" prose to a compile-time `ApprovedFrame` type barrier. Docs amended before code, `DOCS-CHANGE` line per contract commit.

**Tech stack:** Existing pinned stack only (React 18.3.1, TS 5.9.3, @mediapipe/tasks-vision 0.10.35, Dexie 4.4.4, Vitest 3.2.7, Playwright 1.61.1). No new dependencies.

## Context

`DOCS_AUDIT_2026-07-12.md` found 10 P0 blockers: the QualityMonitor/normalize contract is impossible (API.md:234-238 vs ARCHITECTURE.md:98), calibration has a circular bootstrap, the "pose correction" is a mathematical no-op (rotation is an isometry: ‖R(a)−R(b)‖=‖a−b‖), coordinates mix aspect-distorted units, symmetryIndex is sign-blind, and V1 has no statistical protocol. Current V1 evidence FAILS its own kill gate (B2 = 31.1% vs 5% bar). The face-local vector experiment (`src/dev/liveV1Vector.ts`) scored B2 = 6.84% with ~2× signal; that geometry, generalized, is what this plan implements.

## Decisions adopted (approved by user 2026-07-12)

| Gate | Decision |
|---|---|
| Scope | Through V1-ready. Phase 8 repairs (trends, demo isolation impl, adherence, single-profile) = separate plan after V1 passes. |
| DG-1 | `SessionController` (later; for now the harness) orchestrates. `QualityMonitor.evaluate` returns discriminated `QualityResult`; only its `QUALITY_OK` branch carries an `ApprovedFrame`. Geometry/normalize accept `ApprovedFrame` only. `ApprovedFrame` constructible only inside `quality.ts`. |
| DG-2 | Pure geometry kernel `measureAbsolute(af)` needs no baseline → calibration median-aggregates its output → normalize subtracts baseline. Zero/fake baselines forbidden and deleted. |
| DG-3 | **Deviation from remediation ladder, justified:** skip the scalar-projection rung, implement face-local 2D **vector** displacement directly. Evidence: current radial scalar failed (B2 31.1%); the vector candidate nearly passed (6.84%, ~2× signal). Schema change is free because DG-5 reset is approved. Recorded here as the required architecture-discussion note. |
| DG-4 | `noiseFloorSymmetry` moves to `calibration_baseline`, redefined as std of smoothed SI during **held** comfortable-max captures (SI is defined there; at rest it's null, P0-7). Rest noise gets its own stat `noiseFloorDisplacement` (std of pre-floor displacement magnitude at neutral). |
| DG-5 | Pre-release reset: amend schema v1 in place; dev DBs reset/reseed. No migration code. |
| DG-6/7 | Written protocol below. Yaw validated at 10°±3° **measured** (inside the 15° gate; no zero-margin target). Per-trial statistics; frames never treated as independent subjects. |
| DG-8 | Doc amendment only (renderer not built yet): hot-path computes per frame; events ≤15 Hz; canvas repaints via rAF from latest sample; latency = capture timestamp → first visible paint. |
| DG-9/10/11 | Doc wording now, implementation later: Demo reads restricted to non-sensitive config; "research prototype; regulatory status not determined; not cleared or approved"; "GPU delegate" (never "WebGPU") + Firefox-143+ fact fix + telemetry-verification release blocker. |
| DG-12 | Acceptance ledger table in IMPLEMENTATION.md; Task 6 BLOCKED; Tasks 7–8 PROVISIONAL. |

## Global constraints (every task)

- No network calls; no new dependencies; no frame/video/raw-landmark persistence or logging.
- Every tunable in `src/config/thresholds.ts`; every user-facing string in `src/config/strings.ts`.
- No identifier not in ARCHITECTURE §12: new identifiers land in the glossary in the same commit (`DOCS-CHANGE` line required).
- Run shell through `rtk`. Never weaken a safety rule. Never tune a threshold against the test set after seeing results.
- Existing uncommitted user work in git status is preserved.

## Canonical new math (single source for all tasks below)

Pixel space: `P = (x·W, y·H)` for landmark `(x,y)` and video `W×H` (fixes P0-4 aspect distortion). Z excluded in v1 (no defined scale, documented).

Face-local frame: `eyeR = landmarks[33]`, `eyeL = landmarks[263]` (verify anatomical sides in Task B2 against the MediaPipe mesh map; anatomical left/right = subject's side, independent of mirrored preview). `origin = (eyeR+eyeL)/2`; `IOD = |eyeL−eyeR|` px; `û = (eyeL−eyeR)/IOD` (+u = subject's anatomical left); `v̂` = û rotated so +v points toward forehead (sign fixed by a brow-raise fixture test). Roll invariance comes free from eye alignment; scale invariance from IOD division; yaw/pitch are **not** corrected; the ±15° gate bounds them and B3 measures the residual (this replaces, honestly, the isometry-no-op "correction" of P0-3).

Per region side: `f = ((P_moving − P_anchor) · (û, v̂)) / IOD` → 2D vector in IOD units. Anchors/movers per region (indices verified in Task B2): MOUTH_CORNER: corners 61/291, anchor nose tip 1. BROW: brow points, anchor same-side eye center. EYELID: upper/lower lid gap vector, anchor eye center. LIP: lip corners, anchor nose tip.

`NeutralStats` (new shape): `Record<RegionId, { left: {u,v}, right: {u,v} }>`, median per component over neutral frames.

Displacement: `ΔL = f_L − neutral_L`, `ΔR = f_R − neutral_R`. Mirror: `ΔR̃ = (−ΔR.u, ΔR.v)`. Magnitudes `mL=|ΔL|`, `mR=|ΔR̃|`.

- `symmetryIndex`: if `max(mL,mR) < movementFloorPct` → `null`; else `SI = (min(mL,mR)/max(mL,mR)) · max(0, cosθ)`, `cosθ = (ΔL·ΔR̃)/(mL·mR)` (0 if either magnitude is 0). Equal-opposite motion → cosθ=−1 → SI=0 (fixes P0-6). Unilateral → SI=0. Same-direction equal → 1.
- `effortIndex = max(mL,mR) / comfortableMax[exerciseId]`; `comfortableMax` = median of per-rep peak `max(mL,mR)`.
- Smoothing: **trailing** 5-frame median (P1-3 resolved: no centered-window lookahead delay).
- Gap rule (P1-4): sample gap > `metrics.gapResetMs` (new tunable, 250) resets smoothing window and ease-off sustain accumulation; an active rep aborts without event on such a gap.

## V1 statistical protocol (verbatim into MODEL_AND_DATA §7)

Per subject, **2 independent trials** (full re-setup between). Phases in order: neutral 10 s → frontal gentle smile held 8 s → smile at left yaw ~10° → smile at right yaw ~10° → smile dim light → smile at 2 m (dim + distance last). Per phase: valid only if ≥70% frames `QUALITY_OK`, else retry that phase (predeclared rule). Yaw phases valid only if measured mean |yaw| ∈ [7°,13°] (from headPose, recorded per frame; operator label is not evidence).

- **B1a** rest noise: std of pre-floor `max(mL,mR)` over neutral OK frames ≤ `0.01` IOD (initial value, tuned against fixtures). Becomes `noiseFloorDisplacement`.
- **B1b** held-SI noise: std of smoothed SI over frontal-smile hold ≤ 0.05. Becomes `noiseFloorSymmetry`.
- **B2** repeatability: for c ∈ {dim, 2m}: `|mean_disp(c) − mean_disp(frontal)| / mean_disp(frontal) < 0.05`, where mean_disp = mean of `max(mL,mR)` over the phase.
- **B3** pose: `|mean SI(yaw_left) − mean SI(frontal)| < 0.05` AND same for yaw_right.

Statistics computed **per trial**; PASS requires every trial of every subject to pass every bar. Missing/invalid cells = FAIL (blocked), never a fallback metric. Reports are candidate-versioned; the current failing report is preserved as rejected evidence.

**Predeclared confound rule (B2):** B2 compares re-produced expressions, so human reproduction variance sits inside the 5% bar. If B2 fails AND the two trials' frontal-smile mean displacements differ from each other by more than 5% (human reproduction alone exceeds the bar), the verdict is `PROTOCOL_LIMITED`; not an algorithm FAIL and not a PASS: refine the capture protocol (e.g. live target-band coaching on displacement during recording) and rerun. Declared here, before data collection, so it can never be a post-hoc excuse.

---

## Stage A: Documentation (no production code; one commit per task with DOCS-CHANGE lines)

### Task A0: Freeze + evidence preservation
**Files:** Create `tests/analysis/rejected/README.md`; copy `tests/analysis/v1_S01_report.json` → `tests/analysis/rejected/v1_S01_report_scalar-radial_FAILED.json`
- [x] Record in the README: candidate "scalar radial distance", B2 = 31.1% (bar 5%), B3 no valid yaw samples, date, git SHA.
- [x] Commit: `docs: preserve failing V1 evidence (scalar radial candidate)`

### Task A1: IMPLEMENTATION.md truth + acceptance ledger (DG-12)
**Files:** Modify `docs/IMPLEMENTATION.md` (Current State section + new ledger table)
- [x] Replace "Empty repository" Current State with the actual state (Tasks 1–5 implemented; Task 6 code exists but V1 FAILED; Tasks 7–8 implemented provisionally).
- [x] Add ledger table: task | status (ACCEPTED/BLOCKED/PROVISIONAL/NOT_STARTED) | evidence link | date. Task 1–5 ACCEPTED, Task 6 **BLOCKED** (link A0 rejected report), 7–8 PROVISIONAL, 9+ NOT_STARTED.
- [x] Commit with `DOCS-CHANGE: IMPLEMENTATION.md, truthful state + acceptance ledger (audit P1-21)`

### Task A2: Stale platform facts + safety wording (DG-9/10/11)
**Files:** Modify `docs/ARCHITECTURE.md` §2+§6, `docs/README.md`, `docs/SAFETY_AND_COMPLIANCE.md`, `docs/API.md` §17, `CLAUDE.md` (repo root)
- [x] ARCHITECTURE §2/§6: "WASM/WebGPU" → "WASM, GPU delegate (backend not asserted; WebGPU unverified for 0.10.35)". Firefox: replace "does not support PWA install" with "Firefox 143+ on Windows supports web-app install; older Firefox runs as offline-capable tab; Firefox remains a hard test gate either way."
- [x] CLAUDE.md Verified-facts #5: same Firefox correction (keep the "don't correct back" framing, now pointing the right way).
- [x] ARCHITECTURE §6 + SAFETY: add release blocker, "MediaPipe repo privacy notice mentions Tasks API utilization metrics; runtime network inspection of the pinned package must prove zero telemetry before release."
- [x] SAFETY: every categorical "not a medical device / does not treat" → "research prototype; regulatory status not determined; not cleared or approved by any regulator." Safety behaviors (attestation, stop flow, language rules) unchanged.
- [x] API §17 gate matrix: DEMO row for `StorageService` reads → "❌ except non-sensitive static config" (implementation deferred, documented as such).
- [x] README: remove stale "needs verification" version placeholders (versions are resolved in ARCHITECTURE §2).
- [x] Commit with one `DOCS-CHANGE` line per doc.

### Task A3: Contract repair (DG-1, DG-2, P0-9, P1-1, P1-15)
**Files:** Modify `docs/ARCHITECTURE.md` §1 (mermaid), §3 (component table), §8, §12 (+ new type appendix §13), `docs/API.md` §6–§8, §10, §11, `docs/BACKEND.md` §1.3–§1.7 + §2 (call graph), `docs/SAFETY_AND_COMPLIANCE.md` §10 ("No metrics on bad frames" row), `docs/IMPLEMENTATION.md` (Task 5/6 wiring text + "Fail-safe behavior" section), `CLAUDE.md` (non-negotiable #4)
> Every place stating "QualityMonitor is the only caller of NormalizationLayer.normalize" changes to the ApprovedFrame wording in the SAME commit; grep all docs + CLAUDE.md for "only caller" to catch stragglers.
- [x] New ARCHITECTURE §13 "Canonical type definitions" with exact TS for: `LandmarkFrame`, `ApprovedFrame`, `QualityResult`, `AbsoluteFeatures`, `NeutralStats` (vector shape), `NormalizedFrame` (vector displacements), `MetricSample`, `RepEvent`, `NeutralCaptureResult { neutralStats: NeutralStats; qualityScore: number }`, `SessionRecordInput`, `SessionRecordFull`, `TrendSeries`, `Adherence`, `AppStateContext`. All other docs reference §13 instead of restating shapes.
- [x] Glossary §12: add `ApprovedFrame`, `QualityResult`, `AbsoluteFeatures`, `NeutralCaptureResult`, `noiseFloorDisplacement`; note `noiseFloorSymmetry` now lives on `calibration_baseline`.
- [x] API §6: `evaluate(video, lf): QualityResult` where `QualityResult = { state: 'QUALITY_OK', frame: ApprovedFrame } | { state: <non-OK QualityState> }`. Replace the "only caller" rule with: "`ApprovedFrame` is constructible only inside `quality.ts`; `normalize`/geometry accept only `ApprovedFrame`, bad-frame metrics are a compile error." `INFERENCE_FAILED → FACE_LOST` conversion happens in the orchestrator before `evaluate`.
- [x] API §7: `normalize(af: ApprovedFrame): NormalizedFrame`; document kernel: `measureAbsolute(af): AbsoluteFeatures` is baseline-free (bootstrap, DG-2); zero/default baselines explicitly forbidden. Drop `POSE_OUT_OF_RANGE` from normalize's error list, unreachable behind the type barrier (state removal explicitly).
- [x] API §10: `stop(reason): Promise<SessionRecordFull>` (P1-1); §11: `captureNeutral(): Promise<NeutralCaptureResult>` (matches BACKEND).
- [x] Camera-lifecycle rule (API §4 + CLAUDE.md): add narrowly-scoped exception, dev-only harnesses under `src/dev/` (excluded from prod bundle) may open the camera; production remains `CalibrationScreen`/`SessionScreen` only (P1-15).
- [x] Commit with `DOCS-CHANGE` lines.

### Task A4: Measurement + validation spec replacement (P0-3..P0-8, P1-4, P1-11)
**Files:** Modify `docs/ARCHITECTURE.md` §4 (step 5 noise-floor self-test rewrite) + §7, `docs/MODEL_AND_DATA.md` §6–§7, `docs/DATABASE.md` §2–§5 (§5 privacy wording "region distances" → "region offsets"; §7 gets a one-line "pre-release: schema v1 amended in place per DG-5, append-only policy applies from first release" note), `docs/BACKEND.md` §1.4–§1.5, §1.7 (`runNoiseFloorSelfTest` → writes `calibration_baseline` fields, measured during held comfortable-max captures), §1.10 (TrendsService noise-floor source), `docs/API.md` §3 (`saveBaseline` example → vector `neutralStats` + baseline noise fields), §12 (TrendsService noise rule), §13 (export example field source), §14 (delete the "`noiseFloorSymmetry` only written by self-test into app_settings" rule; field moved), §15 (thresholds block gains `metrics.gapResetMs`, `qualityGates.interOcularMinFrac` replaces `interOcularMinPx`), `docs/TESTS.md` §2–§3.1
- [x] ARCHITECTURE §7: replace with the "Canonical new math" block above verbatim (frame, formulas, SI, effort, trailing median, gap rule). Delete every claim that inverse rotation corrects pose; state the honest envelope model (gate bounds + B3 measures residual).
- [x] MODEL_AND_DATA §6–§7: replace B1–B3 with the protocol block above (B1a/B1b/B2/B3, trials, rejection rules, measured yaw bands). B4–B7 wording untouched.
- [x] DATABASE §2: `calibration_baseline.neutralStats` vector shape; add `noiseFloorSymmetry` + `noiseFloorDisplacement` columns to `calibration_baseline`; remove `noiseFloorSymmetry` from `app_settings`. §3 validation rows updated, **vector components validate as finite only, NOT `> 0`** (signed projections are legitimately negative; the old "finite and > 0" rule is wrong for the new shape). Note: pre-release reset, schema v1 amended in place (DG-5).
- [x] BACKEND §1.4–§1.5: kernel + normalize + metric internals matching §7; baseline-drift statistic defined: per region side `|m_current − m_neutral|` where m = pre-floor displacement magnitude vs stored neutral, aggregated as median across regions, > `driftMaxPct` → recalibrate (P1-11).
- [x] TESTS §2 rows for NormalizationLayer/MetricEngine/QualityMonitor updated to the new behaviors (direction reversal test, aspect test, gap tests, face-region luma, fractional distance).
- [x] Add `scripts/check-docs.mjs`: fails if any §12 glossary type lacks a §13 definition, or any `§n` cross-reference targets a missing section. Wire as `npm run check:docs`.
- [x] Run `rtk node scripts/check-docs.mjs` → green. Commit with `DOCS-CHANGE` lines.

**Stage A gate:** user reviews the DOCS-CHANGE set before Stage B begins.

---

## Stage B: Code (TDD; one commit per task)

### Task B1: ApprovedFrame type barrier
**Files:** Modify `src/sensing/quality.ts`, `src/metrics/normalize.ts` (signature only), `tests/unit/quality.test.ts`
**Produces:** `type QualityResult`, `type ApprovedFrame` (branded: `{ readonly __approved: unique symbol; lf: LandmarkFrame; videoWidth: number; videoHeight: number }`, brand not exported), `evaluate(video, lf): QualityResult`.
- [x] Failing test: `evaluate` on a good synthetic frame returns `{ state: 'QUALITY_OK', frame }` with `frame.videoWidth/Height` set; on each bad condition returns state-only object with no `frame` key.
- [x] Compile-time test (`tests/unit/type-barrier.test-d.ts` or `@ts-expect-error` block): passing a raw `LandmarkFrame` to `normalize` fails to compile.
- [x] Implement; update all existing quality tests to the new return shape (assertions on gate order/boundaries unchanged).
- [x] `rtk npx vitest run tests/unit/quality.test.ts` green. Commit.

### Task B2: Geometry kernel
**Files:** Create `src/metrics/geometry.ts`, `tests/unit/geometry.test.ts`; Modify `src/config/exercises.ts` (verified indices + anchors)
**Produces:** `measureAbsolute(af: ApprovedFrame): AbsoluteFeatures` where `AbsoluteFeatures = Record<RegionId, { left: {u,v}, right: {u,v} }>`; helper `aggregateNeutral(samples: AbsoluteFeatures[]): NeutralStats` (component-wise median).
- [x] Verify landmark indices against the canonical MediaPipe face-mesh map (33/263 eyes, 61/291 mouth corners, 1 nose tip, brow/lid points); record each chosen index with a comment naming the mesh point; fix `exercises.ts` placeholders.
- [x] Failing property tests: (1) **aspect**: same physical landmarks rendered at 4:3 and 16:9 normalized coords → identical features to 1e-6; (2) **scale**: face at 2× distance → identical; (3) **roll**: 15° in-plane rotation of all landmarks → identical to 1e-3; (4) **sign**: synthetic brow raise → +v displacement; synthetic smile → mouth-corner u moves outward on each side; (5) median aggregation component-wise.
- [x] Verify each fails for the intended reason (module absent), implement kernel, all green.
- [x] Commit.

### Task B3: NormalizationLayer rewrite + schema amendment
**Files:** Modify `src/metrics/normalize.ts`, `src/data/schema.ts`, `src/data/storage.ts` (validation), `src/dev/seed.ts`, `tests/unit/normalize.test.ts`, `tests/unit/storage.test.ts`
**Consumes:** `measureAbsolute`, `ApprovedFrame`. **Produces:** `normalize(af): NormalizedFrame` with vector `regionDisplacements`; vector `NeutralStats` schema; `noiseFloorSymmetry`/`noiseFloorDisplacement` on `calibration_baseline`.
- [x] Failing tests: normalize = kernel output minus baseline (exact); **missing region in baseline → `NO_BASELINE` throw** (delete the raw-distance fallback at current normalize.ts:114-115: this is the zero-baseline enabler); no baseline → `NO_BASELINE`; delete the non-diagnostic rotation self-consistency test, replace with kernel property tests reference.
- [x] Schema: vector `neutralStats` validation (4 regions × 2 sides × finite u,v), baseline noise fields required; app_settings loses `noiseFloorSymmetry`; seed updated; storage tests updated.
- [x] All green: `rtk npx vitest run tests/unit/normalize.test.ts tests/unit/storage.test.ts`. Commit with `DOCS-CHANGE: DATABASE.md §2: vector neutralStats + baseline-paired noise (pre-release reset)`.

### Task B4: Direction-aware MetricEngine + gap semantics
**Files:** Modify `src/metrics/metrics.ts`, `src/metrics/reps.ts`, `src/config/thresholds.ts` (+`metrics.gapResetMs: 250`), `tests/unit/metrics.test.ts`, `tests/unit/reps.test.ts`, `tests/unit/thresholds.keys.test.ts`
- [x] Failing tests: equal same-direction motion → SI 1; **equal opposite motion → SI 0** (the P0-6 regression test); unilateral → SI 0; below floor → null; trailing (not centered) median, assert output at frame t uses frames t−4..t only; gap > 250 ms resets smoothing + ease-off accumulation; active rep aborts (no event) on gap; ease-off boundary behavior unchanged.
- [x] Implement SI/effort per canonical math; keep `setBaseline`/`reset`/`isEaseOffActive`/`getLastRaw` surfaces.
- [x] Maintain **100% branch coverage** on metrics.ts + reps.ts: `rtk npx vitest run --coverage tests/unit/metrics.test.ts tests/unit/reps.test.ts`. Commit with `DOCS-CHANGE: API §15: metrics.gapResetMs added`.

### Task B5: Quality gate repairs (P1-5/6/7)
**Files:** Modify `src/sensing/quality.ts`, `src/config/thresholds.ts`, `tests/unit/quality.test.ts`
- [x] Failing tests: (1) luma over **face bounding box** (landmark bbox +10% margin, sampled from the 64×64 downsample): dark face + bright background → `LOW_LIGHT`; lit face + dark background → passes; (2) distance gate `interOcularMinFrac: 0.09` of video width, same face fraction passes at 640×480 and 1280×720 (delete `interOcularMinPx`); (3) jitter → RMS **second difference** (`|p_t − 2p_{t−1} + p_{t−2}|`/IOD, motion-compensated): constant-velocity intentional motion passes, oscillating jitter fails.
- [x] Notes: (a) second difference assumes ~uniform frame intervals, compute per sample, threshold tuned on fixtures; document the assumption in BACKEND §1.3. (b) Face-bbox luma requires landmarks, so a face too dark to detect yields `FACE_LOST`, not `LOW_LIGHT`; acceptable and honest (the message still prompts adjustment); document as intended gate-order behavior.
- [x] Threshold key changes mirrored in thresholds test + docs comment. Commit with `DOCS-CHANGE: ARCHITECTURE §7 / BACKEND §1.3 + API §15: face-region luma, fractional distance, second-difference jitter, gapResetMs`.

### Task B6: V1 harness rework (capture UX)
**Files:** Modify `src/dev/LiveV1Harness.tsx`, `src/config/strings.ts` (all harness copy), `src/config/thresholds.ts` (prep/countdown tunables if any); Delete zero-baseline machinery (`ZERO_NEUTRAL`, `makeEphemeralBaseline` at LiveV1Harness.tsx:80-122); `src/dev/liveV1Vector.ts` retires (its math now lives in the kernel), delete file + `tests/unit/live-v1-vector.test.ts`, coverage moves to geometry tests.
- [x] States: `setup → prepare → recording → review → report`; phase order **neutral → frontal smile → left yaw → right yaw → dim light → 2 m**; per-phase retry without restarting accepted phases; trial counter (2 trials).
- [x] Neutral phase uses `measureAbsolute` + `aggregateNeutral` directly (kernel is baseline-free; no fake baseline anywhere); subsequent phases use `normalize` with the captured baseline.
- [x] Show: live measured yaw/pitch/roll for pose phases with the [7°,13°] target band; valid-frame count/percent while recording; movement detected/not-detected via movement floor (raw decimals only under a collapsed diagnostics section); invalid capture visually distinct from measurement failure.
- [x] All copy from `strings.ts`; keyboard operable; visible focus; `aria-live="polite"` phase status (no per-frame spam); no color-only status; no overflow at 375/768/1440 px.
- [x] One focused component test (states + retry + start-disabled-until-quality). Commit.

### Task B7: V1 runner + report (exact predeclared formulas)
**Files:** Modify `scripts/run-v1.mjs`, `tests/analysis/v1-runner.html`
- [x] Implement B1a/B1b/B2/B3 exactly as the protocol block (per-trial, measured yaw from headPose recorded per frame, ≥70% OK-frame validity, yaw band [7°,13°]).
- [x] Report shape: `v1_<subject>_<candidate>_report.json`, candidate id `face-local-vector-v1`, per-trial and aggregate values, rejected-frame counts, per-phase measured pose summary, git SHA. Never overwrites another candidate's report. **No fallback statistics**, undefined cell = explicit `"INVALID"` and overall FAIL.
- [x] Fixture naming gains yaw direction + trial: `fixture_<subjectId>_<condition>_<trial>` with conditions `neutral|smile|yaw_left|yaw_right|low_light|distance_2m`; update `fixtures_manifest.json` schema note (old single `yaw_15` masters kept but marked insufficient).
- [x] Dry-run against existing (old) fixtures: runner executes and correctly reports INVALID/missing cells (proves rejection rules fire). Commit.

### Task B8: Full verification + ledger update
- [x] `rtk npm run build` green; `rtk npx vitest run` green (whole suite); `rtk npm run test:e2e` no-network gate green; `rtk node scripts/check-docs.mjs` green; grep prod bundle for harness strings → absent.
- [x] Verify by grep: zero occurrences of `ZERO_NEUTRAL`, `makeEphemeralBaseline`, `live-v1-ephemeral` in src.
- [x] IMPLEMENTATION.md ledger: Task 6 stays BLOCKED with note "revised geometry implemented; awaiting V1 fixture capture + pass"; link the runner + protocol.
- [x] Commit: `docs: record remediation completion; V1 awaiting fixture capture`.

---

## What happens after this plan

1. User records the fixture protocol (2 trials × 6 phases) with the reworked harness / masters + `scripts/convert-fixtures.sh`.
2. `rtk node scripts/run-v1.mjs` → PASS accepts Task 6 (ledger + evidence link); FAIL → back to geometry research with one new hypothesis (three-candidate stop rule from REMEDIATION_PLAN §12 applies).
3. Second plan: Phase 8 repairs (trends aggregation, demo read isolation implementation, adherence rename, single-profile invariant) + re-validation of Tasks 7–8 against the new geometry.

## Verification (end-to-end)

- Unit: full Vitest suite + 100% branch coverage on metrics/reps.
- Property regressions that MUST exist and fail on the old code: aspect 4:3-vs-16:9, equal-opposite → SI 0, missing-region baseline → throw, resolution-independent distance gate.
- `check:docs` consistency script green.
- Manual: open harness in dev (`rtk npm run dev`), walk setup→report with a webcam, confirm measured-yaw display and per-phase retry.
- No-network Playwright gate green on the built app.

## Out of scope (explicit)

Phase 8 repairs; SessionController/CalibrationFlow/screens (Tasks 9+); clinical/regulatory/license reviews (Phase 9: doc wording only here); recording real fixtures; dataset acquisition; any efficacy claims.
