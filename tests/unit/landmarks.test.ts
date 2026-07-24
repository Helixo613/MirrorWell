import { beforeEach, describe, expect, it, vi } from 'vitest';

const createFromOptions = vi.fn();
const forVisionTasks = vi.fn();

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: (...args: unknown[]) => forVisionTasks(...args) },
  FaceLandmarker: { createFromOptions: (...args: unknown[]) => createFromOptions(...args) },
}));

function makeFakeResult(
  overrides: Partial<{
    faceLandmarks: unknown[][];
    facialTransformationMatrixes: { data: number[] }[];
    faceBlendshapes: { categories: { categoryName: string; score: number }[] }[];
  }> = {},
) {
  return {
    faceLandmarks: [[{ x: 0.1, y: 0.2, z: -0.01 }]],
    facialTransformationMatrixes: [{ data: new Array(16).fill(0).map((_, i) => i) }],
    faceBlendshapes: [
      {
        categories: [
          { categoryName: 'mouthSmileLeft', score: 0.42 },
          { categoryName: 'mouthSmileRight', score: 0.4 },
        ],
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  createFromOptions.mockReset();
  forVisionTasks.mockReset();
  forVisionTasks.mockResolvedValue({ fake: 'fileset' });
});

describe('LandmarkEngine.detect; NOT_INITIALIZED', () => {
  it('throws NOT_INITIALIZED when called before init()', async () => {
    const { LandmarkEngine } = await import('../../src/sensing/landmarks.ts');
    expect(() => LandmarkEngine.detect({} as HTMLVideoElement, 0)).toThrow(
      expect.objectContaining({ code: 'NOT_INITIALIZED' }),
    );
  });

  it('isReady() is false before init()', async () => {
    const { LandmarkEngine } = await import('../../src/sensing/landmarks.ts');
    expect(LandmarkEngine.isReady()).toBe(false);
  });
});

describe('LandmarkEngine.init', () => {
  it('succeeds on GPU delegate and sets isReady() true', async () => {
    createFromOptions.mockResolvedValueOnce({ detectForVideo: vi.fn() });
    const { LandmarkEngine } = await import('../../src/sensing/landmarks.ts');
    await LandmarkEngine.init();
    expect(LandmarkEngine.isReady()).toBe(true);
    expect(createFromOptions.mock.calls[0]![1]).toMatchObject({ baseOptions: { delegate: 'GPU' } });
  });

  it('falls back to CPU delegate if GPU delegate creation fails', async () => {
    createFromOptions
      .mockRejectedValueOnce(new Error('WebGPU not supported'))
      .mockResolvedValueOnce({ detectForVideo: vi.fn() });
    const { LandmarkEngine } = await import('../../src/sensing/landmarks.ts');
    await LandmarkEngine.init();
    expect(LandmarkEngine.isReady()).toBe(true);
    expect(createFromOptions).toHaveBeenCalledTimes(2);
    expect(createFromOptions.mock.calls[1]![1]).toMatchObject({ baseOptions: { delegate: 'CPU' } });
  });

  it('throws MODEL_LOAD_FAILED when both delegates fail', async () => {
    createFromOptions.mockRejectedValue(new Error('no backend available'));
    const { LandmarkEngine } = await import('../../src/sensing/landmarks.ts');
    await expect(LandmarkEngine.init()).rejects.toMatchObject({ code: 'MODEL_LOAD_FAILED', recoverable: false });
  });

  it('throws MODEL_LOAD_FAILED when the fileset resolver itself fails', async () => {
    forVisionTasks.mockRejectedValueOnce(new Error('wasm runtime missing'));
    const { LandmarkEngine } = await import('../../src/sensing/landmarks.ts');
    await expect(LandmarkEngine.init()).rejects.toMatchObject({ code: 'MODEL_LOAD_FAILED' });
  });
});

describe('LandmarkEngine.detect, after init', () => {
  it('throws INFERENCE_FAILED when detectForVideo throws', async () => {
    const detectForVideo = vi.fn().mockImplementation(() => {
      throw new Error('inference crashed');
    });
    createFromOptions.mockResolvedValueOnce({ detectForVideo });
    const { LandmarkEngine } = await import('../../src/sensing/landmarks.ts');
    await LandmarkEngine.init();
    expect(() => LandmarkEngine.detect({} as HTMLVideoElement, 123)).toThrow(
      expect.objectContaining({ code: 'INFERENCE_FAILED' }),
    );
  });

  it('facePresent is true when faceLandmarks is non-empty', async () => {
    const detectForVideo = vi.fn().mockReturnValue(makeFakeResult());
    createFromOptions.mockResolvedValueOnce({ detectForVideo });
    const { LandmarkEngine } = await import('../../src/sensing/landmarks.ts');
    await LandmarkEngine.init();
    const frame = LandmarkEngine.detect({} as HTMLVideoElement, 123);
    expect(frame.facePresent).toBe(true);
    expect(frame.landmarks).toHaveLength(1);
    expect(frame.timestampMs).toBe(123);
  });

  it('blendshapes map categoryName to score; empty object when the result has none', async () => {
    const detectForVideo = vi.fn().mockReturnValue(makeFakeResult());
    createFromOptions.mockResolvedValueOnce({ detectForVideo });
    const { LandmarkEngine } = await import('../../src/sensing/landmarks.ts');
    await LandmarkEngine.init();
    const frame = LandmarkEngine.detect({} as HTMLVideoElement, 1);
    expect(frame.blendshapes).toEqual({ mouthSmileLeft: 0.42, mouthSmileRight: 0.4 });
    expect(createFromOptions.mock.calls[0]![1]).toMatchObject({ outputFaceBlendshapes: true });

    const bare = vi.fn().mockReturnValue(makeFakeResult({ faceBlendshapes: [] }));
    createFromOptions.mockResolvedValueOnce({ detectForVideo: bare });
    vi.resetModules();
    const { LandmarkEngine: LE2 } = await import('../../src/sensing/landmarks.ts');
    await LE2.init();
    expect(LE2.detect({} as HTMLVideoElement, 2).blendshapes).toEqual({});
  });

  it('facePresent is false when faceLandmarks is empty (no confidence field involved)', async () => {
    const detectForVideo = vi.fn().mockReturnValue(makeFakeResult({ faceLandmarks: [] }));
    createFromOptions.mockResolvedValueOnce({ detectForVideo });
    const { LandmarkEngine } = await import('../../src/sensing/landmarks.ts');
    await LandmarkEngine.init();
    const frame = LandmarkEngine.detect({} as HTMLVideoElement, 456);
    expect(frame.facePresent).toBe(false);
    expect(frame.landmarks).toEqual([]);
  });

  it('feeds detectForVideo strictly increasing timestamps even when caller timestamps repeat or go backwards', async () => {
    // The MediaPipe graph is poisoned unrecoverably by a non-increasing timestamp
    // (google-ai-edge/mediapipe#5743), e.g. a camera restart resetting the clock a caller
    // derives timestamps from. detect() must clamp forward, and the returned LandmarkFrame
    // must keep the CALLER's timestamp (window/deadline logic runs on the caller clock).
    const detectForVideo = vi.fn().mockReturnValue(makeFakeResult());
    createFromOptions.mockResolvedValueOnce({ detectForVideo });
    const { LandmarkEngine } = await import('../../src/sensing/landmarks.ts');
    await LandmarkEngine.init();

    LandmarkEngine.detect({} as HTMLVideoElement, 1000);
    LandmarkEngine.detect({} as HTMLVideoElement, 1000); // repeat
    const backwards = LandmarkEngine.detect({} as HTMLVideoElement, 40); // camera-restart reset

    const fed = detectForVideo.mock.calls.map((call) => call[1] as number);
    expect(fed).toEqual([1000, 1001, 1002]);
    for (let i = 1; i < fed.length; i++) expect(fed[i]!).toBeGreaterThan(fed[i - 1]!);
    expect(backwards.timestampMs).toBe(40); // caller clock preserved on the frame
  });

  it('advances the clamp clock past a throwing detect (the packet may still have been ingested)', async () => {
    const detectForVideo = vi
      .fn()
      .mockReturnValueOnce(makeFakeResult())
      .mockImplementationOnce(() => {
        throw new Error('inference crashed');
      })
      .mockReturnValue(makeFakeResult());
    createFromOptions.mockResolvedValueOnce({ detectForVideo });
    const { LandmarkEngine } = await import('../../src/sensing/landmarks.ts');
    await LandmarkEngine.init();

    LandmarkEngine.detect({} as HTMLVideoElement, 500);
    expect(() => LandmarkEngine.detect({} as HTMLVideoElement, 500)).toThrow(
      expect.objectContaining({ code: 'INFERENCE_FAILED' }),
    );
    LandmarkEngine.detect({} as HTMLVideoElement, 500);

    const fed = detectForVideo.mock.calls.map((call) => call[1] as number);
    expect(fed).toEqual([500, 501, 502]);
  });

  it('never exposes faceBlendshapes on the returned LandmarkFrame', async () => {
    const detectForVideo = vi.fn().mockReturnValue({ ...makeFakeResult(), faceBlendshapes: [{ categories: [] }] });
    createFromOptions.mockResolvedValueOnce({ detectForVideo });
    const { LandmarkEngine } = await import('../../src/sensing/landmarks.ts');
    await LandmarkEngine.init();
    const frame = LandmarkEngine.detect({} as HTMLVideoElement, 789);
    expect(frame).not.toHaveProperty('faceBlendshapes');
  });
});
