# Frontend Stream S1: outgoing requests

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
    `extendRest(s)`, `stop(reason)`, `on(event, cb)`; 7 events incl. `qualityOfferStop {visible}`.
    There is no `getRepProgress`/`getRestEndsAt`/`runDemoQuickSetup`/`isRunning`/`repDiscarded`;
    derive rep/rest UI from the event stream (rep discard is silent; no event exists).
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

- `tests/e2e/helpers/onboarding.ts`, adopted verbatim from `origin/frontend-s2-shell`.
- `tests/e2e/helpers/seed.ts`, adopted verbatim from `origin/frontend-s3-data`.
- `vitest.config.ts` `@` → `src/` alias (S3-REQ-1), adopted verbatim from `origin/frontend-s3-data`.

No behavioural change to any of the three; the files are byte-identical to the branch they came from.

## S1-REQ-1 → integration owner (`playwright.config.ts`): fake-camera Playwright project

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

## S1-CLOSES-S3-REQ-4 → `strings.errors`: `NO_BASELINE` copy added

S3 filed "no `NO_BASELINE` copy, so an attested-but-uncalibrated user sees generic
'check your input'". `strings.errors.NO_BASELINE` and `strings.errors.RECALIBRATION_REQUIRED` are
added on this branch (API §16: both route to `CalibrationScreen`). `useExportScreen` can branch on
the code once S3 rebases. Closed.

## S1-REQ-2 → integration owner (frozen shell) (`src/App.tsx`, `src/router/RouteGuard.tsx`, `src/session/safety.ts`): the DEMO exit path is unreachable

**Origin:** Task 12 (`SummaryScreen`), Stream S1. Found empirically, not by reading; the demo
Done button was probed in the production build and lands on `/home`.

**Observation.** FRONTEND §2.5 and §1 both say the DEMO `SummaryScreen` "ends at
`OnboardingScreen`", and API §17's gate matrix lists `OnboardingScreen` as **✅ in DEMO
("exits demo")**. The shipped shell contradicts both: `/onboarding` is wrapped in
`GateRoute allowed={['UNATTESTED']}` (`src/App.tsx`), so a DEMO user is bounced to `/`, and
`RootRedirect` (`src/router/RouteGuard.tsx`) sends DEMO → `/session`, ATTESTED → `/home`. Nothing
on that path clears `SafetyGate`'s in-memory `demoMode` either, `src/session/safety.ts` exposes no
exit; only `recordAttestation` resets it. Net effect: **demo is a one-way door until reload**, and
the documented demo close-out silently lands somewhere else.

