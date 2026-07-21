import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openFrameSource } from '../../src/session/frames.ts';
import { MirrorWellError } from '../../src/data/errors.ts';

// The shared frame-source seam owns the camera idempotently: start-if-not-running,
// stop-only-if-I-started. These are the ownership semantics that keep the baseline drift
// check and the session (and CalibrationFlow's four capture methods) from starting the camera
// twice, or stopping it out from under each other.
const capture = vi.hoisted(() => ({
  subscribers: new Set<(video: HTMLVideoElement, timestampMs: number) => void>(),
  running: false,
  start: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('../../src/sensing/capture.ts', () => ({
  CaptureService: {
    onFrame: (cb: (video: HTMLVideoElement, timestampMs: number) => void) => {
      capture.subscribers.add(cb);
      return () => capture.subscribers.delete(cb);
    },
    start: async (...args: unknown[]) => {
      await capture.start(...args);
      capture.running = true;
    },
    stop: (...args: unknown[]) => {
      capture.running = false;
      capture.stop(...args);
    },
    isRunning: () => capture.running,
  },
}));
vi.mock('../../src/sensing/landmarks.ts', () => ({
  LandmarkEngine: { detect: () => landmarkState.result() },
}));

const landmarkState = vi.hoisted(() => ({ result: (): unknown => null }));

const VIDEO = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;

beforeEach(() => {
  capture.subscribers.clear();
  capture.running = false;
  capture.start.mockReset().mockResolvedValue(undefined);
  capture.stop.mockReset();
  landmarkState.result = () => null;
});

describe('openFrameSource camera ownership', () => {
  it('starts the camera when it is not running, and stops it on teardown', async () => {
    const teardown = await openFrameSource(() => undefined);

    expect(capture.start).toHaveBeenCalledTimes(1);
    expect(capture.subscribers.size).toBe(1);

    teardown();

    expect(capture.stop).toHaveBeenCalledTimes(1);
    expect(capture.subscribers.size).toBe(0);
  });

  it('does not start the camera when it is already running', async () => {
    capture.running = true;

    const teardown = await openFrameSource(() => undefined);

    expect(capture.start).not.toHaveBeenCalled();
    expect(capture.subscribers.size).toBe(1);

    // ... and does not stop a camera it never started.
    teardown();

    expect(capture.stop).not.toHaveBeenCalled();
    expect(capture.subscribers.size).toBe(0);
    expect(capture.running).toBe(true);
  });

  it('leaves the first consumer running when a second consumer tears down', async () => {
    const first = await openFrameSource(() => undefined);
    const second = await openFrameSource(() => undefined);

    expect(capture.start).toHaveBeenCalledTimes(1);

    second();
    expect(capture.stop).not.toHaveBeenCalled();
    expect(capture.running).toBe(true);

    first();
    expect(capture.stop).toHaveBeenCalledTimes(1);
    expect(capture.running).toBe(false);
  });

  it('leaves no subscriber behind when start() rejects', async () => {
    capture.start.mockRejectedValueOnce(new MirrorWellError('CAMERA_DENIED', 'denied'));

    await expect(openFrameSource(() => undefined)).rejects.toMatchObject({ code: 'CAMERA_DENIED' });

    expect(capture.subscribers.size).toBe(0);
    expect(capture.running).toBe(false);
  });

  it('delivers the raw capture timestamp and a null lf when inference throws', async () => {
    const seen: Array<{ timestampMs: number; lf: unknown }> = [];
    landmarkState.result = () => {
      throw new Error('inference failed (test)');
    };

    const teardown = await openFrameSource((_video, timestampMs, lf) => seen.push({ timestampMs, lf }));
    for (const cb of [...capture.subscribers]) cb(VIDEO, 1234);
    teardown();

    expect(seen).toEqual([{ timestampMs: 1234, lf: null }]);
  });
});
