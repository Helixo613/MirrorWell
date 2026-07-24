# MirrorWell Documentation and Measurement Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not delegate unless the user explicitly authorizes agent delegation. Track progress using the checkbox items below.

**Goal:** Repair the canonical contracts and measurement design, prove the revised geometry through V1, and only then resume downstream product work.

**Architecture:** Preserve MirrorWell's local-only service pipeline, privacy model, canonical screens, and storage boundary. Change only the invalid or contradictory contracts and algorithms identified in `DOCS_AUDIT_2026-07-12.md`. Documentation decisions land before code; every algorithm change starts with a failing test; every phase has a stop gate.

**Tech stack:** Existing pinned React, TypeScript, MediaPipe FaceLandmarker, Dexie, Vitest, and Playwright stack only. No new dependency, network call, telemetry, server, state library, or persisted visual/landmark data.

**Status:** Non-canonical proposal. The ten files in `docs/` remain the source of truth until this plan's decisions are approved and applied to them.

---

## 1. Agent operating rules

Every agent working from this plan must follow these rules in order:

1. Read `docs/README.md`, `docs/ARCHITECTURE.md`, the relevant track document, `docs/IMPLEMENTATION.md`, `docs/SAFETY_AND_COMPLIANCE.md`, and `docs/TESTS.md` before editing.
2. Read `DOCS_AUDIT_2026-07-12.md` and the current phase of this plan.
3. Inspect `git status --short`. Existing uncommitted work belongs to the user; never overwrite or discard it.
4. Stop at every **Decision Gate** until the user explicitly approves one option.
5. Amend the owning canonical docs before implementing a changed contract, identifier, schema, threshold, or algorithm.
6. Include `DOCS-CHANGE: <doc> §<n>, <what and why>` in the corresponding commit/PR body.
7. Use test-driven development: add one failing test, verify the intended failure, implement the smallest fix, verify it passes, then refactor if necessary.
8. Do not tune thresholds against the test set merely to force a pass. Record failed candidates.
9. Do not continue past a failed kill gate. A failure is evidence, not permission to narrow the test.
10. Do not persist or log camera frames, videos, or raw landmark arrays. Consented master fixtures remain governed by `MODEL_AND_DATA.md §4`.
11. Keep all user-facing strings in `src/config/strings.ts` and tunables in `src/config/thresholds.ts`.
12. Run all shell commands through `rtk`.

## 2. Definition of success

Remediation is complete only when all of the following are true:

- The hot-path owner and quality-gating types are unambiguous and internally consistent across all canonical docs.
- Calibration can create the first baseline without a fake/default baseline.
- All canonical types have exact definitions in one owning document/file.
- Per-exercise geometry has defined coordinates, direction, anchors, scale, and pose behavior.
- `symmetryIndex`, effort, neutral noise, smoothing, timers, and rep state have exact edge semantics.
- V1 has a written statistical protocol and passes B1–B3 without undocumented fallbacks.
- Valid positive and negative yaw samples exist and carry measured derived angles.
- The capture UI makes setup, preparation, recording, invalid capture, retry, and acceptance unmistakable.
- No bad-quality frame can reach geometry or metrics.
- No raw visual/landmark data is stored or logged.
- No non-same-origin request or telemetry occurs.
- The schema/noise-floor decision is migrated or explicitly reset for pre-release data.
- Regulatory wording states only what has actually been reviewed.
- Full build, unit, no-network, E2E, accessibility, and responsive checks pass.
- `docs/IMPLEMENTATION.md` truthfully records Task 6 acceptance before downstream tasks resume.

## 3. Dependency graph

```text
Phase 0: freeze + evidence
  └─ Phase 1: contract decisions
      ├─ Phase 2: geometry candidate research
      │   └─ Phase 3: canonical doc amendment
      │       └─ Phase 4: geometry + quality implementation
      │           ├─ Phase 5: calibration + metric timing
      │           │   └─ Phase 6: capture UI
      │           │       └─ Phase 7: V1 execution
      │           └─ Phase 8: data/trends/privacy repairs
      └─ Phase 9: external platform/regulatory verification

Phase 7 PASS + Phase 8 PASS + Phase 9 documented
  └─ Phase 10: resume downstream implementation
```

No phase may consume a contract owned by an unfinished predecessor.

## 4. Decision register

These decisions must be approved before implementation. Agents may gather evidence and recommend an option, but may not choose silently.

### DG-1: Hot-path ownership and structural gating

**Problem:** `QualityMonitor.evaluate` returns only a state, yet docs also say it is the only caller of `NormalizationLayer.normalize`.

