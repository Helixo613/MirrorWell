# Backend Completion Plan (no new recordings)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development — fresh implementer subagent per task, independent reviewer per task, fix rounds until approved, controller commits. That loop caught a session-hanging deadlock and two silent metric-corruption bugs that a green 203-test suite did not. Execute tasks strictly in order; do not start a task whose predecessor is not approved. Self-contained; other required reading: repo `CLAUDE.md`, `docs/ARCHITECTURE.md` §12/§13, `docs/API.md`, `docs/BACKEND.md`.

**Goal:** Complete the backend and close out V1 **honestly with the data that already exists** — no further fixture recording by the operator. Acceptance evidence for the measurement contract moves to the V2 palsy-dataset gate.

## The constraint that shapes this plan

The operator will record no further fixtures. Four trials exist (two sittings × two trials; run-1 clips are in `tests/fixtures/masters/retired-20260719/`, run-2 clips are the current `_1`/`_2` set). Exactly **one** of those four passed every bar. The V1 protocol requires every trial of every subject to pass every bar, so:

- **V1 cannot be passed with existing data.** Any path to "PASS" from here — re-analyzing the four trials with a rule invented after seeing their results, or selecting the trials that passed — is tuning against the test set. `MODEL_AND_DATA.md` §7 forbids it and this plan does not do it.
- The honest disposition is **PROTOCOL_LIMITED**: the measurement is validated *under intensity-matched conditions* (one clean trial, all six bars, plus the smirk sensitivity probe) and *not* validated for operator intensity reproduction, which is a property of the capture protocol, not of the metric.
- **Acceptance therefore moves to V2** (`2026-07-20-v2-palsy-dataset-gate.md`). MEEI clips are clinician-recorded and fixed: there is no operator to vary intensity, which removes exactly the variable that defeated V1. V2 is also the stronger evidence — real palsy faces rather than a symmetric operator simulating asymmetry.
- Everything built in the meantime stays **PROVISIONAL** in the ledger. That word is doing real work: if V2 fails and the fallback ladder is invoked, provisional work built on the current metric contract is invalidated. This is the accepted risk, recorded rather than hidden.

## Global constraints (every task)

- Docs win; contract changes carry `DOCS-CHANGE: <doc> §<n> — <what and why>` in the commit body.
- No network calls. No frame/video/landmark persistence or logging.
- Tunables only in `src/config/thresholds.ts`; user-facing strings only in `src/config/strings.ts`.
- No invented identifiers — amend `ARCHITECTURE.md` §12 first.
- **Verification: `npm run typecheck` (= `tsc -b`). `npx tsc --noEmit` type-checks NOTHING here** (root tsconfig is a solution file with `"files": []`) — CLAUDE.md verified-fact 7. Full gate set: `npm run typecheck`, `npx vitest run`, `npm run build`, `node scripts/check-docs.mjs`, `npx playwright test tests/e2e/no-network.spec.ts`.
- Never tune a bar or invent a rule after seeing results.
- TDD every code task: failing test → verify it fails for the right reason → minimal implementation → verify green → commit.

---

## Phase 0 — Land `backend-services-v1`

### Task 0.1 — Apply final-review fixes and merge
- [ ] Apply the whole-branch review findings (C1 camera-ownership deadlock, C2 duplicate/undocumented thresholds, I1 CalibrationFlow state reset, I2 shared frame-source seam, I3 export strings, M1–M6).
- [ ] Re-review the fix diff; all gates green.
- [ ] Push `backend-services-v1`, merge to `main`. Evidence: `docs/superpowers/reports/backend-services-v1/`.

---

## Phase 1 — Close V1 honestly (no new data)

### Task 1.1 — Pooled analysis of existing trials (exploratory, clearly labelled)

**Files:** Create `tests/analysis/v1-intensity-analysis.mjs`; output `tests/analysis/v1_S01_intensity_analysis.json`
**Purpose:** quantify the intensity-confound claim so the limitation is documented with numbers instead of assertion. **This is exploratory analysis, not gate evidence, and the script must say so in its header and in its output file (`"kind": "exploratory-analysis", "isGateEvidence": false`).**

