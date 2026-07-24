# Candidate-3 geometry: face-local-vector-v2 (same-side planar anchors)

> **For agentic workers:** execute task-by-task with TDD: failing test first, verify failure, minimal fix, verify pass, commit. Run shell via `rtk`. This plan is self-contained; other required reading: `docs/ARCHITECTURE.md` §7/§12, `docs/MODEL_AND_DATA.md` §7, `CLAUDE.md` (repo root).

**Status: stop-rule slot 3 of 3.** Candidates `scalar-radial` (B2 = 31.1%) and `face-local-vector-v1` (B3 = 0.63–0.88 vs 0.05 bar) are rejected with preserved evidence. If this candidate FAILS the V1 gate, no further geometry tweaks; the measurement approach itself goes back to research (REMEDIATION_PLAN §12 stop rule).

## Diagnosis being fixed (evidence)

`face-local-vector-v1` fails B3: symmetryIndex collapses 0.92 → 0.00 at 10° yaw (100% of yaw-phase frames, both directions, both trials; live harness JSON 2026-07-19 and fixture report `v1_S01_face-local-vector-v1_report.json` agree).

Mechanism: `REGION_MOUTH_CORNER` and `REGION_LIP` anchor to the **nose tip (mesh 1)**, which sits ~0.03 m off the face plane. Under yaw θ its projection shifts laterally ≈ depth·sin θ ≈ 0.08 IOD at 10°, same order as the smile signal, and enters both sides' `f` vectors with the **same u sign** (common-mode). After the mirror step `ΔR̃ = (−ΔR.u, ΔR.v)` the sides point opposite → cos θ < 0 → SI clamps to 0. Near/far-side magnitude asymmetry (observed ~2×) comes from the same term.

**Rejected alternative (do NOT implement):** subtracting the u common-mode `(ΔL.u + ΔR.u)/2`. It maps unilateral motion (the clinical target) to SI ≈ 1. Task C1's unilateral regression test exists to block this class of fix permanently.

## The change

Anchors only. Movers, mirror step, SI formula, movement floor, smoothing, thresholds: unchanged.

| Region | Mover (L/R) | Anchor v1 (rejected) | Anchor v2 (this plan) |
|---|---|---|---|
| REGION_BROW | 334 / 105 | same-side eye center | unchanged |
| REGION_EYELID | 386−374 / 159−145 gap | same-side lower lid | unchanged |
| REGION_MOUTH_CORNER | 291 / 61 | nose tip 1 (both) | **same-side eye center** |
| REGION_LIP | 308 / 78 | nose tip 1 (both) | **same-side eye center** |

Eye centers (already computed in the kernel): left = midpoint(263, 362); right = midpoint(33, 133). Eye centers are on the face plane and expression-static → the depth-projection artifact vanishes to first order; residual is near/far perspective scaling (~5% magnitude at 10°/0.5 m), which degrades the SI ratio slightly instead of zeroing cos θ.

Known accepted risk: eye-to-mouth lever arm (~1 IOD) makes cross-clip pitch drift a larger v-offset than the nose anchor had. Pitch is gated at ±15° and B2 measures the consequence; the fixtures decide.

Candidate id: `face-local-vector-v2`. Report file: `v1_S01_face-local-vector-v2_report.json` (runner `--candidate face-local-vector-v2`; must never overwrite the v1 report).

## Task C0: preserve candidate-2 rejection evidence

**Files:** `tests/analysis/rejected/` (exists), `docs/IMPLEMENTATION.md` (ledger)
- [ ] Copy `tests/analysis/v1_S01_face-local-vector-v1_report.json` → `tests/analysis/rejected/v1_S01_report_face-local-vector-v1_FAILED.json`.
- [ ] Append to `tests/analysis/rejected/README.md`: candidate `face-local-vector-v1`, rejected 2026-07-19 on B3 (aggregate yaw_left 0.878 / yaw_right 0.757 vs bar 0.05; B1a/B1b PASS; B2 confounded by 36% cross-trial smile repro), mechanism = nose-anchor depth projection, git SHA of the report.
- [ ] IMPLEMENTATION.md ledger: Task 6 stays BLOCKED; note "candidate 2 rejected (B3); candidate 3 face-local-vector-v2 in progress; stop-rule slot 3/3".
- [ ] Commit: `docs: preserve face-local-vector-v1 rejection evidence (B3 fail)`