**Recommended decision:** `SessionController` owns orchestration; `QualityMonitor` returns a canonical discriminated quality result whose `QUALITY_OK` branch carries a quality-approved frame. Geometry accepts only that approved frame type. Non-OK branches cannot satisfy the function signature.

**Alternative:** `QualityMonitor` owns evaluation plus normalization and returns state plus optional normalized data. This couples quality to calibration and complicates neutral bootstrap.

**Approval must specify:** owner, exact return type, exact accepted input type, and where the `INFERENCE_FAILED → FACE_LOST` conversion happens.

### DG-2: Calibration bootstrap

**Problem:** the first neutral baseline cannot be produced by a normalizer that requires a baseline.

**Recommended decision:** introduce one pure geometry kernel that measures absolute face-local features from a quality-approved frame. `CalibrationFlow` median-aggregates those features; `NormalizationLayer` calls the same kernel and subtracts the baseline.

**Rejected approach:** install a zero/default baseline. It hides missing state and invalidates the `NO_BASELINE` guarantee.

### DG-3: Per-exercise geometry representation

**Problem:** scalar point-to-point distance loses direction and makes inverse rotation ineffective.

**Recommended ladder:**

1. Test an aspect-corrected face-local signed scalar projection per side because it preserves the existing scalar `neutralStats` schema.
2. If and only if it fails V1, test a face-local 2D vector displacement.
3. If vectors are required, stop for a schema/API amendment before implementing them.

**Approval must specify for each exercise:** moving landmarks, stable anchor(s), face-local axes, expected positive direction, scale, whether Z is used, pose transform, and output unit.

### DG-4: Neutral noise metric

**Problem:** `symmetryIndex` is null at rest, so its rest standard deviation is normally undefined.

**Recommended decision:** define a separate pre-floor neutral residual statistic and rename the stored field to reflect what it measures. Pair it with the baseline that produced it.

**Alternative:** retain the field name only if raw pre-floor SI is precisely defined and proven meaningful.

### DG-5: Storage compatibility

**Problem:** moving noise data to `CalibrationBaseline` or adopting vectors may change the schema.

**Recommended decision:** because MirrorWell is pre-release, amend schema v1 and require developers to reset/reseed local data. If any real user data must survive, create a Dexie v2 migration instead.

**Approval must state:** pre-release reset or migration, exact field shape, and export compatibility.

### DG-6: V1 statistics

**Problem:** B1–B3 lack exact formulas and independent sampling units.

**Approval must state:** subject/trial counts, paired capture protocol, exact B1/B2/B3 formulas, rejection rules, confidence/uncertainty reporting, subgroup handling, and whether a fail is per subject or aggregate.

**Recommended B2 structure:** paired within-subject comparison using an explicitly named relative-deviation statistic; never treat frames as independent subjects.

### DG-7: Pose validation envelope

**Problem:** validation targets exactly ±15° while the quality gate rejects beyond 15°, leaving no noise margin.

**Recommended decision:** either validate inside a documented operational range below the gate, or move the gate outward only after fixture evidence demonstrates safe accuracy at the validation angles. Record measured yaw/pitch/roll, not a phase label.

### DG-8: Rendering ownership and rate

**Problem:** docs simultaneously require direct full-FPS rendering and ≤15 Hz event input.

**Recommended decision:** keep geometry/quality computation on the hot path; publish UI state at ≤15 Hz; animate/repaint the canvas with the latest immutable sample via `requestAnimationFrame`. Define latency from capture timestamp to first visible render.

### DG-9: Demo isolation

**Problem:** Demo Mode blocks writes but permits all reads, risking existing patient-data access.

**Recommended decision:** Demo Mode may read only non-sensitive static configuration needed to start; it must not read profile, baseline, session, trend, or export data.

### DG-10: Clinical and regulatory wording

**Problem:** the docs categorically declare a non-device/non-treatment status without a jurisdiction-specific determination.

**Recommended decision:** use “research prototype; regulatory status not determined; not cleared or approved” until qualified review. Do not change the clinician-assignment, attestation, stop, or emergency safeguards.

### DG-11: Supported runtime facts

**Problem:** Firefox installation and MediaPipe WebGPU statements are stale/inaccurate, and current MediaPipe privacy language mentions utilization metrics.

**Recommended decision:** document exact tested browser versions, call the delegate `GPU` unless backend is directly verified, and block release until runtime network inspection proves no telemetry for the pinned package/configuration.

### DG-12: Task acceptance model

**Problem:** `IMPLEMENTATION.md` has no acceptance ledger and currently says the repository is empty.

