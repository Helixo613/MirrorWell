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
