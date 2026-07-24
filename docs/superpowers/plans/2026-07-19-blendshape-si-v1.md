# blendshape-si-v1: symmetry/effort from MediaPipe blendshapes

> **For agentic workers:** execute task-by-task with TDD (failing test → verify failure → minimal fix → verify pass → commit, shell via `rtk`). Self-contained; other required reading: `docs/ARCHITECTURE.md` §12/§13, `docs/API.md`, `docs/MODEL_AND_DATA.md` §7, repo `CLAUDE.md`.

## Why (evidence, 2026-07-19)

The 2D-projection geometry family is exhausted (stop rule 3/3): `scalar-radial` (B2 31%), `face-local-vector-v1` (B3 0.88: nose-anchor depth artifact), `face-local-vector-v2` (B3 0.09–0.69: perspective residual). All preserved in `tests/analysis/rejected/`.

Blendshape probes on the same 12 fixtures (`tests/analysis/blendshape-probe.mjs`, `blendshape_probe_S01.json`, `blendshape-smirk-probe.mjs`):

- SI := min/max of `mouthSmileLeft/Right` scores. B1a analog 0.0000; B1b 0.0007/0.0013; **B3 0.006/0.010/0.007 with one cell 0.051**; B2 dim 0.048/0.030 pass; B2 2m fails only on the known-bad trial-1 clip (smile intensity repro, human).
- **Sensitivity (clinical must-have):** deliberate smirks read SI 0.43 and 0.72 vs 0.99 symmetric; the model separates sides, graded, correct dominant side. No symmetrization.

This plan promotes the modality to formal candidate `blendshape-si-v1`, new measurement family, candidate 1 (geometry stop rule does not carry over). Known documented risks: blendshape behavior on genuine palsy faces is unvalidated until V2 fixtures (MODEL_AND_DATA §4); coefficients are model-inferred, less interpretable than geometry.

## Design decisions (fixed for this plan)

1. **Additive, not destructive.** Blendshapes flow through the pipeline alongside the existing geometry path. Geometry kernel, NormalizationLayer, and their tests stay untouched and green. Removal/consolidation is a separate plan AFTER the candidate is accepted; never rip out the validated fallback first.
2. **SI** (per exercise with a per-side pair): `L = blendshapes[pair.left]`, `R = blendshapes[pair.right]`; `act = max(L,R)`; if `act < thresholds.blendshapes.activationFloor` → SI `null`; else `SI = min(L,R)/max(L,R)`. Trailing 5-frame median smoothing and `gapResetMs` semantics identical to today (reuse the existing window code in `metrics.ts`).
3. **effortIndex** = `act / comfortableMax[exerciseId]`, where `comfortableMax` is redefined as the median per-rep peak **activation** (0..1 score units, was IOD units). Pre-release reset applies (DG-5): schema v1 amended in place, dev DBs reseeded. RepDetector thresholds are ratios of effortIndex, unchanged.
4. **Exercise → blendshape pairs** (`src/config/exercises.ts`, new field `blendshapePair`):
   - `EX_SMILE`: `mouthSmileLeft` / `mouthSmileRight` (probe-validated)
   - `EX_BROW_RAISE`: `browOuterUpLeft` / `browOuterUpRight` (provisional, validated only at V2)
   - `EX_EYE_CLOSURE`: `eyeBlinkLeft` / `eyeBlinkRight` (provisional)
   - `EX_PUCKER`: **OPEN DECISION; do not invent.** `mouthPucker` has no per-side pair. Options (mentor/user must pick before any Task 9+ work uses EX_PUCKER): (a) `mouthStretchLeft/Right` proxy, (b) keep geometry-SI for this exercise only, (c) drop EX_PUCKER from v1 scope. Until decided, `blendshapePair` for EX_PUCKER is absent and `MetricEngine` must throw `VALIDATION_FAILED` for it; a loud stop, not a silent fallback.
5. **V1 acceptance requires EX_SMILE only** (the protocol is smile-based). Bars keep their numeric values; B1a's displacement measure for this candidate is activation std in score units (predeclared here, before the formal run).

## Task D0: commit probe evidence

- [ ] `git add tests/analysis/blendshape-probe.mjs tests/analysis/blendshape-smirk-probe.mjs tests/analysis/blendshape_probe_S01.json tests/analysis/v1-runner.html docs/superpowers/plans/2026-07-19-blendshape-si-v1.md` (sampler change = blendshape emission) → commit `research: blendshape SI probes clear B1/B3 + sensitivity on S01 fixtures`.

## Task D1: docs amendments (before code)