**Recommended decision:** add a table containing task status, evidence, accepted date, and blocking dependency. Mark Task 6 blocked; mark downstream work provisional until V1 passes.

## 5. Phase 0: Freeze and establish evidence

**Goal:** prevent further drift and create reproducible baselines.

### Task 0.1: Record repository state

**Files:**
- Reference: `DOCS_AUDIT_2026-07-12.md`
- Reference: `docs/IMPLEMENTATION.md`
- Create only if approved: a small status ledger section inside `docs/IMPLEMENTATION.md`

- [ ] Run `rtk git status --short` and record which changes predate remediation.
- [ ] Run `rtk git log --oneline --decorate -15` and map commits to implementation tasks.
- [ ] Record the current V1 report path and hash.
- [ ] Mark Task 6 as blocked and Tasks 7+ as provisional in the approved ledger.

**Acceptance:** an agent can determine whether a task may start without inferring acceptance from commit messages.

### Task 0.2: Preserve failing evidence

**Files:**
- Reference: `tests/analysis/v1_S01_report.json`
- Reference: live V1 JSON reports under `test-results/`

- [ ] Record current B1/B2/B3 values and quality-state counts.
- [ ] Record that the current scalar feature and yaw protocol fail.
- [ ] Do not rewrite the failing report when experimenting; write candidate-specific reports.

**Acceptance:** later results can be compared with the original failure without relying on memory.

### Phase 0 gate

Stop unless the user approves DG-12 and the current failing evidence is preserved.

## 6. Phase 1: Repair canonical contracts

**Goal:** make the architecture implementable before changing algorithms.

### Task 1.1: Define all canonical types

**Files:**
- Modify: `docs/ARCHITECTURE.md §12`
- Modify: `docs/DATABASE.md §2`
- Modify: `docs/API.md`
- Modify: `docs/BACKEND.md`

- [ ] Add exact single-source definitions for `LandmarkFrame`, `NormalizedFrame`, `MetricSample`, `RepEvent`, `NeutralStats`, `SessionRecordInput`, `SessionRecordFull`, `TrendSeries`, and `AppStateContext`.
- [ ] Add or remove glossary entries for `Adherence`, `ExerciseResult`, `RepMetric`, `RawMetricSample`, `SessionEvent`, and any approved quality/geometry types.
- [ ] Remove duplicate reconstructed shapes and replace them with references.
- [ ] Resolve `SessionController.stop`: return `SessionRecordFull` if nested results are required by `SummaryScreen` and `sessionEnded`.
- [ ] Resolve `captureNeutral` to return both neutral features and quality score under one exact named type or exact inline type.

**Validation:** add a documentation consistency script/test that fails when a public capitalized type used in API/BACKEND is absent from the glossary/owning definition.

### Task 1.2: Define the hot-path call graph

**Files:**
- Modify: `docs/ARCHITECTURE.md §§3, 5, 8`
- Modify: `docs/API.md §§5–10, 18`
- Modify: `docs/BACKEND.md §§1.2–1.6, 2`
- Modify: `docs/SAFETY_AND_COMPLIANCE.md §10`

- [ ] Apply DG-1.
- [ ] Define exact ownership from camera callback through rendering.
- [ ] Define inference-error conversion, quality event emission, quality-approved data, and normalization call.
- [ ] Define what resets on unmount, exercise transition, bad quality, session stop, and camera loss.
- [ ] Prove that non-OK variants cannot call geometry/metrics through a compile-time type assertion and runtime test.

**Acceptance:** the call graph, signatures, and safety enforcement map agree; there is one caller/owner at every boundary.

### Task 1.3: Remove calibration circularity

**Files:**
- Modify: `docs/ARCHITECTURE.md §4`
- Modify: `docs/API.md §§7, 11`
- Modify: `docs/BACKEND.md §§1.4, 1.7`
- Modify: `docs/IMPLEMENTATION.md Tasks 6 and 10`

- [ ] Apply DG-2.
- [ ] Define the absolute geometry measurement used before a baseline exists.
- [ ] Define how three neutral captures are median-aggregated.
- [ ] Keep `NormalizationLayer.normalize` baseline-required.
- [ ] Explicitly forbid fake/default/zero baselines.

**Acceptance:** a first-time calibration sequence is expressible using only documented calls.

### Task 1.4: Resolve rendering and timing ownership

**Files:**
- Modify: `docs/API.md §§10, 18`
- Modify: `docs/BACKEND.md §§1.5–1.6`
- Modify: `docs/FRONTEND.md §§2.4, 3, 5`

