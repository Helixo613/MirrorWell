# Backend Completion Plan (from `backend-services-v1` to backend-done)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (fresh implementer per task, independent reviewer per task, fix rounds until approved) — that loop caught a session-hanging deadlock and two silent metric-corruption bugs that a green 203-test suite did not. Self-contained; other required reading: repo `CLAUDE.md`, `docs/ARCHITECTURE.md` §12/§13, `docs/API.md`, `docs/BACKEND.md`.

**Goal:** Take the backend from "all services implemented, everything PROVISIONAL" to "backend complete, V1-accepted, ready for the frontend to consume and for V2 evidence to land."

**Sequencing principle (why this order):** every backend module today is PROVISIONAL because the Task 6 V1 kill-gate has not passed. Building more on an unaccepted measurement contract compounds risk — if the metric contract changes, provisional work built on it is invalidated. So **Phase 1 buys acceptance before Phase 2 builds anything new**, and Phase 3 deletes the dead measurement path before Phase 4 adds behavior to it. V2 (Phase 6) is data-gated and runs in parallel whenever the dataset lands; it never blocks the others.

## Global constraints (every phase)

- Docs in `docs/` win over code; contract changes need a `DOCS-CHANGE: <doc> §<n> — <what and why>` line in the commit body.
- No network calls. No frame/video/landmark persistence or logging (dev-harness fixture-capture exception only, SAFETY §6).
- Tunables only in `src/config/thresholds.ts`; user-facing strings only in `src/config/strings.ts`.
- No invented identifiers — amend `ARCHITECTURE.md` §12 first.
- **Verification: `npm run typecheck` (= `tsc -b`). `npx tsc --noEmit` type-checks NOTHING in this repo** (root tsconfig is a solution file with `"files": []`) — CLAUDE.md verified-fact 7. Full gate set: `npm run typecheck`, `npx vitest run`, `npm run build`, `node scripts/check-docs.mjs`, `npx playwright test tests/e2e/no-network.spec.ts`.
- **Never tune a bar against results.** Predeclare, then measure.

---

## Phase 0 — Land `backend-services-v1` (in flight)

- [ ] Apply the final whole-branch review findings (C1 camera-ownership deadlock, C2 duplicate/undocumented thresholds, I1 CalibrationFlow state reset, I2 shared frame-source seam, I3 export strings, M1–M6).
- [ ] Re-review the fix diff; all gates green.
- [ ] Push the branch and merge to `main`. Evidence lives in `docs/superpowers/reports/backend-services-v1/`.

**Done when:** `main` contains SafetyGate, SettingsService, CalibrationFlow, SessionController, TrendsService, ExportService, all still marked PROVISIONAL in the ledger.

---

## Phase 1 — Pass V1 (unblocks every acceptance) ⭐ highest value

Both failed gate runs traced to one uncontrolled variable: the operator's smile intensity differed between the frontal reference and the dim/2m/yaw phases. The protocol controls yaw with a measured band but leaves intensity free, while B2/B3 are directly intensity-sensitive. Fix the protocol, not the bars.

### Task 1.1 — Protocol v2: measured activation band (docs first)
**Files:** `docs/MODEL_AND_DATA.md` §7
- [ ] Add a per-phase validity rule mirroring the yaw band: a smile-family phase (`smile`, `yaw_left`, `yaw_right`, `low_light`, `distance_2m`) is valid only if its mean activation is within **±10%** of that trial's frontal-smile mean activation. Out-of-band → retry that phase (predeclared, same standing as the ≥70% `QUALITY_OK` rule).
- [ ] State explicitly that bar values (B1a 0.01, B1b 0.05, B2 0.05, B3 0.05) are **unchanged** — this amendment controls an independent variable, it does not relax a bar.
- [ ] `node scripts/check-docs.mjs` green. Commit with `DOCS-CHANGE: MODEL_AND_DATA.md §7 — smile-family phases require measured activation within ±10% of the trial's frontal reference (intensity was the uncontrolled variable in both failed runs)`.