## Task C1: kernel change with TDD

**Files:** `src/metrics/geometry.ts`, `tests/unit/geometry.test.ts`, `src/config/exercises.ts` (comments), `docs/ARCHITECTURE.md` §7 (anchor table)

Failing tests first (add to `tests/unit/geometry.test.ts`; use its existing synthetic-frame builder):
- [ ] **(7) yaw-artifact regression:** build a neutral frame, then a frame identical except nose tip (index 1) shifted by +0.05 in normalized x (simulating yaw depth projection; eyes, mouth corners, brows, lids untouched). Assert `REGION_MOUTH_CORNER` and `REGION_LIP` features of both frames are equal to 10 digits (v1 kernel fails this: both sides' u shift by −0.05·(W/iod)-scaled amount).
- [ ] **(8) unilateral preservation:** from neutral, move ONLY the left mouth corner (291) outward+up; compute displacement vs neutral via the kernel and apply the documented SI formula (mirror, floor, cos clamp; copy the math from `src/metrics/metrics.ts` rawSymmetryAndEffort into the test): assert SI = 0. This test permanently blocks common-mode-subtraction fixes.
- [ ] Verify both fail against the unfixed kernel for the intended reason before touching `geometry.ts`.

Implementation:
- [ ] `geometry.ts`: `REGION_MOUTH_CORNER` and `REGION_LIP` anchor from `nose` → `eyeCenterL`/`eyeCenterR` (same-side). Update the header comment block and region comments. `NOSE_TIP` constant may go unused → delete it and its comment.
- [ ] Existing property tests (aspect/scale/roll/sign/topology) must still pass unchanged; the smile sign test (mouth-corner u moves outward) holds with eye-center anchors.
- [ ] `exercises.ts`: update the geometry-contract comments (lines describing REGION_MOUTH_CORNER / REGION_LIP anchors). `landmarkIndices` arrays unchanged (scalar-ref slots are not read by geometry).
- [ ] ARCHITECTURE §7: anchor table rows for MOUTH_CORNER and LIP → "same-side eye centers mid(263,362) / mid(33,133)"; delete "anchor nose tip 1".
- [ ] `rtk npx vitest run tests/unit/geometry.test.ts tests/unit/normalize.test.ts tests/unit/metrics.test.ts` green; then full `rtk npx vitest run` green.
- [ ] Commit with `DOCS-CHANGE: ARCHITECTURE.md §7. MOUTH_CORNER/LIP anchors nose→same-side eye centers (candidate face-local-vector-v2, B3 fix)`

## Task C2: sampler mirror + gate rerun

**Files:** `tests/analysis/v1-runner.html` (measurement core `measureAbsolutePx`)
- [ ] Mirror the same anchor change in `measureAbsolutePx` (REGION_MOUTH_CORNER/REGION_LIP: `nose` → `eyeCenterL`/`eyeCenterR`). The sampler must stay a verbatim port of `geometry.ts`, diff the two by eye after editing.
- [ ] Rerun: `rtk node scripts/run-v1.mjs --subject S01 --candidate face-local-vector-v2 --sample` (existing 12 fixtures in `tests/fixtures/masters/`; no re-recording).
- [ ] Sanity expectations before reading bars: yaw phases still measure ~9–13° mean |yaw| (pose code untouched); B1a/B1b same order as v1 run (~0.002/0.005).
- [ ] Commit runner change + report: `feat: candidate-3 face-local-vector-v2 sampler + V1 gate run`

## Verdict handling (predeclared)

- **PASS:** Task 6 → ACCEPTED in the IMPLEMENTATION.md ledger with the v2 report as evidence; Tasks 7–8 lose provisional status after their tests rerun green.
- **FAIL on B3 only:** stop rule triggered; no candidate 4. Report to user; geometry approach returns to research.
- **B3 passes, B2 fails, cross-trial frontal smile repro > 5%:** `PROTOCOL_LIMITED`; re-record the 6 smile-family clips (smile, low_light, distance_2m × 2 trials) with the harness displacement readout used to match smile intensity across takes, then rerun. Yaw/neutral clips are kept.
- Never tune any threshold in response to these results.

## Out of scope

Screens/Tasks 9+ (separate demo-track plan), Phase 8 repairs, MetricEngine/RepDetector changes, threshold changes, protocol changes.