- [ ] Apply DG-8.
- [ ] Define hot-path computation rate, event publication rate, canvas repaint rate, and DOM rate.
- [ ] Define exact capture-to-visible-feedback latency clocks.

**Acceptance:** no consumer expects 24+ unique samples per second from a ≤15 Hz event.

### Phase 1 gate

Run a doc consistency review. Stop if any public signature, type, event, error, or owner differs between canonical docs.

## 7. Phase 2: Geometry research spike

**Goal:** select the smallest feature representation that passes evidence gates without premature schema expansion.

### Task 2.1: Create candidate property tests before candidate code

**Files:**
- Modify: `tests/unit/normalize.test.ts`
- Create only if needed: one focused candidate-analysis test under `tests/unit/`

- [ ] Add an aspect-ratio test using the same physical geometry represented at 4:3 and 16:9.
- [ ] Add scale/distance invariance tests.
- [ ] Add positive and negative yaw tests that fail when pose correction is removed.
- [ ] Add direction reversal: equal opposite motion must not score as symmetric.
- [ ] Add neutral-noise tests below the movement floor.
- [ ] Add exercise-specific expected-direction tests.
- [ ] Verify each test fails against the current scalar implementation for the intended reason.

**Acceptance:** tests distinguish real correction from a rotation-invariant scalar-distance no-op.

### Task 2.2: Specify coordinate conventions

**Files:**
- Candidate notes in this plan or a non-canonical analysis artifact
- Later owner: `docs/ARCHITECTURE.md §7`

- [ ] Define pixel/aspect conversion for X/Y.
- [ ] Decide whether Z is excluded, rescaled, or converted through a supported canonical-space method.
- [ ] Define face-local horizontal/vertical axes and handedness.
- [ ] Define anatomical left/right independently of mirrored display.
- [ ] Define yaw/pitch/roll matrix direction, axis order, and sign.

**Acceptance:** two independent implementations produce the same result on a numerical example.

### Task 2.3: Evaluate scalar projections

**Files:**
- Modify only analysis tooling after approval: `tests/analysis/v1-runner.html`, `scripts/run-v1.mjs`
- Do not modify production normalization yet.

- [ ] Evaluate aspect-corrected, face-local signed scalar candidates for all four exercises.
- [ ] Compute neutral noise, signal-to-noise ratio, within-clip variability, lighting deviation, distance deviation, and both yaw directions.
- [ ] Report every candidate, including failures; do not overwrite the original report.
- [ ] Prefer the simplest candidate satisfying the approved V1 protocol.

**Acceptance:** one scalar candidate passes the approved research gates, or the report proves scalar representation insufficient.

### Task 2.4: Escalate to vectors only if required

**Dependency:** Task 2.3 demonstrates scalar failure.

- [ ] Stop and request DG-3/DG-5 approval for vector storage/contract changes.
- [ ] Add vector-specific schema/API tests before implementation.
- [ ] Repeat the same candidate analysis.

**Acceptance:** no vector/schema complexity is added without evidence that the scalar contract cannot work.

### Phase 2 gate

Stop unless a candidate has evidence for sensitivity, scale, lighting, distance, and both pose directions. A frontal-only improvement is not sufficient.

## 8. Phase 3: Amend the canonical measurement and validation docs

**Goal:** make the selected algorithm and V1 protocol the sole source of truth.

### Task 3.1: Replace normalization math

**Files:**
- Modify: `docs/ARCHITECTURE.md §§6–8, 12`
- Modify: `docs/API.md §§5–8, 15`
- Modify: `docs/BACKEND.md §§1.2–1.5`
- Modify: `docs/MODEL_AND_DATA.md §§1–2, 6–7`
- Modify: `docs/IMPLEMENTATION.md Task 6`
- Modify: `docs/TESTS.md §§2–3`

- [ ] Document the exact selected coordinate and feature formulas.
- [ ] Document signs, units, anchors, landmarks, aspect handling, and pose handling.
- [ ] Define direction-aware `symmetryIndex`.
- [ ] Define effort from the selected displacement.
- [ ] Define behavior at zero and below movement floor.
- [ ] Remove all statements that inverse-rotated scalar distance provides pose correction.

**Acceptance:** an agent can implement every formula without choosing an unstated convention.

### Task 3.2: Define metric temporal semantics

**Files:** same owning metric/API/backend/test sections

