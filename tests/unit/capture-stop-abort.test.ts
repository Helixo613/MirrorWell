import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LandmarkFrame } from '../../src/sensing/landmarks.ts';

/**
 * REGRESSION — S1-REQ-3 (`docs/superpowers/coordination/frontend-s1-requests.md`).
 *
 * A capture window closes only on an ARRIVING frame. Stopping the camera mid-window (the
 * CalibrationScreen unmount cleanup calls `CaptureService.stop()` unconditionally) means no
 * frame ever arrives: `captureFor` hung, its `openFrameSource` teardown never ran, and its
 * subscriber stayed in CaptureService's module-level `subscribers` Set for the page lifetime.
 * The NEXT camera session then had two subscribers, each calling `LandmarkEngine.detect()` on
 * the same frame and timestamp — the one-detect-per-frame invariant `detectForVideo` requires.
 *
 * These tests run against the REAL `src/sensing/capture.ts`, `src/session/frames.ts` and
 * `src/session/calibration.ts` (only the camera *device*, LandmarkEngine and storage are faked).
 * A hand-authored CaptureService double would let the fix pass vacuously — the orphaned
 * subscriber lives in the real module's Set, so that Set is what has to be exercised.
 *
 * What is measured is the INVARIANT (detect calls per frame == 1). MediaPipe's actual response
 * to a repeated timestamp in `runningMode: 'VIDEO'` is NOT observed here and stays inferred.
 */

const detect = vi.hoisted(() => vi.fn());
const safety = vi.hoisted(() => ({
  isAttested: vi.fn().mockResolvedValue(true),
  isDemoMode: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/sensing/landmarks.ts', () => ({ LandmarkEngine: { detect } }));
vi.mock('../../src/session/safety.ts', () => ({ SafetyGate: safety }));
vi.mock('../../src/data/storage.ts', () => ({
  StorageService: { getProfile: vi.fn().mockResolvedValue(null) },
}));

let CaptureService: typeof import('../../src/sensing/capture.ts').CaptureService;
let CalibrationFlow: typeof import('../../src/session/calibration.ts').CalibrationFlow;

let rafCallbacks: ((t: number) => void)[];

/** facePresent: false → QualityMonitor short-circuits to FACE_LOST before any canvas work. */
function faceless(timestampMs: number): LandmarkFrame {
  return { landmarks: [], headPose: [], facePresent: false, blendshapes: {}, timestampMs };
}

/** Fires the most recently scheduled rAF tick — the loop re-schedules on every frame. */
function tick(timestampMs: number): void {
  rafCallbacks[rafCallbacks.length - 1]!(timestampMs);
}

/** The camera's first tick is only scheduled once getUserMedia resolves, several awaits deep. */
async function waitForFrameLoop(): Promise<void> {
  const before = rafCallbacks.length;
  for (let attempt = 0; rafCallbacks.length === before && attempt < 200; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(async () => {
  vi.resetModules();
  rafCallbacks = [];
  detect.mockReset().mockImplementation((_video: unknown, timestampMs: number) => faceless(timestampMs));

  vi.stubGlobal('document', {
    createElement: () => ({ muted: false, playsInline: false, srcObject: null, play: vi.fn().mockResolvedValue(undefined) }),
  });
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
  });
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: (t: number) => void) => rafCallbacks.push(cb)));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());

  ({ CaptureService } = await import('../../src/sensing/capture.ts'));
  ({ CalibrationFlow } = await import('../../src/session/calibration.ts'));
});

describe('camera stopped mid-capture', () => {
  it('settles the capture instead of hanging on a frame that never arrives', async () => {
    const capture = CalibrationFlow.captureNeutral();
    await waitForFrameLoop();
    tick(0); // window open, mid-flight

    CaptureService.stop(); // what CalibrationScreen's unmount cleanup does

    // CAMERA_UNAVAILABLE, not a partial resolve: resolving would send captureWindows() straight
    // into the next window, re-opening the camera on a screen that is already gone.
    await expect(capture).rejects.toMatchObject({ code: 'CAMERA_UNAVAILABLE' });
  });

  it('leaves no orphaned subscriber, so the next session still runs one detect per frame', async () => {
    const abandoned = CalibrationFlow.captureNeutral();
    abandoned.catch(() => undefined); // the abort rejection is asserted above
    await waitForFrameLoop();
    tick(0);
    CaptureService.stop();
    // Drained with a timer, never by awaiting `abandoned`: on the unfixed code that promise
    // never settles, and this assertion must fail on the detect COUNT rather than on a timeout.
    await new Promise((resolve) => setTimeout(resolve, 0));

    detect.mockClear();
    const next = CalibrationFlow.captureNeutral();
    next.catch(() => undefined);
    await waitForFrameLoop();
    tick(0);

    // Two before the fix: the abandoned window's subscriber was still in the module-level Set.
    expect(detect).toHaveBeenCalledTimes(1);

    CaptureService.stop();
    await next.catch(() => undefined);
  });
});
