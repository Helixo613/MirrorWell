import { beforeEach, describe, expect, it, vi } from 'vitest';

const createFromOptions = vi.fn();
const forVisionTasks = vi.fn();

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: (...args: unknown[]) => forVisionTasks(...args) },
  FaceLandmarker: { createFromOptions: (...args: unknown[]) => createFromOptions(...args) },
}));

function makeFakeResult(overrides: Partial<{ faceLandmarks: unknown[][]; facialTransformationMatrixes: { data: number[] }[] }> = {}) {
  return {
    faceLandmarks: [[{ x: 0.1, y: 0.2, z: -0.01 }]],
    facialTransformationMatrixes: [{ data: new Array(16).fill(0).map((_, i) => i) }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  createFromOptions.mockReset();
  forVisionTasks.mockReset();
  forVisionTasks.mockResolvedValue({ fake: 'fileset' });
});

describe('LandmarkEngine.detect — NOT_INITIALIZED', () => {
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

describe('LandmarkEngine.detect — after init', () => {
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

  it('facePresent is false when faceLandmarks is empty (no confidence field involved)', async () => {
    const detectForVideo = vi.fn().mockReturnValue(makeFakeResult({ faceLandmarks: [] }));
    createFromOptions.mockResolvedValueOnce({ detectForVideo });
    const { LandmarkEngine } = await import('../../src/sensing/landmarks.ts');
    await LandmarkEngine.init();
    const frame = LandmarkEngine.detect({} as HTMLVideoElement, 456);
    expect(frame.facePresent).toBe(false);
    expect(frame.landmarks).toEqual([]);
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