- [ ] Define trailing versus centered five-frame median and null handling.
- [ ] Define whether raw or smoothed effort drives ease-off and reps.
- [ ] Define exact threshold equality behavior.
- [ ] Define bad-quality gap behavior for smoothing, rep state, and the 300 ms timer.
- [ ] Define stop/unmount behavior for an active incomplete rep.
- [ ] Define maximum/stuck-rep handling or explicitly state that session stop discards it.
- [ ] Confirm the algorithm can meet the 100 ms budget; otherwise change smoothing/rate only through a documented threshold decision.

### Task 3.3: Define calibration and noise

**Files:**
- Modify: `docs/ARCHITECTURE.md §4`
- Modify: `docs/DATABASE.md §§2–4`
- Modify: `docs/API.md §§3, 11–12`
- Modify: `docs/BACKEND.md §1.7`
- Modify: `docs/TESTS.md §2`

- [ ] Apply DG-4/DG-5.
- [ ] Define neutral statistic aggregation and units.
- [ ] Define quality-score scope.
- [ ] Define comfortable-max peak extraction and aggregation.
- [ ] Define baseline-drift formula and region aggregation.
- [ ] Pair noise with its baseline.
- [ ] Define invalidation after algorithm/model version changes.

### Task 3.4: Publish the V1 statistical analysis plan

**Files:**
- Modify: `docs/MODEL_AND_DATA.md §§4, 6–7`
- Modify: `docs/IMPLEMENTATION.md Task 6`
- Modify: `docs/TESTS.md §3.1`

- [ ] Apply DG-6/DG-7.
- [ ] Define a continuous/paired capture protocol that controls expression intensity.
- [ ] Use the phase order: neutral, frontal smile, left yaw, right yaw, dim light, 2 m; dim and distance remain last.
- [ ] Record actual derived pose angles and quality counts.
- [ ] Define exact B1/B2/B3 calculations and units.
- [ ] Define subject/trial aggregation and uncertainty.
- [ ] Define rejection and rerun rules before data collection.
- [ ] Define which failures stop the project versus narrow a claim.

**Acceptance:** analysis code can be written directly from the protocol without interpreting prose.

### Phase 3 gate

Require human review of every `DOCS-CHANGE`. Do not implement production code until the revised ten-doc set is internally consistent.

## 9. Phase 4: Implement quality and geometry with TDD

**Goal:** implement only the approved contracts and selected candidate.

### Task 4.1: Implement canonical types and quality-approved flow

**Files:** exact paths depend on DG-1; likely existing files under `src/sensing/`, `src/metrics/`, and `src/session/`

- [ ] Write compile-time/type tests for non-OK frames.
- [ ] Verify they fail under the old signatures.
- [ ] Implement the approved discriminated result/type boundary.
- [ ] Add runtime tests for all quality states and inference failure.
- [ ] Verify `NormalizationLayer.normalize` has no caller reachable from a non-OK branch.

### Task 4.2: Implement the pure geometry kernel

- [ ] Write tests for aspect, axes, signs, scale, and pose.
- [ ] Implement the minimum shared geometry needed by calibration and normalization.
- [ ] Keep raw landmarks transient and never log them.
- [ ] Reuse the kernel for neutral capture and baseline-subtracted normalization.

### Task 4.3: Implement per-exercise features

- [ ] Implement one exercise at a time, starting with `EX_SMILE`.
- [ ] Run its property and fixture tests before adding the next exercise.
- [ ] Preserve canonical `RegionId`/`ExerciseId` mapping.
- [ ] Do not generalize beyond the four documented exercises.

### Task 4.4: Repair quality gates

- [ ] Replace whole-frame luma with the approved face-region statistic.
- [ ] Make distance independent of capture resolution or enforce/verify one resolution.
- [ ] Restrict resting jitter to phases where rest is explicit, or use the approved motion-compensated statistic.
- [ ] Add tests for bright background/dark face, dark background/lit face, 640×480 vs. 1280×720, intentional motion, and actual jitter.

### Phase 4 gate

Run focused unit suites and branch coverage. Stop if any property test fails or the quality boundary can be bypassed.

## 10. Phase 5: Calibration, metrics, and timing

**Goal:** make the revised geometry usable without reintroducing circularity or timer bugs.

### Task 5.1: Implement first-baseline calibration

- [ ] Test first-run neutral capture with no baseline.
- [ ] Test three-capture median aggregation.
- [ ] Test quality rejection at documented boundaries.
- [ ] Test comfortable max per assigned exercise.
- [ ] Test baseline/noise pairing and persistence.
- [ ] Remove every zero-baseline workaround.

### Task 5.2: Implement direction-aware metrics

- [ ] Test symmetric same-direction movement.
- [ ] Test equal opposite-direction movement.
- [ ] Test unilateral movement.
- [ ] Test below-floor null behavior.
- [ ] Test effort calibration and over-effort.