**Files:** `docs/ARCHITECTURE.md` §12+§13, `docs/API.md` §5/§8/§15, `docs/DATABASE.md` §2, `docs/BACKEND.md` §1.2/§1.5, `docs/MODEL_AND_DATA.md` §7
- [ ] §13 `LandmarkFrame` gains `blendshapes: Record<string, number>` (empty object when the model returns none). §12 glossary: note field + `blendshapePair` + `activationFloor` + candidate `blendshape-si-v1`.
- [ ] API §5 (LandmarkEngine): `outputFaceBlendshapes: true`; §8 (MetricEngine): SI/effort formulas per Design 2–3; §15: `exercises[].blendshapePair` shape + `thresholds.blendshapes.activationFloor: 0.05` (initial, probe-derived).
- [ ] DATABASE §2: `comfortableMax` semantics → activation units (0..1), pre-release reset note.
- [ ] MODEL_AND_DATA §7: candidate `blendshape-si-v1` registered (new family, slot 1); B1a unit note; EX_PUCKER open decision recorded.
- [ ] `rtk node scripts/check-docs.mjs` green. Commit with one `DOCS-CHANGE:` line per doc.

## Task D2: LandmarkEngine + LandmarkFrame (TDD)

**Files:** `src/sensing/landmarks.ts`, `tests/unit/landmarks.test.ts`
- [ ] Failing test: `detect` result carries `blendshapes` mapping `categoryName → score` from `result.faceBlendshapes[0].categories`; empty object when absent; existing tests untouched.
- [ ] Implement: add `outputFaceBlendshapes: true` to both delegate option objects; populate the field. Commit.

## Task D3: config + thresholds (TDD)

**Files:** `src/config/exercises.ts`, `src/config/thresholds.ts`, `tests/unit/thresholds.keys.test.ts` (+ exercises test if present)
- [ ] Failing tests: `thresholds.blendshapes.activationFloor === 0.05`; `exercises.EX_SMILE.blendshapePair` = smile pair; EX_BROW_RAISE/EX_EYE_CLOSURE pairs present; EX_PUCKER has **no** `blendshapePair`.
- [ ] Implement. Commit.

## Task D4: MetricEngine blendshape SI/effort (TDD, keep 100% branch coverage)

**Files:** `src/metrics/metrics.ts`, `src/metrics/normalize.ts` (passthrough only), `tests/unit/metrics.test.ts`, `tests/unit/normalize.test.ts`
- [ ] `NormalizedFrame` gains `blendshapes` passthrough (`af.lf.blendshapes`, §13 already amended). Failing test in normalize.test.ts.
- [ ] Failing tests (metrics): symmetric pair (0.6, 0.6) → SI 1; smirk pair (0.29, 0.67) → SI ≈ 0.433; below `activationFloor` → SI null; EX_PUCKER → throws `VALIDATION_FAILED`; effortIndex = act/comfortableMax with NO_BASELINE guard intact (comfortableMax ≤ 0 or missing → throw, regression from 891814e); smoothing window + gapResetMs behavior identical (reuse existing tests' structure); ease-off boundary unchanged.
- [ ] Implement: `compute()` reads the pair via `exercises[exerciseId].blendshapePair`; geometry displacement path in `rawSymmetryAndEffort` is REPLACED as the SI/effort source for exercises with a pair (geometry modules themselves untouched and still tested). `rtk npx vitest run --coverage tests/unit/metrics.test.ts tests/unit/reps.test.ts` → 100% branch. Commit.

## Task D5: gate wiring for the candidate

**Files:** `scripts/run-v1.mjs` (derive path), `scripts/v1-protocol.mjs` (only if candidate id plumbing requires), sampler already emits blendshapes
- [ ] `deriveTrialFrames` gains a blendshape mode (used when `--candidate blendshape-si-v1`): `maxDisp := act`, `symmetryIndex := floor/ratio + trailing median` per Design 2: no neutral baseline needed (activation is absolute). Neutral phase frames still feed B1a (std of act).
- [ ] Dry-check on existing fixtures: `rtk node scripts/run-v1.mjs --subject S01 --candidate blendshape-si-v1 --sample` runs end-to-end and reproduces the probe numbers (B3 cells ≈ 0.006–0.051). Report file `v1_S01_blendshape-si-v1_report.json`; never overwrites other candidates. Commit.

## Task D6: formal protocol run (user in the loop)

- [ ] User re-records the weak trial-1 smile-family clips with the harness (displacement/SI readout open, matching smile intensity): `fixture_S01_smile_1.webm`, `fixture_S01_low_light_1.webm`, `fixture_S01_distance_2m_1.webm`. Neutral + yaw clips are kept.
- [ ] `bash scripts/convert-fixtures.sh` → `rtk node scripts/run-v1.mjs --subject S01 --candidate blendshape-si-v1 --sample`.
- [ ] **PASS:** IMPLEMENTATION.md ledger Task 6 → ACCEPTED (evidence: the v2 report + smirk sensitivity probe); Tasks 7–8 rerun their suites and drop PROVISIONAL. Commit `docs: Task 6 accepted, blendshape-si-v1 passes V1`.
- [ ] **FAIL:** preserve to `rejected/`, report to user, stop (family slot 2 requires a new explicit decision).
- [ ] **PROTOCOL_LIMITED:** one more smile-family re-record attempt, then stop and report.

## Out of scope

Frontend/screens (user directive: backend only); geometry-path removal (separate consolidation plan after acceptance); EX_PUCKER mapping decision; V2 palsy-fixture validation; fairness thresholds (unchanged).
