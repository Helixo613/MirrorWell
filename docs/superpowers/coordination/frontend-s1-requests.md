# Frontend Stream S1 — outgoing requests

Stream S1 (`src/screens/{calibration,session,summary}/**` incl. `FeedbackRenderer`, rep counter, rest
timer, demo quick-setup overlay; `strings.{calibration,session,summary}`; and the Gate 0 bootstrap)
files requests here for changes it needs in files it does not own. Per
`docs/superpowers/plans/2026-07-21-full-app-completion-parallel.md` ownership rule 1, S1 never edits
another stream's file, nor the frozen shell (`App.tsx`, `src/router/**`, `src/context/**`,
`src/components/ui/**`) after Gate 0. Each entry states the target owner, the exact change, and why it
is needed. One file per stream = never conflicts.

---

## Gate 0 handoff to S1 (what you inherit)

- Routes `/calibration`, `/session`, `/summary` are registered and compile.
- **`SummaryScreen`** carries its full salvage body, rewired to main's contracts
  (`SessionRecordFull`/`ExerciseResultFull` from `@/data/storage`, `exercises` config). Finish
  per FRONTEND §2.5 + TESTS.md; do not rebuild.
- **`CalibrationScreen`** and **`SessionScreen`** are routed `PlaceholderScreen` stubs. Rebuild
  against main's real surfaces:
  - `SessionController` (`@/session/controller`): `start(exerciseIds)`, `advance()`,
    `extendRest(s)`, `stop(reason)`, `on(event, cb)` — 7 events incl. `qualityOfferStop {visible}`.
    There is no `getRepProgress`/`getRestEndsAt`/`runDemoQuickSetup`/`isRunning`/`repDiscarded`;
    derive rep/rest UI from the event stream (rep discard is silent — no event exists).
  - `CalibrationFlow` (`@/session/calibration`): `captureNeutral()`, `captureComfortableMax(id)`,
    `runNoiseFloorSelfTest()`, `checkBaselineDrift()`.
  - Camera: wire `CaptureService` (`@/sensing/capture`) + `detectForVideo(videoEl)` directly
    (verified fact 4); the old `useCameraPipeline` helper was deleted.
  - Reference (do not restore verbatim): `origin/sai-shanmukh-progress:src/screens/{Calibration,Session}Screen.tsx`,
    `:src/hooks/{useSessionScreen,useCameraPipeline}.ts`, `:src/screens/calibration/useCalibrationFlow.ts`.
  - Presentational components under `src/components/{session,calibration,camera}/**` survived intact.
- **Demo quick-setup is mandatory** (plan "Demo-mode quick-setup contract"): the inline overlay MUST
  call `NormalizationLayer.setBaseline` AND `MetricEngine.setBaseline` before the first REPS frame or
  `compute()` throws `NO_BASELINE` → the loop reports `FACE_LOST` (a demo that detects nothing).
- Camera rule: the stream may be open only while Calibration/Session is mounted; release on unmount.

<!-- Append requests below. Template:

## S1-REQ-N → <owner or "integration owner (frozen shell)"> (`<path>`) — <one-line summary>

**Origin:** <plan task / screen>.

**Requested change:** <exact change>.

**Why:** <reason, citing the contract/doc §>.
-->