- [ ] **Step 1: Write the script.** For all four trials (run-1 clips under `tests/fixtures/masters/retired-20260719/`, run-2 clips current), sample via the existing `tests/analysis/v1-runner.html` harness (reuse the server/Playwright pattern from `tests/analysis/blendshape-probe.mjs`). Per phase emit: mean activation, activation ratio vs that trial's frontal-smile mean, mean SI, and the B2/B3 values already computed by `scripts/run-v1.mjs`.
- [ ] **Step 2: Report the correlation.** Across all phase-cells from all four trials, report the relationship between |activation ratio − 1| and bar failure (a table is sufficient; do not fit a model). The claim to be tested: cells whose activation is within ±10% of their trial's frontal reference pass their bars; cells far outside it fail.
- [ ] **Step 3: Run it.** Record the output verbatim in the report file. **If the data contradicts the intensity explanation, say so** — that outcome means the metric itself is suspect and Task 1.2's wording must change accordingly. Do not massage the framing to fit the expected story.
- [ ] **Step 4: Commit** `research: pooled intensity analysis across the four recorded V1 trials (exploratory)`.

### Task 1.2 — Record the V1 disposition in the docs

**Files:** `docs/MODEL_AND_DATA.md` §7, `docs/IMPLEMENTATION.md` (kill-gate paragraph + ledger)

