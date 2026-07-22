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

---

## S1-NOTE-1 → S2 and S3 (rebase instruction, no action needed from the integration owner)

S1 merges first, so the shared e2e/test infra that S2 and S3 each wrote independently lands here as
the **canonical** copy. On rebase, S2 and S3 drop their own copies of:

- `tests/e2e/helpers/onboarding.ts` — adopted verbatim from `origin/frontend-s2-shell`.
- `tests/e2e/helpers/seed.ts` — adopted verbatim from `origin/frontend-s3-data`.
- `vitest.config.ts` `@` → `src/` alias (S3-REQ-1) — adopted verbatim from `origin/frontend-s3-data`.

No behavioural change to any of the three; the files are byte-identical to the branch they came from.

## S1-REQ-1 → integration owner (`playwright.config.ts`) — fake-camera Playwright project

**Origin:** Tasks 10–11 (`CalibrationScreen`, `SessionScreen`), Stream S1.

**Change (already applied on `frontend-s1-session`, flagged here per ownership rule 1):** split
`playwright.config.ts` into two projects. `default` runs everything outside `tests/e2e/camera/**`
with an unmodified browser (the no-network and shell-smoke gates keep the exact launch conditions
they had). `camera` runs `tests/e2e/camera/**` with
`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream
--autoplay-policy=no-user-gesture-required`.

**Why:** the two camera screens are unreachable without a `getUserMedia` stream, and granting the
fake device globally would change the browser the other streams' specs run in. No
`--use-file-for-fake-video-capture`: the synthetic pattern carries no face, which is precisely the
`FACE_LOST` / frozen-bar surface these per-screen specs assert. Fixture replay
(`tests/fixtures/replay/*.mjpeg`; Chromium accepts only `.y4m`/`.mjpeg`, CLAUDE.md fact 3) belongs
to the Reconvergence journeys (TESTS.md §5), not to per-screen specs.

**Update:** the `camera` project also carries `workers: 1`. Each camera spec runs MediaPipe WASM
inference (10.6 MB runtime) over the fake device and waits real 3 s `captureFor` windows; parallel
workers starve each other on CPU and manufacture timeouts that read as flakes. The `default` project
keeps `fullyParallel`. Reconvergence may raise the camera worker count once fixtures pin the timing.

## S1-CLOSES-S3-REQ-4 → `strings.errors` — `NO_BASELINE` copy added

S3 filed "no `NO_BASELINE` copy, so an attested-but-uncalibrated user sees generic
'check your input'". `strings.errors.NO_BASELINE` and `strings.errors.RECALIBRATION_REQUIRED` are
added on this branch (API §16: both route to `CalibrationScreen`). `useExportScreen` can branch on
the code once S3 rebases. Closed.

## S1-REQ-2 → integration owner (frozen shell) (`src/App.tsx`, `src/router/RouteGuard.tsx`, `src/session/safety.ts`) — the DEMO exit path is unreachable

**Origin:** Task 12 (`SummaryScreen`), Stream S1. Found empirically, not by reading — the demo
Done button was probed in the production build and lands on `/home`.

**Observation.** FRONTEND §2.5 and §1 both say the DEMO `SummaryScreen` "ends at
`OnboardingScreen`", and API §17's gate matrix lists `OnboardingScreen` as **✅ in DEMO
("exits demo")**. The shipped shell contradicts both: `/onboarding` is wrapped in
`GateRoute allowed={['UNATTESTED']}` (`src/App.tsx`), so a DEMO user is bounced to `/`, and
`RootRedirect` (`src/router/RouteGuard.tsx`) sends DEMO → `/session`, ATTESTED → `/home`. Nothing
on that path clears `SafetyGate`'s in-memory `demoMode` either — `src/session/safety.ts` exposes no
exit; only `recordAttestation` resets it. Net effect: **demo is a one-way door until reload**, and
the documented demo close-out silently lands somewhere else.

**Requested change (two parts, both outside S1's globs):**
1. `src/App.tsx` — `/onboarding` should admit `['UNATTESTED', 'DEMO']`, matching API §17.
2. `src/session/safety.ts` — an explicit way to leave demo when `OnboardingScreen` is entered from
   a demo close-out. API §2 documents only `enterDemoMode`/`isDemoMode`, so **either** add
   `SafetyGate.exitDemoMode()` with a `DOCS-CHANGE: API §2 — …` line and amend ARCH §12, **or**
   have `OnboardingScreen` mount clear it. Adding it inside a screen stream would invent API
   surface unilaterally, so it is filed rather than done.

**Why it matters beyond Summary.** ARCH §11 makes demo's exit a safety property ("page reload exits
completely"), and the demo `SessionScreen` → `SummaryScreen` → `OnboardingScreen` loop is the entire
evaluator journey (FRONTEND §1). S1's specs assert only "left `/summary`" so they stay green both
before and after the fix; a spec that pinned the destination would have to encode the bug.

<!-- Append requests below. Template:

## S1-REQ-N → <owner or "integration owner (frozen shell)"> (`<path>`) — <one-line summary>

**Origin:** <plan task / screen>.

**Requested change:** <exact change>.

**Why:** <reason, citing the contract/doc §>.
-->
