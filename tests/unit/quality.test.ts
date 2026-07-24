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

/**
 * Landmarks spanning a face-like bbox: eyes at ± half eye-separation on x,
 * plus vertical span so face-region luma has a 2D region to sample.
 * Eye separation is a fraction of video width (horizontal, same y).
 */
function makeLandmarks(eyeSeparationNormalized: number): LandmarkFrame['landmarks'] {
  const landmarks = Array.from({ length: NUM_LANDMARKS }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const half = eyeSeparationNormalized / 2;
  // Face oval roughly covering eyes + forehead/chin for a non-degenerate bbox.
  landmarks[LEFT_EYE_IDX] = { x: 0.5 + half, y: 0.5, z: 0 };
  landmarks[RIGHT_EYE_IDX] = { x: 0.5 - half, y: 0.5, z: 0 };
  landmarks[10] = { x: 0.5, y: 0.35, z: 0 }; // forehead-ish
  landmarks[152] = { x: 0.5, y: 0.65, z: 0 }; // chin-ish
  return landmarks;
}

function makeFrame(overrides: Partial<LandmarkFrame> = {}): LandmarkFrame {
  return {
    // 0.3 ≫ interOcularMinFrac 0.09 → comfortably not TOO_FAR at any resolution
    landmarks: makeLandmarks(0.3),
    headPose: identityHeadPose(),
    facePresent: true,
    timestampMs: 0,
    ...overrides,
    blendshapes: overrides.blendshapes ?? {},
  };
}

/** Translate every landmark by (dx, dy) in normalized coords. */
function translateLandmarks(
  landmarks: LandmarkFrame['landmarks'],
  dx: number,
  dy: number,
): LandmarkFrame['landmarks'] {
  return landmarks.map((p) => ({ x: p.x + dx, y: p.y + dy, z: p.z }));
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

/** Uniform 64×64 grayscale image data at the given luma. */
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

/**
 * Patterned 64×64: face-center region one luma, background another.
 * Center = pixels whose normalized coords fall in [0.25, 0.75] × [0.25, 0.75]
 * (covers landmark bbox ~[0.35,0.65]×[0.35,0.65] plus 10% margin).
 */
function setLumaFaceVsBackground(faceLuma: number, backgroundLuma: number) {
  const data = new Uint8ClampedArray(64 * 64 * 4);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const nx = (x + 0.5) / 64;
      const ny = (y + 0.5) / 64;
      const inFace = nx >= 0.25 && nx <= 0.75 && ny >= 0.25 && ny <= 0.75;
      const v = inFace ? faceLuma : backgroundLuma;
      const i = (y * 64 + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
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

describe('QualityMonitor.evaluate, gate order (first failure wins)', () => {
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

  it('LOW_LIGHT when face-region mean luma < 60/255', async () => {
    setLuma(30);
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    expectStateOnly(result, 'LOW_LIGHT');
  });

  it('QUALITY_OK when face-region luma is right at the boundary (60/255, not below)', async () => {
    setLuma(60);
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    expectQualityOk(result);
  });

  it('TOO_FAR when inter-ocular distance < interOcularMinFrac × video width', async () => {
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    // 0.05 < 0.09 → TOO_FAR (fractional, resolution-independent)
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

describe('QualityMonitor.evaluate, face-region luma (landmark bbox +10% on 64×64)', () => {
  it('dark face + bright background → LOW_LIGHT', async () => {
    // Face center dark (30), edges bright (220); full-frame mean would pass; face-region fails.
    setLumaFaceVsBackground(30, 220);
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    expectStateOnly(result, 'LOW_LIGHT');
  });

  it('lit face + dark background → QUALITY_OK', async () => {
    // Face center bright (200), edges dark (10); full-frame mean might fail; face-region passes.
    setLumaFaceVsBackground(200, 10);
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    expectQualityOk(result);
  });
});

describe('QualityMonitor.evaluate, fractional distance (interOcularMinFrac)', () => {
  it('same face fraction passes at 640×480 and 1280×720', async () => {
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    // 0.12 > 0.09 → pass at any resolution
    const frame = makeFrame({ landmarks: makeLandmarks(0.12) });

    fakeVideo = { videoWidth: 640, videoHeight: 480 };
    const r640 = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, frame);
    expectQualityOk(r640, 640, 480);

    fakeVideo = { videoWidth: 1280, videoHeight: 720 };
    const r1280 = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, frame);
    expectQualityOk(r1280, 1280, 720);
  });

  it('same face fraction fails at both 640×480 and 1280×720 when below frac', async () => {
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    // 0.05 < 0.09 → TOO_FAR at any resolution (would have been 64px vs 32px under old px rule)
    const frame = makeFrame({ landmarks: makeLandmarks(0.05) });

    fakeVideo = { videoWidth: 640, videoHeight: 480 };
    expectStateOnly(
      QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, frame),
      'TOO_FAR',
    );

    fakeVideo = { videoWidth: 1280, videoHeight: 720 };
    expectStateOnly(
      QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, frame),
      'TOO_FAR',
    );
  });
});

describe('QualityMonitor.evaluate, LOW_CONFIDENCE (RMS second-difference jitter)', () => {
  it('QUALITY_OK on the first two frames (need 3 samples for second difference)', async () => {
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    const r0 = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    expectQualityOk(r0);
    const r1 = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    expectQualityOk(r1);
  });

  it('constant-velocity intentional motion passes (second difference ≈ 0)', async () => {
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    const base = makeLandmarks(0.3);
    const v = 0.02; // large per-frame shift, would fail first-difference gate; OK for 2nd-diff
    // p0, p0+v, p0+2v, p0+3v; constant velocity → accel = 0
    for (let t = 0; t < 4; t++) {
      const landmarks = translateLandmarks(base, v * t, v * t);
      const result = QualityMonitor.evaluate(
        fakeVideo as unknown as HTMLVideoElement,
        makeFrame({ landmarks }),
      );
      expectQualityOk(result);
    }
  });

  it('oscillating jitter fails (high second difference → LOW_CONFIDENCE)', async () => {
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    const base = makeLandmarks(0.3);
    const amp = 0.05; // exaggerated oscillation so RMS 2nd-diff stays well above jitterMaxPct
    // Alternate +amp / 0 so second difference is large once 3 frames exist.
    // t=0: 0, t=1: +amp, t=2: 0 → accel = 0 - 2*(+amp) + 0 = -2amp
    const offsets = [0, amp, 0, amp, 0];
    let last: { state: string } | null = null;
    for (const off of offsets) {
      const landmarks = translateLandmarks(base, off, off);
      last = QualityMonitor.evaluate(
        fakeVideo as unknown as HTMLVideoElement,
        makeFrame({ landmarks }),
      );
    }
    expectStateOnly(last!, 'LOW_CONFIDENCE');
  });

  it('QUALITY_OK when landmarks are stable across frames (no jitter)', async () => {
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    expectQualityOk(result);
  });

  it('resets jitter history after a FACE_LOST frame (no stale comparison)', async () => {
    const { QualityMonitor } = await import('../../src/sensing/quality.ts');
    QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, null); // FACE_LOST resets
    // Post-reset first frame has no prior history; not penalized as jitter.
    const result = QualityMonitor.evaluate(fakeVideo as unknown as HTMLVideoElement, makeFrame());
    expectQualityOk(result);
  });
});
