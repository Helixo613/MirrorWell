// src/session/frames.ts; the single frame-source seam shared by src/session/calibration.ts
// and src/session/controller.ts. Module-internal plumbing (no canonical identifier): it wraps
// CaptureService subscription + LandmarkEngine inference and owns the camera *idempotently*.
//
// Why idempotent ownership: SessionController.start() runs the baseline drift check (which
// needs frames) before opening the session's own frame source, and CalibrationFlow's four
// capture methods can overlap with each other. A seam that unconditionally started the camera
// would double-start it, and one that unconditionally stopped it on teardown would kill the
// stream out from under whoever else is still using it.
import { CaptureService } from '../sensing/capture.ts';
import { LandmarkEngine, type LandmarkFrame } from '../sensing/landmarks.ts';

// The raw CaptureService timestamp is carried alongside `lf` rather than read off
// `lf.timestampMs`: it survives the INFERENCE_FAILED catch branch below, and every deadline in
// the callers (calibration's capture window, SessionController's REST deadline, offer-stop
// window and metricUpdate throttle) must keep ticking through a non-OK / inference-failed frame.
export type FrameHandler = (video: HTMLVideoElement, timestampMs: number, lf: LandmarkFrame | null) => void;

// Memoizes an in-flight CaptureService.start() so concurrent openFrameSource() calls share ONE
// start and exactly one caller becomes the owner. Without this, two overlapping opens both see
// isRunning() === false (it only flips true after start()'s internal await resolves), both call
// start() -> getUserMedia twice, and the second acquired MediaStream overwrites the first's in
// capture.ts -- leaking the first stream's tracks and leaving the camera light on after stop().
let startInFlight: Promise<void> | null = null;

/**
 * Subscribes `onFrame` to CaptureService and starts the camera if it is not already running.
 * Resolves to a teardown that unsubscribes and stops the camera **only if this call started
 * it**. If starting fails, the subscriber is removed before the error propagates.
 *
 * `onCameraStopped` is the abort path for a consumer whose window closes only on an ARRIVING
 * frame (both capture windows). Stop the camera mid-window and no frame ever arrives: the
 * consumer's promise hangs, its teardown never runs, and its subscriber is orphaned in
 * CaptureService's module-level Set for the page lifetime; the next session then runs two
 * LandmarkEngine.detect() per frame on the same timestamp, breaking the one-detect-per-frame
 * invariant `detectForVideo` requires. The subscription is released here before the callback
 * runs, so the caller only has to settle. Consumers that legitimately outlive a stop (the
 * SessionScreen pause/resume path re-uses its subscription) simply omit it, which is why
 * CaptureService.stop() must never clear `subscribers` wholesale.
 */
export async function openFrameSource(
  onFrame: FrameHandler,
  onCameraStopped?: () => void,
): Promise<() => void> {
  const unsubscribe = CaptureService.onFrame((video, timestampMs) => {
    // Narrow: only LandmarkEngine.detect is caught (INFERENCE_FAILED -> null). onFrame is
    // called exactly once, outside the try, so a downstream pipeline exception (e.g.
    // NO_BASELINE from compute) propagates instead of being swallowed and re-dispatched as a
    // second, phantom FACE_LOST frame (double frame counting).
    let lf: LandmarkFrame | null;
    try {
      lf = LandmarkEngine.detect(video, timestampMs);
    } catch {
      lf = null;
    }
    onFrame(video, timestampMs, lf);
  });

  // Both unsubscribes always run together: a stale stop-listener left behind by a completed
  // window would fire during the NEXT window's teardown-stop and abort it.
  let unsubscribeStop: () => void = () => undefined;
  const release = () => {
    unsubscribe();
    unsubscribeStop();
  };
  if (onCameraStopped) {
    unsubscribeStop = CaptureService.onStop(() => {
      release();
      onCameraStopped();
    });
  }

  let owned = false;
  if (!CaptureService.isRunning()) {
    if (!startInFlight) {
      owned = true; // only the initiator owns the camera
      startInFlight = CaptureService.start().finally(() => { startInFlight = null; });
    }
    try {
      await startInFlight; // both initiator and piggybackers await the same start
    } catch (err) {
      release(); // finding 1: no stop() here -- a rejected start acquired nothing, and
      // stop() could tear down a DIFFERENT consumer's legitimately-owned camera.
      throw err;
    }
  }

  return () => {
    release(); // before the stop below, so this call's own listener never sees it
    if (owned) CaptureService.stop(); // stop-only-if-I-started, still exactly one owner
  };
}
