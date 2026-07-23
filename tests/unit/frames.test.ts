import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openFrameSource } from '../../src/session/frames.ts';
import { MirrorWellError } from '../../src/data/errors.ts';

// The shared frame-source seam owns the camera idempotently: start-if-not-running,
// stop-only-if-I-started. These are the ownership semantics that keep the baseline drift
// check and the session (and CalibrationFlow's four capture methods) from starting the camera
// twice, or stopping it out from under each other.
const capture = vi.hoisted(() => ({
  subscribers: new Set<(video: HTMLVideoElement, timestampMs: number) => void>(),
  stopSubscribers: new Set<() => void>(),
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
    onStop: (cb: () => void) => {
      capture.stopSubscribers.add(cb);
      return () => capture.stopSubscribers.delete(cb);
    },
    start: async (...args: unknown[]) => {
      await capture.start(...args);
      capture.running = true;
    },
    // Mirrors the real stop(): abort listeners are announced last, from a snapshot, because
    // each one unsubscribes itself (and may re-enter stop()) from inside the loop.
    stop: (...args: unknown[]) => {
      capture.running = false;
      capture.stop(...args);
      for (const cb of [...capture.stopSubscribers]) cb();
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

  it('leaves no subscriber behind when start() rejects, and never stops a camera it never started', async () => {
    capture.start.mockRejectedValueOnce(new MirrorWellError('CAMERA_DENIED', 'denied'));

    await expect(openFrameSource(() => undefined)).rejects.toMatchObject({ code: 'CAMERA_DENIED' });

    expect(capture.subscribers.size).toBe(0);
    expect(capture.running).toBe(false);
    // Finding 1: a rejected start() acquired nothing, so stop() must not run — it could tear
    // down a DIFFERENT consumer's legitimately-owned camera.
    expect(capture.stop).not.toHaveBeenCalled();
  });

  it('shares one start() across overlapping opens; stops only after the owner tears down', async () => {
    // Hold the mocked start() open so a second openFrameSource() can launch before the first
    // resolves, exercising the overlap window.
    const resolvers: Array<() => void> = [];
    capture.start.mockReset().mockImplementation(
      () => new Promise<void>((resolve) => { resolvers.push(resolve); }),
    );

    const p1 = openFrameSource(() => undefined);
    const p2 = openFrameSource(() => undefined);

    // Both opens have run to their first await synchronously by now: exactly one shared
    // start() in flight, not two.
    expect(capture.start).toHaveBeenCalledTimes(1);

    resolvers.forEach((resolve) => resolve());
    const [teardown1, teardown2] = await Promise.all([p1, p2]);

    expect(capture.start).toHaveBeenCalledTimes(1);
    expect(capture.subscribers.size).toBe(2);

    // Non-owner tears down first: no stop, camera stays on for the owner.
    teardown2();
    expect(capture.stop).not.toHaveBeenCalled();
    expect(capture.running).toBe(true);

    // Owner tears down: stop runs exactly once, camera light goes off.
    teardown1();
    expect(capture.stop).toHaveBeenCalledTimes(1);
    expect(capture.running).toBe(false);
  });

  it('rejects both callers on a shared start() rejection, leaves no subscriber, and clears startInFlight for a clean retry', async () => {
    let rejectStart!: (err: unknown) => void;
    capture.start.mockReset().mockImplementationOnce(
      () => new Promise<void>((_resolve, reject) => { rejectStart = reject; }),
    );

    const p1 = openFrameSource(() => undefined);
    const p2 = openFrameSource(() => undefined);

    expect(capture.start).toHaveBeenCalledTimes(1);

    rejectStart(new MirrorWellError('CAMERA_DENIED', 'denied'));

    await expect(p1).rejects.toMatchObject({ code: 'CAMERA_DENIED' });
    await expect(p2).rejects.toMatchObject({ code: 'CAMERA_DENIED' });

    expect(capture.subscribers.size).toBe(0);
    expect(capture.stop).not.toHaveBeenCalled();
    expect(capture.running).toBe(false);

    // startInFlight must have been cleared so a later open can retry cleanly.
    capture.start.mockReset().mockResolvedValue(undefined);
    const teardown3 = await openFrameSource(() => undefined);
    expect(capture.start).toHaveBeenCalledTimes(1);

    teardown3();
    expect(capture.stop).toHaveBeenCalledTimes(1);
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
