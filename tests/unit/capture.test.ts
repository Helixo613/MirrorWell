import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeFakeVideoEl() {
  return {
    muted: false,
    playsInline: false,
    srcObject: null as unknown,
    play: vi.fn().mockResolvedValue(undefined),
  };
}

let fakeVideo: ReturnType<typeof makeFakeVideoEl>;
let fakeTracks: { stop: ReturnType<typeof vi.fn> }[];
let fakeStream: { getTracks: () => typeof fakeTracks };
let rafCallbacks: ((t: number) => void)[];

beforeEach(() => {
  vi.resetModules();
  rafCallbacks = [];
  fakeTracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  fakeStream = { getTracks: () => fakeTracks };
  // No requestVideoFrameCallback on this fake element — forces the rAF fallback path,
  // which is deterministic to drive synchronously in tests.
  fakeVideo = makeFakeVideoEl();

  vi.stubGlobal('document', {
    createElement: vi.fn((tag: string) => {
      if (tag !== 'video') throw new Error(`unexpected element: ${tag}`);
      return fakeVideo;
    }),
  });
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
  });
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: (t: number) => void) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    }),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

describe('CaptureService — getUserMedia error mapping', () => {
  it('maps NotAllowedError to CAMERA_DENIED', async () => {
    (globalThis as any).navigator.mediaDevices.getUserMedia = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    const { CaptureService } = await import('../../src/sensing/capture.ts');
    await expect(CaptureService.start()).rejects.toMatchObject({ code: 'CAMERA_DENIED' });
  });

  it('maps NotFoundError (no device) to CAMERA_UNAVAILABLE', async () => {
    (globalThis as any).navigator.mediaDevices.getUserMedia = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('no device'), { name: 'NotFoundError' }));
    const { CaptureService } = await import('../../src/sensing/capture.ts');
    await expect(CaptureService.start()).rejects.toMatchObject({ code: 'CAMERA_UNAVAILABLE' });
  });

  it('maps NotReadableError (device in use) to CAMERA_UNAVAILABLE', async () => {
    (globalThis as any).navigator.mediaDevices.getUserMedia = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('in use'), { name: 'NotReadableError' }));
    const { CaptureService } = await import('../../src/sensing/capture.ts');
    await expect(CaptureService.start()).rejects.toMatchObject({ code: 'CAMERA_UNAVAILABLE' });
  });
});

describe('CaptureService — frame subscription', () => {
  it('unsubscribe stops callbacks', async () => {
    const { CaptureService } = await import('../../src/sensing/capture.ts');
    await CaptureService.start();
    const cb = vi.fn();
    const unsubscribe = CaptureService.onFrame(cb);

    rafCallbacks[0]!(1000);
    expect(cb).toHaveBeenCalledTimes(1);

    unsubscribe();
    rafCallbacks[rafCallbacks.length - 1]!(1016);
    expect(cb).toHaveBeenCalledTimes(1);

    CaptureService.stop();
  });

  it('isRunning reflects start/stop', async () => {
    const { CaptureService } = await import('../../src/sensing/capture.ts');
    expect(CaptureService.isRunning()).toBe(false);
    await CaptureService.start();
    expect(CaptureService.isRunning()).toBe(true);
    CaptureService.stop();
    expect(CaptureService.isRunning()).toBe(false);
  });
});

describe('CaptureService.stop', () => {
  it('releases all tracks (camera light off)', async () => {
    const { CaptureService } = await import('../../src/sensing/capture.ts');
    await CaptureService.start();
    CaptureService.stop();
    for (const track of fakeTracks) {
      expect(track.stop).toHaveBeenCalledTimes(1);
    }
  });
});