### Task 5.3: Implement gap-safe temporal logic

- [ ] Test trailing median ordering and null frames.
- [ ] Test a quality gap during an active rep.
- [ ] Test a gap during ease-off sustain.
- [ ] Test stop/unmount during active state.
- [ ] Test cross-exercise reset.

### Task 5.4: Verify latency

- [ ] Measure with one monotonic timestamp domain.
- [ ] Include inference, smoothing, dispatch, and first visible paint.
- [ ] Test on both documented hardware gates.
- [ ] Record distributions, not only one best sample.

### Phase 5 gate

Stop if the corrected algorithm cannot meet latency without weakening correctness/safety. Return to DG-8 or smoothing design with evidence.

## 11. Phase 6: Redesign the V1 capture interface

**Goal:** make correct recording obvious and invalid recording recoverable.

### Task 6.1: Centralize dev strings and UI tunables

**Files:**
- Modify: `src/config/strings.ts`
- Modify only when approved: `src/config/thresholds.ts`
- Modify: owning docs for any new key/tunable

- [ ] Move all V1 user-visible copy into `strings.ts`.
- [ ] Move any preparation/countdown/stability tunable into `thresholds.ts`.
- [ ] Add identifiers to the glossary before using them if they are canonical.
- [ ] Amend the camera-lifecycle rule with a narrowly scoped development-only harness exception; production remains limited to `CalibrationScreen` and `SessionScreen`.

### Task 6.2: Build explicit capture states

**Files:**
- Modify: `src/dev/LiveV1Harness.tsx`
- Add minimal CSS only if existing styling cannot express the responsive layout
- Test: one focused component/E2E test

- [ ] Add `setup`, `prepare`, `recording`, `review`, and final-report presentation without changing product screens.
- [ ] Show phase progress and one primary action.
- [ ] Disable start unless quality is valid for the current phase.
- [ ] For expression phases, show detected/not-detected using the approved movement floor; hide raw decimals under diagnostic details.
- [ ] Show actual yaw/pitch/roll and required direction for pose phases.
- [ ] Show valid-frame counts while recording.
- [ ] Permit retrying the current phase without restarting accepted earlier phases.
- [ ] Make invalid capture distinct from measurement failure.

### Task 6.3: Use the approved phase order

- [ ] Neutral.
- [ ] Frontal gentle smile.
- [ ] Left yaw.
- [ ] Right yaw.
- [ ] Same smile under dim light.
- [ ] Same smile at 2 m.

The last two phases remain dim light and 2 m as explicitly requested.

### Task 6.4: Accessibility and responsive verification

- [ ] Keyboard-only completion.
- [ ] Visible focus.
- [ ] `aria-live` status without per-frame announcement spam.
- [ ] No color-only status.
- [ ] Touch targets at least 44×44 CSS px.
- [ ] No overflow at 375, 414, 768, 1024, and 1440 px widths.
- [ ] Camera preview maintains aspect ratio.
- [ ] 200% text scale remains usable.

### Phase 6 gate

A fresh operator must complete the protocol without verbal coaching and must correctly identify an intentionally invalid phase.

## 12. Phase 7: Execute V1 as the real kill gate

**Goal:** decide whether the measurement product is viable.

### Task 7.1: Validate fixture provenance

- [ ] Confirm consent covers exact repository/testing use.
- [ ] Confirm manifest demographics/conditions without names.
- [ ] Confirm master and replay paths/formats.
- [ ] Confirm no fixture or derived visual artifact is created outside approved locations.

### Task 7.2: Run the approved paired protocol

- [ ] Capture the approved subjects/trials.
- [ ] Reject/rerun only according to prewritten rules.
- [ ] Generate candidate-versioned CSV/report artifacts containing derived metrics only.
- [ ] Keep actual pose and quality summaries in the report.

### Task 7.3: Calculate B1–B3 exactly

- [ ] Run the predeclared formulas.
- [ ] Report per-subject and aggregate results.
- [ ] Report rejected samples and missing cells.
- [ ] Do not introduce fallback metrics after seeing results.

### Task 7.4: Decide viability

**PASS:** all approved B1–B3 criteria met; accept Task 6 and proceed.

**FAIL due to capture/protocol:** fix the recorder/protocol only if the predeclared invalidity rule applies, then repeat.

**FAIL due to algorithm:** return to Phase 2 with one new hypothesis at a time.

**FAIL after three well-founded candidates:** stop and reconsider whether commodity-landmark geometry can support the product claim. Do not attempt a fourth patch without architecture discussion.

