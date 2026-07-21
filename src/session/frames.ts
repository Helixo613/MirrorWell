// src/session/frames.ts — the single frame-source seam shared by src/session/calibration.ts
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
 */
export async function openFrameSource(onFrame: FrameHandler): Promise<() => void> {
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

  let owned = false;
  if (!CaptureService.isRunning()) {
    if (!startInFlight) {
      owned = true; // only the initiator owns the camera
      startInFlight = CaptureService.start().finally(() => { startInFlight = null; });
    }
    try {
      await startInFlight; // both initiator and piggybackers await the same start
    } catch (err) {
      unsubscribe(); // finding 1: no stop() here -- a rejected start acquired nothing, and
      // stop() could tear down a DIFFERENT consumer's legitimately-owned camera.
      throw err;
    }
  }

  return () => {
    unsubscribe();
    if (owned) CaptureService.stop(); // stop-only-if-I-started, still exactly one owner
  };
}