### Task 1.2 — Harness activation readout + demo view
**Files:** `src/dev/LiveV1Harness.tsx`, `src/config/strings.ts`, `tests/unit/live-v1-harness.test.ts`
- [ ] During every smile-family phase, display live activation (`max(L,R)` of the exercise's `blendshapePair`) plus the trial's frontal reference and the ±10% target band, with in-band/out-of-band state that is not colour-only (a11y).
- [ ] Phase Accept is disabled while the phase's running mean activation is out of band — the operator physically cannot record an out-of-band phase, which is the whole point.
- [ ] Same screen doubles as the **demo view**: large live SI readout + activation, so a symmetric smile (SI ≈ 0.98) vs a restrained/smirked one (SI ≈ 0.4–0.7) is legible across a room. One change serves both needs.
- [ ] All copy from `strings.ts`. Component test: band state transitions and Accept gating.

### Task 1.3 — Runner enforces the new validity rule
**Files:** `scripts/run-v1.mjs`, `scripts/v1-protocol.mjs`
- [ ] Per-phase validity gains the activation-band check; an out-of-band phase is `INVALID` (→ FAIL), never silently averaged in — same treatment as an out-of-band yaw phase.
- [ ] Report gains per-phase `meanActivation` and `activationBandOk` so failures are diagnosable without a re-run.

### Task 1.4 — Record and run the gate (human in the loop)
- [ ] Operator records a fresh 2-trial × 6-phase set through the updated harness (band enforced live), replacing trial fixtures wholesale — never mixing sittings within a trial.
- [ ] `bash scripts/convert-fixtures.sh` → `node scripts/run-v1.mjs --subject S01 --candidate blendshape-si-v1 --sample`.
- [ ] **PASS:** ledger Task 6 → **ACCEPTED**; Tasks 7–8 and the Phase 0 services drop PROVISIONAL. Commit `docs: Task 6 accepted — blendshape-si-v1 passes V1`.
- [ ] **FAIL:** preserve to `tests/analysis/rejected/`, stop, report. A second candidate in the blendshape family requires an explicit new decision (slot 2 of 3).
- [ ] **PROTOCOL_LIMITED:** one more re-record, then stop.

---

## Phase 2 — Close the open measurement decision

### Task 2.1 — EX_PUCKER mapping (decision required, do not invent)
`mouthPucker` has no per-side pair. Options, for the owner/mentor to pick:
(a) `mouthStretchLeft`/`mouthStretchRight` as a proxy — cheap, but measures a different muscle action than pucker;
(b) keep geometry-SI for this one exercise — preserves the exercise, costs a second measurement path and its own V1 evidence;
(c) drop EX_PUCKER from v1 scope — honest, smallest, reversible later.
- [ ] **Recommendation: (c) for v1, revisit at V2.** Three exercises already cover brow/eye/mouth regions; shipping a fourth on an unvalidated proxy risks a wrong number on a clinical-adjacent screen, and (b) resurrects the geometry path this project spent three candidates rejecting.
- [ ] Record the decision in `MODEL_AND_DATA.md` §7 and `exercises.ts`; if (c), remove EX_PUCKER from assignable exercises and delete the `VALIDATION_FAILED` throw path with its test.

### Task 2.2 — Task 12 backend half: all exercises config-driven
**Files:** `src/config/exercises.ts`, `tests/unit/exercises.test.ts`
- [ ] Verify `EX_BROW_RAISE` and `EX_EYE_CLOSURE` run end-to-end through `SessionController` purely via config — no component or engine branch per exercise. If any needs code changes, the config schema is wrong; fix the schema (IMPLEMENTATION Task 12).
- [ ] Test: exercise switch mid-session leaks no metric state (assert both engines reset), and each exercise passes the Task 11 battery shape.

---

## Phase 3 — Consolidate the measurement path (delete before you add)

With blendshape-SI accepted, the geometry displacement path is no longer an SI source — but it is still load-bearing for calibration bootstrap and drift. Leaving a dead second path invites future code to read the wrong one.

### Task 3.1 — Retire geometry as an SI source
**Files:** `src/metrics/geometry.ts`, `src/metrics/normalize.ts`, `docs/ARCHITECTURE.md` §7, `docs/BACKEND.md` §1.4
- [ ] Keep `measureAbsolute`/`aggregateNeutral` (calibration bootstrap + `checkBaselineDrift` need them — both operate at frontal neutral, where the yaw weakness that killed geometry-SI does not apply).
- [ ] Delete or clearly quarantine any remaining SI/mirroring/`cosθ` machinery that no longer feeds a metric, with its tests.
- [ ] Keep the permanent guard test that unilateral motion must not read as symmetric (the common-mode-subtraction trap).
- [ ] Docs: §7 states plainly which path produces SI (blendshape) and which produces geometry (calibration/drift only), so no future reader re-wires them.

---

## Phase 4 — Phase 8 repairs (data, trends, demo, privacy)

From `REMEDIATION_PLAN_2026-07-12.md` §13. Task 8.1 (baseline-paired noise) and 8.2 (trend aggregation) are already satisfied by `TrendsService`; verify rather than rebuild.

### Task 4.1 — Verify 8.1/8.2 and close the gaps
- [ ] Confirm historical trends can never use another baseline's noise floor (test exists — re-assert after any merge).
- [ ] Document the aggregation rules `TrendsService` actually implements: null exclusion, session weighting, minimum samples, **UTC period boundaries**, first-point behavior, partial-session treatment. Any rule not in a doc is drift.

### Task 4.2 — 8.3 Adherence honesty
- [ ] `completionRate` is defined only over user-started sessions; either document that precisely or rename the field. **Never invent a planned-session schedule** — the app does not prescribe dosing.
- [ ] Audit all adherence copy in `strings.ts` for guilt/pressure language (SAFETY §8).

### Task 4.3 — 8.4 Demo Mode isolation
- [ ] Demo must not *read* sensitive data, not merely not write it. Audit every read path reachable in demo (§17 gate matrix) and restrict to non-sensitive config.
- [ ] Test on a DB seeded with real history: prove no sensitive value appears in UI, events, or exports; verify zero writes and reload-exit.
- [ ] Resolve the `StorageService ↔ SafetyGate` module cycle (currently a documented lazy-reference cycle) with the smallest internal state boundary.

### Task 4.4 — 8.5 Single-profile invariant + deletion
- [ ] Define and test transactional behavior for a second profile (replace or reject — pick one, document it).
- [ ] Test `deleteAllData` with open connections and a simulated mid-transaction failure; keep the typed confirmation and the blocking-state recovery path.

---

## Phase 5 — Hardening for real hardware (IMPLEMENTATION Task 17 backend half)

### Task 5.1 — Hot-path performance
- [ ] `quality.ts` currently does per-frame canvas work for face-region luma (deferred during remediation). Measure it on the target device; if it costs frame budget, downsample less often or reuse one canvas/ImageData allocation. Do not change gate semantics — only cost.
- [ ] Verify capture→metric latency budget (≤100 ms to first paint) with the DebugHud on real hardware.

### Task 5.2 — Device/browser gates
- [ ] Run the fixture replay suite on Firefox (hard gate, CLAUDE.md verified-fact 5) and on the target mobile browser; record results as evidence.
- [ ] Confirm the telemetry-verification release blocker: prove the pinned MediaPipe package makes zero network requests at runtime (ARCHITECTURE §6).

---

## Phase 6 — V2 evidence (data-gated, runs in parallel)

- [ ] Execute `docs/superpowers/plans/2026-07-20-v2-palsy-dataset-gate.md` as soon as MEEI access lands. Bars are already frozen there; do not restate or adjust them.
- [ ] PASS → the canonical-face-prior risk in `MODEL_AND_DATA.md` §2 moves from "documented risk" to "validated at V2, n=…". FAIL → activate the §2 fallback ladder and drop longitudinal-trend claims until a fallback passes.

---

## Definition of backend-done

1. V1 kill-gate **PASSED**; ledger shows Tasks 6–11, 14–15 backend halves **ACCEPTED**, not provisional.
2. One measurement path produces SI; the geometry path is scoped to calibration/drift and documented as such.
3. Phase 8 repairs closed: baseline-paired noise, documented aggregation, honest adherence, demo reads isolated, single-profile invariant enforced.
4. All gates green on `main`: `npm run typecheck`, `npx vitest run`, `npm run build`, `check-docs`, no-network e2e; metrics/reps hold 100% branch coverage.
5. Every open decision recorded in a doc, not in a comment or a plan: EX_PUCKER, adherence semantics, second-profile behavior.
6. V2 either passed or explicitly pending with the request submitted — stated honestly in `IMPLEMENTATION.md`, never implied as done.

## Out of scope

Screens/routing/FeedbackRenderer (`2026-07-20-frontend-integration.md`); V3/V4 battery; clinical/regulatory review; any efficacy claim; model training (this project trains none).