### Phase 7 gate

Only an approved B1–B3 PASS accepts Task 6. Invalid/missing cells, post-hoc fallback metrics, or a partially passing candidate keep the task blocked.

## 13. Phase 8: Data, trends, Demo, and privacy repairs

**Goal:** align persistence and downstream interpretation with revised measurement semantics.

### Task 8.1: Pair noise with baseline

- [ ] Apply DG-5 migration/reset decision.
- [ ] Update schema, API, validation, seed, export schema, and tests together.
- [ ] Ensure historical trends never use noise from another baseline.

### Task 8.2: Define trend aggregation

- [ ] Define null exclusion, rep/session weighting, minimum samples, time zone, period boundaries, first-point behavior, and partial-session treatment.
- [ ] Test each rule using hand-computed data.

### Task 8.3: Replace ambiguous adherence

- [ ] Define completion only over user-started sessions/exercises, or rename the output.
- [ ] Do not invent a planned-session schedule.
- [ ] Audit UI copy for guilt/pressure language.

### Task 8.4: Isolate Demo Mode

- [ ] Apply DG-9.
- [ ] Remove sensitive reads in Demo.
- [ ] Resolve the `StorageService ↔ SafetyGate` module cycle using the smallest approved internal state boundary.
- [ ] Test Demo on a database containing real seeded history and prove no sensitive value appears in UI/events/exports.
- [ ] Verify zero writes and reload exit.

### Task 8.5: Enforce single profile and deletion behavior

- [ ] Define transactional replace/reject behavior for a second profile.
- [ ] Test deletion with open connections and simulated failure.
- [ ] Keep the typed confirmation and blocking-state recovery path.

### Phase 8 gate

Run schema, migration/reset, trend, Demo isolation, single-profile, transaction, export, and deletion tests. Stop if any historical series can use another baseline's noise or Demo can observe patient data.

## 14. Phase 9: External evidence and claims

**Goal:** remove stale or unsupported external assertions.

### Task 9.1: Runtime and telemetry verification

- [ ] Inspect the pinned MediaPipe web package for telemetry endpoints/calls.
- [ ] Run no-network tests through initialization, calibration, session, model failure, offline reload, and Demo.
- [ ] Record actual GPU backend behavior; use `GPU` terminology unless WebGPU is proven.
- [ ] Pin supported minimum browser versions.
- [ ] Update Firefox Windows installation behavior from current Mozilla documentation.

### Task 9.2: Dataset/license register

- [ ] Record exact access and redistribution terms for MEEI, Toronto NeuroFace, FairFace, and Casual Conversations.
- [ ] Record permitted use, attribution, repository inclusion, and deletion obligations.
- [ ] Do not acquire restricted data until the register is complete.

### Task 9.3: Clinical review

- [ ] Have a qualified facial-therapy clinician review exercise selection, phase scope, gentle/over-effort behavior, dosing, emergency/stop language, and outcome claims.
- [ ] Record accepted changes in the owning docs.
- [ ] Keep clinician assignment mandatory.

### Task 9.4: Regulatory/privacy review

- [ ] Apply DG-10 wording immediately.
- [ ] Obtain jurisdiction-specific advice before public distribution.
- [ ] Re-evaluate intended purpose, metrics, coaching, export, and promotional language together.
- [ ] Do not rely on “not a medical device” or “does not treat” disclaimers as classification evidence.

### Phase 9 gate

All external claims must have dated evidence. Unresolved telemetry, license, clinical, or regulatory questions remain explicit release blockers; agents may document them but may not mark them passed.

## 15. Phase 10: Resume downstream work safely

**Prerequisites:** Phase 7 PASS, Phase 8 PASS, and Phase 9 findings documented.

- [ ] Mark Task 6 accepted with links to V1 evidence.
- [ ] Revalidate Task 7 metrics/reps against the changed geometry.
- [ ] Revalidate Task 8 DebugHud columns and analysis output.
- [ ] Rebase later task requirements on the amended canonical docs.
- [ ] Run full CI before accepting each subsequent task.

No previous Task 7+ acceptance survives automatically when its mathematical input changes.

### Phase 10 gate

Run the full verification matrix and link fresh results from the implementation ledger. Downstream tasks resume individually, not through blanket acceptance.

## 16. Full verification matrix