**Requested change (two parts, both outside S1's globs):**
1. `src/App.tsx`, `/onboarding` should admit `['UNATTESTED', 'DEMO']`, matching API §17.
2. `src/session/safety.ts`; an explicit way to leave demo when `OnboardingScreen` is entered from
   a demo close-out. API §2 documents only `enterDemoMode`/`isDemoMode`, so **either** add
   `SafetyGate.exitDemoMode()` with a `DOCS-CHANGE: API §2. …` line and amend ARCH §12, **or**
   have `OnboardingScreen` mount clear it. Adding it inside a screen stream would invent API
   surface unilaterally, so it is filed rather than done.

**Why it matters beyond Summary.** ARCH §11 makes demo's exit a safety property ("page reload exits
completely"), and the demo `SessionScreen` → `SummaryScreen` → `OnboardingScreen` loop is the entire
evaluator journey (FRONTEND §1). S1's specs assert only "left `/summary`" so they stay green both
before and after the fix; a spec that pinned the destination would have to encode the bug.

**CLOSED (Reconvergence, `fix/reconvergence-shell`).** Both halves fixed. (1) `/onboarding` now
admits `['UNATTESTED','DEMO']`. (2) `SafetyGate.exitDemoMode()` was added and is called by
`OnboardingScreen` on mount; the "clear it on the screen" option was not an alternative to adding
API surface, since `demoMode` is module-private and the only other clearer (`recordAttestation`)
writes, which DEMO refuses. Mount was chosen over the Summary button because ARCH §11 makes the exit
a safety property: every route in must exit, not only the one the copy names. The screen then
re-derives the gate from `isAttested()` instead of hard-coding UNATTESTED; an attested user who had
tried the demo would otherwise be sent to `/calibration` with the context gate still `'DEMO'` and
bounced back to `/session`. `DOCS-CHANGE: API §2. SafetyGate.exitDemoMode() added`, plus ARCH §11 /
FRONTEND §3 / TESTS §4.3 amended. ARCH §12 was **not** amended: it tracks services, screens, tables,
fields, events, error codes and types; it has no row for method names (`SessionController`'s row
lists its events, not its methods), so `exitDemoMode` has no home there and API §2 is its owning doc.
Regression: `tests/e2e/onboarding.spec.ts` "leaving demo through the onboarding exit clears DEMO"
red on unfixed shell (`/session`), and red again with only half (1) applied (stalls at `/onboarding`
because `saveProfile` is demo-refused).

## S1-NOTE-2 → Reconvergence / backend owner (`src/session/controller.ts`, `src/session/calibration.ts`): drift re-check gates every session start on live quality

**Origin:** Task 11 (`SessionScreen`), Stream S1. Not S1's to fix (frozen backend), filed for the
integration owner.

**Observation.** `SessionController.start()` (real, non-demo branch) calls
`CalibrationFlow.checkBaselineDrift()` unconditionally, which runs a live `captureFor()` window and
throws `QUALITY_TOO_LOW` when it approves zero frames (`calibration.ts`:
`if (capture.approved.length === 0) throw QUALITY_TOO_LOW`). Consequence: a **legitimately
calibrated** user who taps Start in momentarily poor light / off-frame cannot begin a session at all
, `start()` rejects before any REPS state, and `SessionScreen` surfaces it as a blocking
`QUALITY_TOO_LOW` notice with only a "Back" action. This is consistent with API §10's documented
precondition order (drift re-check before camera/session), so it is likely intended fail-safe rather
than a bug, but the UX is a dead-ish end for a transient condition, unlike the mid-session path
(FRONTEND §2.4 "camera loss mid-session → pause, not session loss").

**Why filed, not fixed.** Both files are frozen backend. A frontend-only palliative (retry affordance
on the start-time `QUALITY_TOO_LOW` screen instead of only "Back") is possible inside
`SessionScreen`, but the honest fix; distinguishing "baseline actually drifted" from "couldn't
measure right now" at the `checkBaselineDrift` boundary, belongs to the backend/Reconvergence owner.
Flagging so the real-hardware matrix (Task 17) exercises a calibrated-user start in marginal light.

## S1-REQ-3 → integration owner / Reconvergence (`src/sensing/capture.ts`): `stop()` never clears the subscriber set

**Origin:** independent review of Stream S1 (branch `fix/s1-camera-lifecycle`). Root fix is in frozen
backend, so it is filed rather than fixed.

**Verified mechanism.** Three facts, each read from the shipped code:
1. `CaptureService.stop()` (`src/sensing/capture.ts`) releases tracks and clears `stream`/`videoEl`,
   but does **not** clear the module-level `subscribers` Set; that Set lives for the page lifetime.
2. `captureFor()` (`src/session/calibration.ts`) and `captureWindow()`
   (`src/screens/session/demoQuickSetup.ts`) close their capture window only on an **arriving
   frame**. Stop the camera mid-capture and no frame ever arrives, so the window never closes and
   `openFrameSource`'s unsubscribe teardown never runs.
3. Every `openFrameSource` subscriber calls `LandmarkEngine.detect()` independently
   (`src/session/frames.ts`).

Together: unmounting `CalibrationScreen` mid-capture (the unmount cleanup calls
`CaptureService.stop()` unconditionally) orphans a live subscriber. The next camera session then has
**two** subscribers calling `detect()` on the same frame with the same timestamp.

**Honest limit on the symptom.** The orphaned subscriber and the resulting double-`detect()` per
frame are **verified by reading the code**. MediaPipe's actual response to a repeated timestamp in
`runningMode: 'VIDEO'` was **NOT observed**; it is *inferred* that `detectForVideo` rejects a
non-increasing timestamp, which `frames.ts` would absorb as `lf = null` → `FACE_LOST`. The
inference is consistent with the documented requirement, but do not treat "permanent FACE_LOST" as
measured. What is certain is that the one-detect-per-frame invariant this stream was engineered
around is broken.

**Requested change (owner's choice):** either have `CaptureService.stop()` clear `subscribers`, or
give the capture windows an abort path that settles when the camera stops. A screen-level palliative
was deliberately not attempted; it would duplicate ownership logic the seam already owns.

**CLOSED (Reconvergence, `fix/reconvergence-shell`); abort path; the first option is a defect.**
`stop()` must NOT clear `subscribers`: `SessionScreen` pauses by stopping the camera and resumes by
restarting it **without re-subscribing** (`useSessionScreen`; the `SessionController`'s frame source
and the preview both ride that one subscription), so clearing would silently kill every resumed
session. Fix instead: `CaptureService.onStop(cb)` (`DOCS-CHANGE: API §4`), consumed by
`openFrameSource`'s new optional `onCameraStopped` argument, so the seam; not each window; owns
both the release and the unsubscribe-on-normal-close (a stale stop-listener would otherwise abort the
*next* window's teardown-stop). Both windows (`calibration.captureFor`, `demoQuickSetup.captureWindow`)
now throw `CAMERA_UNAVAILABLE` on abort rather than resolving a partial capture, which would send
`captureWindows()` into the next window and re-open the camera on an unmounted screen.

**Honest limit, unchanged.** The regression test pins the **invariant** (one `detect()` per frame
restored), measured against the real `capture.ts`/`frames.ts`/`calibration.ts`. MediaPipe's response
to a repeated timestamp was **not** probed and remains **inferred**, exactly as filed.

## S1-NOTE-3 → deferred minors from the same review (no action requested yet)

Filed for Reconvergence; each is real but non-blocking:
- **Canvas animates while paused.** `phase === 'paused'` stops the camera but nothing tells
  `FeedbackRenderer`, so the rAF loop keeps easing the bar and sweeping the arc against a stale
  `QUALITY_OK`; a pacing arc moving with the camera off. Not a frozen-bar violation (that rule is
  about non-OK quality states, and it holds), but motion without input.
- **Quality state surfaced only in `REPS`.** `SessionStatusStrip` sits inside the REPS branch, so
  during `DEMO`/`REST` no quality message reaches anyone. Affects sighted and screen-reader users
  equally, so it is not an a11y-parity defect; but a user framing themselves during `DEMO` gets no
  feedback.
- **`mountFeedbackCanvas` silently no-ops** when `previewRef.current` is null; ordering currently
  guarantees it is set, so this is latent, not live.

<!-- Append requests below. Template:

## S1-REQ-N → <owner or "integration owner (frozen shell)"> (`<path>`): <one-line summary>

**Origin:** <plan task / screen>.

**Requested change:** <exact change>.

**Why:** <reason, citing the contract/doc §>.
-->
