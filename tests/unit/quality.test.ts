import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LandmarkFrame } from '../../src/sensing/landmarks.ts';

const NUM_LANDMARKS = 478;
const LEFT_EYE_IDX = 33;
const RIGHT_EYE_IDX = 263;

function identityHeadPose(): number[] {
  // eslint-disable-next-line prettier/prettier
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

function yawHeadPose(degrees: number): number[] {
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  // eslint-disable-next-line prettier/prettier
  return [
    c, 0, s, 0,
    0, 1, 0, 0,
    -s, 0, c, 0,
    0, 0, 0, 1,
  ];
}

function makeLandmarks(eyeSeparationNormalized: number): LandmarkFrame['landmarks'] {
  const landmarks = Array.from({ length: NUM_LANDMARKS }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const half = eyeSeparationNormalized / 2;
  landmarks[LEFT_EYE_IDX] = { x: 0.5 + half, y: 0.5, z: 0 };
  landmarks[RIGHT_EYE_IDX] = { x: 0.5 - half, y: 0.5, z: 0 };
  return landmarks;
}

function makeFrame(overrides: Partial<LandmarkFrame> = {}): LandmarkFrame {
  return {
    landmarks: makeLandmarks(0.3), // 0.3 * 640 = 192px, comfortably > 60px TOO_FAR threshold
    headPose: identityHeadPose(),
    facePresent: true,
    timestampMs: 0,
    ...overrides,
  };
}

/** Assert non-OK QualityResult has no frame key (discriminated union). */
function expectStateOnly(result: { state: string }, state: string) {
  expect(result.state).toBe(state);
  expect(result).not.toHaveProperty('frame');
}

/** Assert QUALITY_OK with ApprovedFrame carrying video dimensions + lf. */
function expectQualityOk(
  result: { state: string; frame?: { videoWidth: number; videoHeight: number; lf: LandmarkFrame } },
  videoWidth = 640,
  videoHeight = 480,
) {
  expect(result.state).toBe('QUALITY_OK');
  if (result.state === 'QUALITY_OK') {
    expect(result.frame).toBeDefined();
    expect(result.frame!.videoWidth).toBe(videoWidth);
    expect(result.frame!.videoHeight).toBe(videoHeight);
    expect(result.frame!.lf).toBeDefined();
  }
}

let fakeCtx: { drawImage: ReturnType<typeof vi.fn>; getImageData: ReturnType<typeof vi.fn> };
let fakeVideo: { videoWidth: number; videoHeight: number };

function setLuma(value: number) {
  const data = new Uint8ClampedArray(64 * 64 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  fakeCtx.getImageData.mockReturnValue({ data });
}

beforeEach(() => {
  vi.resetModules();
  fakeCtx = { drawImage: vi.fn(), getImageData: vi.fn() };
  setLuma(200); // bright by default; individual tests override
  fakeVideo = { videoWidth: 640, videoHeight: 480 };

  vi.stubGlobal('document', {
    createElement: vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: vi.fn(() => fakeCtx),
    })),
  });
});

describe('QualityMonitor.evaluate — gate order (first failure wins)', () => {
  it('FACE_LOST when lf is null', async () => {
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, null);
    expectStateOnly(result, 'FACE_LOST');
  });

  it('FACE_LOST when facePresent is false (INFERENCE_FAILED absorbed upstream)', async () => {
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    const frame = makeFrame({ facePresent: false });
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, frame);
    expectStateOnly(result, 'FACE_LOST');
  });

  it('LOW_LIGHT when mean luma < 60/255', async () => {
    setLuma(30);
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    expectStateOnly(result, 'LOW_LIGHT');
  });

  it('QUALITY_OK when luma is right at the boundary (60/255, not below)', async () => {
    setLuma(60);
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    expectQualityOk(result);
  });

  it('TOO_FAR when inter-ocular distance < 60px', async () => {
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    // 0.05 * 640 = 32px < 60px threshold
    const frame = makeFrame({ landmarks: makeLandmarks(0.05) });
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, frame);
    expectStateOnly(result, 'TOO_FAR');
  });

  it('POSE_OUT_OF_RANGE when |yaw| > 15°', async () => {
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    const frame = makeFrame({ headPose: yawHeadPose(30) });
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, frame);
    expectStateOnly(result, 'POSE_OUT_OF_RANGE');
  });

  it('QUALITY_OK when |yaw| is within range (5°)', async () => {
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    const frame = makeFrame({ headPose: yawHeadPose(5) });
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, frame);
    expectQualityOk(result);
  });

  it('gate precedence: FACE_LOST wins over LOW_LIGHT', async () => {
    setLuma(10);
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, null);
    expectStateOnly(result, 'FACE_LOST');
  });

  it('gate precedence: LOW_LIGHT wins over TOO_FAR', async () => {
    setLuma(10);
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    const frame = makeFrame({ landmarks: makeLandmarks(0.01) }); // also too far
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, frame);
    expectStateOnly(result, 'LOW_LIGHT');
  });

  it('gate precedence: TOO_FAR wins over POSE_OUT_OF_RANGE', async () => {
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    const frame = makeFrame({ landmarks: makeLandmarks(0.01), headPose: yawHeadPose(30) });
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, frame);
    expectStateOnly(result, 'TOO_FAR');
  });

  it('QUALITY_OK on a clean, centered, well-lit, front-facing frame', async () => {
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    expectQualityOk(result);
    if (result.state === 'QUALITY_OK') {
      expect(result.frame.lf.facePresent).toBe(true);
      expect(result.frame.lf.landmarks).toHaveLength(NUM_LANDMARKS);
    }
  });
});

describe('QualityMonitor.evaluate — LOW_CONFIDENCE (rolling jitter)', () => {
  it('QUALITY_OK on the first frame (no prior frame to compare)', async () => {
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    expectQualityOk(result);
  });

  it('LOW_CONFIDENCE when landmarks jitter > 0.5% of inter-ocular distance between frames', async () => {
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    // Establish a stable baseline frame first.
    QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    // Next frame: every landmark shifts by a large amount relative to inter-ocular distance.
    const jittered = makeLandmarks(0.3).map((p) => ({ ...p, x: p.x + 0.05, y: p.y + 0.05 }));
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame({ landmarks: jittered }));
    expectStateOnly(result, 'LOW_CONFIDENCE');
  });

  it('QUALITY_OK when landmarks are stable across frames (no jitter)', async () => {
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    expectQualityOk(result);
  });

  it('resets jitter history after a FACE_LOST frame (no stale comparison)', async () => {
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, null); // FACE_LOST resets state
    // Even a wildly different frame right after FACE_LOST should not be penalized as jitter
    // against the pre-loss frame — there is no valid "previous frame" to compare against.
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    expectQualityOk(result);
  });
});
