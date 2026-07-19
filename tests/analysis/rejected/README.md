# Rejected V1 metric candidates

This directory preserves failing V1 harness evidence so rejected metric candidates remain auditable after the next iteration.

## Scalar radial distance (FAILED)

| Field | Value |
| --- | --- |
| **Candidate** | scalar radial distance |
| **Source report** | `v1_S01_report_scalar-radial_FAILED.json` (copy of `tests/analysis/v1_S01_report.json`) |
| **Subject** | S01 |
| **Report `generatedAt`** | 2026-07-10T13:39:58.235Z |
| **Overall result** | `overallPass: false` |
| **B2 maxRelativeDeviation** | 0.3110947104000187 → **31.1%** (pass bar: **5%**) |
| **B3** | no valid yaw samples (`meanSiYaw` null; `okFrames` 0 for yaw — `POSE_OUT_OF_RANGE`) |
| **Evidence preserved at** | 2026-07-12 |
| **Git SHA at freeze** | `527fa16a25027be2fb1264929c7bc70ae21c369d` (`git rev-parse HEAD` at freeze; not necessarily the exact SHA of the original failing run) |

### Why rejected

- **B2 (distance invariance):** relative deviation far above the 5% bar (31.1%).
- **B3 (yaw invariance):** no valid yaw samples under quality gates, so the bar could not be evaluated as a pass.

## face-local-vector-v1 (FAILED)

| Field | Value |
| --- | --- |
| **Candidate** | `face-local-vector-v1` (face-local 2D vector kernel, nose-tip anchors for mouth/lip) |
| **Source report** | `v1_S01_report_face-local-vector-v1_FAILED.json` (copy of `tests/analysis/v1_S01_face-local-vector-v1_report.json`) |
| **Subject** | S01 (12-cell protocol grid, 2 trials × 6 phases, webcam masters 2026-07-19) |
| **Overall result** | `verdict: FAIL` (`overallPass: false`, `protocolLimited: false`) |
| **B1a / B1b** | PASS (0.0021/0.0015 vs 0.01; 0.0054/0.0020 vs 0.05) |
| **B2** | FAIL but confounded: cross-trial frontal-smile mean displacement differs ~36% (0.120 vs 0.173) — human reproduction, not attributable to the candidate |
| **B3 (decisive)** | **FAIL: aggregate yaw_left 0.878, yaw_right 0.757 vs bar 0.05** — SI collapses to ~0 at measured 9–13° yaw, both trials, both directions |
| **Evidence preserved at** | 2026-07-19 |
| **Git SHA at freeze** | `f14f0027643c9d4e1a9ad52ea11716de924806c5` |

### Why rejected

- **B3 (yaw invariance):** the shared nose-tip anchor sits ~0.03 m off the face plane; under yaw its projection shifts by ≈ depth·sin(yaw) ≈ 0.08 IOD at 10° — same order as the smile signal — entering both sides' feature vectors with the same u sign. After the mirror step the sides point opposite → cos θ ≤ 0 → SI clamps to 0 on 100% of yaw-phase frames (live harness JSON and fixture report agree).
- Successor hypothesis (stop-rule slot 3/3): `face-local-vector-v2` — re-anchor REGION_MOUTH_CORNER/REGION_LIP to same-side eye centers (planar, expression-static). Plan: `docs/superpowers/plans/2026-07-19-candidate3-geometry-v2.md`.

## blendshape-si-v1 — run 2 (fresh trials, 2026-07-19) — FAIL
- Fixtures: fresh full 2-trial sitting (harness trials 3/4, promoted to 1/2; prior clips in masters/retired-20260719/).
- Trial 1: B2 dim 0.580, B2 2m 0.804, B3 L 0.257, B3 R 0.201 — smile activation collapsed across phases (frontal 0.655 → dim 0.275 → 2m 0.128).
- Trial 2: B2 2m 0.146 (act 0.79→0.675), B3 L 0.068 (SI 0.915 vs 0.983); dim and yaw_right passed.
- All phase-validity cells valid (OK% ≥97, yaw 9.6–10.1° in band). Failure tracks smile-intensity repro (uncontrolled variable), not measurement noise: prior sitting with held intensity (run 1 trial 2: act 0.907/0.880/0.874) passed every bar.
- Report: v1_S01_blendshape-si-v1_run2_FAILED.json. gitSha bf5dbba.
