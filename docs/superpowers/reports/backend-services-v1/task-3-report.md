# Task 3: CalibrationFlow report

Status: DONE

## Files touched

- `src/session/calibration.ts`
- `tests/unit/calibration.test.ts`
- `task-3-report.md`

## Design choices

- Capture windows are frame-timestamp-driven; no wall-clock timers are used.
- `FrameSource` subscribes to CaptureService and converts production frames through LandmarkEngine.
- Noise-floor SI reuses NormalizationLayer and MetricEngine.

## Review fixes

- Comfortable max is the median of three per-window activation peaks, not a median over raw frames.
- The actual neutral-capture `QUALITY_OK / total` fraction is retained and persisted as `CalibrationBaseline.qualityScore`.
- Regressions cover per-rep peaks, both drift outcomes, alternating SI noise, and persisted quality-score fidelity.

## Validation

- `npx vitest run tests/unit/calibration.test.ts`, 11 passed
- `npx vitest run`, 15 files, 158 tests passed
- `npx tsc --noEmit`; no errors

No git commit was made.


---
**CORRECTION (2026-07-20, controller):** every `tsc --noEmit` result recorded in this report is VOID. The root `tsconfig.json` is a solution-style config (`"files": []` + project references), so `npx tsc --noEmit` type-checks an empty file set and always reports success. The real gate is `npm run typecheck` (`tsc -b`). Re-verified after commit f046bee: `tsc -b` clean and `npm run build` green across the whole branch, so this task compiles; but the original claim was not evidence for that.