- [ ] MODEL_AND_DATA §7: add a **V1 disposition** subsection stating: four trials recorded; one passed all six bars; the others failed only B2/B3 cells, and Task 1.1's analysis shows those failures track operator smile-intensity mismatch rather than measurement instability (cite the numbers). State that the V1 operator protocol is **retired without a PASS** because no further operator fixtures will be recorded, and that acceptance evidence for the measurement contract moves to the V2 gate. State plainly that bars were never adjusted.
- [ ] Add the protocol lesson so it is not repeated: any future capture protocol must control smile intensity with a measured band (±10% of the trial's frontal reference), the way yaw is controlled — B2/B3 are intensity-sensitive and an operator cannot reproduce intensity by feel.
- [ ] IMPLEMENTATION.md: kill-gate paragraph rewritten to the above; ledger Task 6 status → **PROTOCOL_LIMITED** (not ACCEPTED, not silently BLOCKED forever) with the evidence links; Tasks 7–11, 14–15 remain **PROVISIONAL pending V2**.
- [ ] `node scripts/check-docs.mjs` green. Commit with `DOCS-CHANGE: MODEL_AND_DATA.md §7 + IMPLEMENTATION.md — V1 disposition PROTOCOL_LIMITED (four trials, one clean; intensity confound documented; acceptance moves to V2)`.

### Task 1.3 — Live demo view (not a gate artifact)

**Files:** `src/dev/LiveV1Harness.tsx`, `src/config/strings.ts`, `tests/unit/live-v1-harness.test.ts`
**Why it survives the no-recordings constraint:** it shows the concept working live; it records nothing.

- [ ] **Step 1: Failing component test** — a demo view state renders large live SI and activation readouts, and a not-colour-only symmetric/asymmetric indicator driven by SI vs `thresholds.blendshapes.activationFloor` and a demo band.
- [ ] **Step 2: Implement.** Reuse the existing live pipeline in the harness; add no new capture path. All copy from `strings.ts`. Keyboard operable, visible focus, `aria-live="polite"` for state changes (not per frame).
- [ ] **Step 3:** Component test green; harness stays excluded from the prod bundle (`VITE_ENABLE_CAPTURE_HARNESS`). Commit.

---

## Phase 2 — Close the open measurement decision

### Task 2.1 — EX_PUCKER disposition

`mouthPucker` has no per-side blendshape pair. Options: (a) `mouthStretchLeft/Right` proxy; (b) keep geometry-SI for this exercise only; (c) drop EX_PUCKER from v1.

- [ ] **Recommended: (c).** Rationale to record: three exercises already cover brow/eye/mouth regions; a proxy measures a different muscle action and would ship an unvalidated number on a clinical-adjacent screen; (b) resurrects the geometry path three candidates rejected and would owe its own V1-equivalent evidence that cannot now be produced. **This is an owner decision — implement (c) only on explicit confirmation; otherwise stop and report.**
- [ ] On (c): remove EX_PUCKER from assignable exercises in `src/config/exercises.ts`, delete the `VALIDATION_FAILED`-on-missing-pair throw and its tests, record the decision and its reversibility in `MODEL_AND_DATA.md` §7 and `docs/ARCHITECTURE.md` §12. Commit with a `DOCS-CHANGE` line.
- [ ] Test: the exercise set contains exactly the exercises with a `blendshapePair`; `SessionController.start` rejects anything else with `VALIDATION_FAILED`.

### Task 2.2 — All remaining exercises config-driven (IMPLEMENTATION Task 12, backend half)

**Files:** `src/config/exercises.ts`, `tests/unit/exercises.test.ts`, `tests/unit/controller.test.ts`

- [ ] **Step 1: Failing tests** — `EX_BROW_RAISE` and `EX_EYE_CLOSURE` each run a full DEMO→REPS→REST cycle through `SessionController` driven only by their config rows (no per-exercise branch anywhere in `src/`); exercise switch mid-session resets both `MetricEngine` and `RepDetector` (assert no metric leakage).
- [ ] **Step 2:** If any exercise needs code changes to work, the config schema is wrong — fix the schema, not the call site (IMPLEMENTATION Task 12 rule).
- [ ] **Step 3:** Gates green. Commit.

---

## Phase 3 — Consolidate the measurement path

### Task 3.1 — Scope geometry to calibration/drift only

**Files:** `src/metrics/geometry.ts`, `src/metrics/normalize.ts`, `tests/unit/geometry.test.ts`, `docs/ARCHITECTURE.md` §7, `docs/BACKEND.md` §1.4

- [ ] **Step 1:** Inventory what still consumes geometry. Keep `measureAbsolute`/`aggregateNeutral` — `CalibrationFlow.captureNeutral` and `checkBaselineDrift` need them, and both run at frontal neutral where the yaw weakness that killed geometry-SI does not apply.
- [ ] **Step 2: Failing test first** — assert no production module derives `symmetryIndex` from `regionDisplacements` (grep-style structural test or a type-level barrier).
- [ ] **Step 3:** Delete the dead SI/mirroring/`cosθ` machinery and its tests. **Keep** the permanent guard test that unilateral motion must not read as symmetric — that documents the common-mode-subtraction trap and must survive the deletion.
- [ ] **Step 4:** Docs §7/§1.4 state which path produces SI (blendshape) and which produces geometry (calibration + drift only), so no future reader re-wires them. Commit with a `DOCS-CHANGE` line.

---

## Phase 4 — Phase 8 repairs (data, trends, demo, privacy)

Source: `REMEDIATION_PLAN_2026-07-12.md` §13. Tasks 8.1/8.2 are largely satisfied by `TrendsService` — verify, don't rebuild.

### Task 4.1 — Verify 8.1/8.2 and document the aggregation rules
- [ ] Re-assert after merge: a trend series can never use another baseline's noise floor.
- [ ] Document in `docs/BACKEND.md` the rules `TrendsService` actually implements: null exclusion, session weighting, minimum samples, **UTC** period boundaries, first-point behavior, partial-session treatment, and the empty-middle-bucket comparison semantics. Any implemented rule absent from the docs is drift. Commit with a `DOCS-CHANGE` line.

### Task 4.2 — Adherence honesty (8.3)
- [ ] **Step 1: Failing test** pinning that `completionRate` is defined only over user-started sessions.
- [ ] **Step 2:** Either document that precisely in API §12 or rename the field. **Never invent a planned-session schedule** — the app does not prescribe dosing.
- [ ] **Step 3:** Audit adherence copy in `strings.ts` for guilt/pressure language (SAFETY §8). Commit.

### Task 4.3 — Demo Mode read isolation (8.4)
- [ ] **Step 1: Failing test** — with a DB seeded with real history (`src/dev/seed.ts`), every demo-reachable read path returns no sensitive value; assert across `StorageService` reads, emitted events, and export attempts.
- [ ] **Step 2:** Restrict demo reads to non-sensitive static config per API §17. Writes are already blocked twice over (caller-side + `assertDemoWritable` backstop) — do not weaken either.
- [ ] **Step 3:** Resolve the `StorageService ↔ SafetyGate` lazy-reference cycle with the smallest internal state boundary that keeps both guards.
- [ ] **Step 4:** Verify zero writes and reload-exit. Commit.

### Task 4.4 — Single-profile invariant + deletion (8.5)
- [ ] **Step 1: Failing tests** — saving a second profile behaves per a single documented rule (replace **or** reject — pick one and write it into DATABASE §3); `deleteAllData` succeeds with open connections; a simulated mid-transaction failure leaves no partial state.
- [ ] **Step 2:** Implement; keep the typed confirmation and blocking-state recovery path. Commit with a `DOCS-CHANGE` line.

---

## Phase 5 — Hardening for real hardware (IMPLEMENTATION Task 17, backend half)

### Task 5.1 — Hot-path cost
- [ ] Measure `quality.ts`'s per-frame canvas work for face-region luma (deferred during remediation) on the target device via `DebugHud`.
- [ ] If it costs frame budget: reuse a single canvas/ImageData allocation or sample luma less often. **Gate semantics must not change** — only cost. Pin the behavior with the existing quality tests before touching it.
- [ ] Record capture→metric→paint latency against the ≤100 ms budget. Commit the measurements as evidence.

### Task 5.2 — Browser/device gates and the telemetry blocker
- [ ] Run the fixture-replay suite on Firefox (hard gate — CLAUDE.md verified-fact 5) and the target mobile browser; record results.
- [ ] Prove the pinned MediaPipe package makes zero network requests at runtime (ARCHITECTURE §6 release blocker) — runtime inspection, not documentation reading. Record the method and result.

---

## Phase 6 — V2 dataset gate (now the acceptance path)

- [ ] Execute `docs/superpowers/plans/2026-07-20-v2-palsy-dataset-gate.md` when MEEI access lands. Its bars are already frozen — do not restate or adjust them.
- [ ] **PASS:** the measurement contract is accepted on real palsy faces. Update `MODEL_AND_DATA.md` §2 (canonical-face-prior risk → validated at V2, n=…) and promote the ledger: Tasks 6–11, 14–15 → ACCEPTED, replacing PROVISIONAL/PROTOCOL_LIMITED, citing the V2 report.
- [ ] **FAIL:** activate the §2 fallback ladder (re-derived raw geometry → hybrid landmarks+optical-flow → narrowed claims), drop longitudinal-trend claims until a fallback passes, and treat the provisional backend as invalidated where it depends on the rejected metric.
- [ ] **UNDERPOWERED:** report honestly; the backend stays provisional and the product ships, if at all, with live-feedback-only claims.

---

## Definition of backend-done (under this plan)

1. `backend-services-v1` merged; final-review findings closed.
2. V1 disposition recorded as **PROTOCOL_LIMITED** with the intensity analysis as its evidence — never as a pass.
3. One measurement path produces SI; geometry is scoped to calibration/drift and documented as such.
4. Phase 8 repairs closed: documented aggregation, honest adherence, demo **reads** isolated, single-profile invariant enforced.
5. All gates green on `main`; metrics/reps hold 100% branch coverage.
6. Every open decision recorded in a doc: EX_PUCKER, adherence semantics, second-profile behavior.
7. Ledger reflects reality: PROVISIONAL until V2 returns, then promoted or invalidated by its result. **No task is ever marked ACCEPTED on the strength of a trial that passed while its siblings failed.**

## Out of scope

Screens/routing/FeedbackRenderer (`2026-07-20-frontend-integration.md`); further operator fixture recording (explicitly retired); V3/V4 battery; clinical/regulatory review; efficacy claims; model training (this project trains none).