| Area | Required evidence |
|---|---|
| Docs | Reference scan; exact type ownership; glossary coverage; no unresolved contract conflict |
| Geometry | Aspect, scale, yaw ±, direction, neutral noise, exercise-specific fixture tests |
| Quality | Every state boundary; face-region luma; resolution independence; intentional movement vs. jitter |
| Safety | Non-OK type barrier; frozen output; gap/reset semantics; stop flows |
| Calibration | First baseline without default; medians; quality score; comfortable max; drift; paired noise |
| Metrics | Direction-aware SI; effort; floor; smoothing; ease-off; rep thresholds; gaps; reset |
| Storage | Migration/reset; FKs; one active baseline; one profile; transactions; deletion; Demo isolation |
| UI | Prepare/record/review/retry; actual pose; invalid capture; keyboard; axe; 200%; responsive widths |
| V1 | Predeclared B1–B3; paired trials; measured pose; per-subject stats; no post-hoc fallback |
| Privacy | No raw persistence/logging; no outbound requests/telemetry; export-only egress |
| Platforms | Exact Chromium/Firefox/Android versions; offline; camera; latency |
| Claims | Clinical review, license register, regulatory wording, evidence-bounded marketing |

Recommended final commands after implementation:

```bash
rtk npm run build
rtk npm run test:coverage
rtk npm run test:e2e
rtk npm run test:a11y
```

Also run the canonical no-network job and approved V1 runner separately; a general unit-test pass does not prove either.

## 17. Commit strategy

Keep commits narrow and reversible:

1. `docs: resolve pipeline and type contracts`
2. `docs: specify geometry and V1 protocol`
3. `test: add normalization property failures`
4. `fix: implement approved face-local geometry`
5. `fix: bootstrap calibration without default baseline`
6. `fix: make metric timing quality-gap safe`
7. `feat: clarify V1 capture workflow`
8. `fix: pair noise with calibration baseline`
9. `fix: isolate demo data access`
10. `docs: record V1 evidence and task acceptance`

Each contract/threshold/schema/safety commit must carry its required `DOCS-CHANGE` body line.

## 18. Rollback and failure policy

- Documentation-only decisions can be reverted before implementation if no accepted code depends on them.
- Geometry candidates remain isolated behind tests/analysis until selected.
- If a selected candidate fails V1, revert its production implementation but preserve its report as rejected evidence.
- Never roll back by weakening a safety gate, deleting a failing test, relabeling an invalid capture, or changing a threshold after observing test results without a new documented validation rationale.
- If schema migration fails, stop writes, preserve the original database, and return to the migration decision; never silently clear user data.
- If no geometry candidate meets V1, retain the local-first shell only if the measurement/feedback claim is removed. Do not ship confident symmetry scoring.

## 19. Audit issue coverage

| Audit findings | Addressed in |
|---|---|
| P0-1 | DG-1; Phases 1 and 4 |
| P0-2 | DG-2; Phases 1 and 5 |
| P0-3 | DG-3; Phases 2 through 4 |
| P0-4 | DG-3; Phases 2 through 4 |
| P0-5 | DG-3; Phases 2 through 4 |
| P0-6 | DG-3; Phases 2, 3, and 5 |
| P0-7 | DG-4; Phases 3 and 5 |
| P0-8 | DG-6/DG-7; Phases 3 and 7 |
| P0-9 | Phase 1 |
| P0-10 | DG-10 and Phase 9 |
| P1-1 | Phase 1 |
| P1-2 | DG-8; Phases 1 and 5 |
| P1-3 | DG-8; Phases 3 and 5 |
| P1-4 | Phases 3 and 5 |
| P1-5 | Phase 4 |
| P1-6 | Phase 4 |
| P1-7 | Phase 4 |
| P1-8 | DG-3/DG-7; Phases 2 and 3 |
| P1-9 | Phases 2 and 6 |
| P1-10 | DG-4/DG-5; Phase 8 |
| P1-11 | Phases 3 and 5 |
| P1-12 | Phase 8 |
| P1-13 | Phase 8 |
| P1-14 | DG-9; Phase 8 |
| P1-15 | Phase 6 |
| P1-16 | Phase 8 |
| P1-17 | Phases 1 and 8 |
| P1-18 | DG-6; Phases 3, 7, and 9 |
| P1-19 | Phase 9 |
| P1-20 | DG-11 and Phase 9 |
| P1-21 | DG-12; Phases 0 and 10 |
| P2 findings | Relevant owning phase plus final documentation review |

## 20. Agent handoff template

Every agent completing a task reports only evidence:

```text
Task:
Decision gates satisfied:
Files changed:
Failing test observed:
Minimal fix:
Verification command and result:
Canonical docs amended:
DOCS-CHANGE line:
Remaining blockers:
```

An agent must not say “done” when a decision gate, test, V1 bar, clinical review, license check, or regulatory review remains open.
