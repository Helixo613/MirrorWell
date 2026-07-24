import { beforeEach, describe, expect, it, vi } from 'vitest';
import { thresholds } from '../../src/config/thresholds.ts';
import type { UserProfile } from '../../src/data/schema.ts';
import type { LandmarkFrame } from '../../src/sensing/landmarks.ts';

// Test isolation: CalibrationFlow (and QualityMonitor's jitter history) keep module-level
// state that is never reset by a public API, so state bled between tests and could mask
// ordering-dependent bugs. Each test gets a fresh module graph via vi.resetModules() + dynamic
// import; no test-only reset() is added to the production contract. Every stateful
// collaborator the tests spy on or read must come from the SAME fresh graph, hence the
// re-imports below.
let StorageService: typeof import('../../src/data/storage.ts').StorageService;
let CalibrationFlow: typeof import('../../src/session/calibration.ts').CalibrationFlow;
let QualityMonitor: typeof import('../../src/sensing/quality.ts').QualityMonitor;
let NormalizationLayer: typeof import('../../src/metrics/normalize.ts').NormalizationLayer;

const capture = vi.hoisted(() => ({
  subscribers: new Set<(video: HTMLVideoElement, timestampMs: number) => void>(),
  stopSubscribers: new Set<() => void>(),
  running: false,
  start: vi.fn(),
  stop: vi.fn(),
}));
const safety = vi.hoisted(() => ({ isAttested: vi.fn(), isDemoMode: vi.fn() }));
const frames = vi.hoisted(() => [] as (LandmarkFrame | null)[]);

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
    // Models the real service's ownership flag so src/session/frames.ts's
    // start-if-not-running / stop-only-if-I-started logic is genuinely exercised.
    start: async (...args: unknown[]) => {
      await capture.start(...args);
      capture.running = true;
    },
    // Mirrors the real stop(): abort listeners announced last, from a snapshot, because each
    // unsubscribes itself (and may re-enter stop()) from inside the loop.
    stop: (...args: unknown[]) => {
      capture.running = false;
      capture.stop(...args);
      for (const cb of [...capture.stopSubscribers]) cb();
    },
    isRunning: () => capture.running,
  },
}));
vi.mock('../../src/sensing/landmarks.ts', () => ({ LandmarkEngine: { detect: () => frames.shift() ?? null } }));
vi.mock('../../src/session/safety.ts', () => ({ SafetyGate: safety }));

const PROFILE: UserProfile = {
  profileId: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-07-01T09:00:00.000Z',
  affectedSide: 'left',
  assignedExercises: ['EX_SMILE'],
  attestedAt: '2026-07-01T09:00:00.000Z',
  consentVersion: '1',
};
const video = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;

function frame(blendshapes: Record<string, number> = {}, timestampMs = 0): LandmarkFrame {
  const landmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  landmarks[33] = { x: 0.35, y: 0.5, z: 0 };
  landmarks[263] = { x: 0.65, y: 0.5, z: 0 };
  landmarks[10] = { x: 0.5, y: 0.35, z: 0 };
  landmarks[152] = { x: 0.5, y: 0.65, z: 0 };
  return {
    landmarks,
    headPose: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    facePresent: true,
    blendshapes,
    timestampMs,
  };
}

function emit(lf: LandmarkFrame | null, timestampMs: number): void {
  frames.push(lf ? { ...lf, timestampMs } : null);
  for (const callback of capture.subscribers) callback(video, timestampMs);
}

/**
 * Waits until a capture window is subscribed. captureFor() now awaits
 * CaptureService.start() before its window is live (src/session/frames.ts), so the number of
 * microtasks between windows is an implementation detail, poll for the subscriber instead of
 * counting ticks. Each window tears its subscriber down synchronously on its closing frame,
 * so `size === 0` reliably means "the next window has not opened yet".
 */
async function waitForSubscriber(): Promise<void> {
  for (let attempt = 0; capture.subscribers.size === 0 && attempt < 200; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function captureThree(result: Promise<unknown>, values: (LandmarkFrame | null)[]): Promise<void> {
  const durationMs = thresholds.calibration.captureSeconds * 1000;
  for (let i = 0; i < thresholds.calibration.neutralCaptures; i++) {
    await waitForSubscriber();
    emit(values[i]!, i * durationMs * 2);
    emit(values[i]!, i * durationMs * 2 + durationMs);
  }
  await result;
}

async function captureThreeWithFrames(result: Promise<unknown>, windows: LandmarkFrame[][]): Promise<void> {
  const durationMs = thresholds.calibration.captureSeconds * 1000;
  for (let index = 0; index < windows.length; index++) {
    await waitForSubscriber();
    const start = index * durationMs * 3;
    for (let offset = 0; offset < windows[index]!.length; offset++) {
      emit(windows[index]![offset]!, start + (offset === windows[index]!.length - 1 ? durationMs : offset));
    }
  }
  await result;
}

async function captureOne(result: Promise<unknown>, framesForWindow: LandmarkFrame[]): Promise<void> {
  await waitForSubscriber();
  const durationMs = thresholds.calibration.captureSeconds * 1000;
  for (let index = 0; index < framesForWindow.length; index++) {
    emit(framesForWindow[index]!, index === framesForWindow.length - 1 ? durationMs : index);
  }
  await result;
}

async function persistBaseline(): Promise<void> {
  await captureThree(CalibrationFlow.captureNeutral(), [frame(), frame(), frame()]);
  await captureThree(CalibrationFlow.captureComfortableMax('EX_SMILE'), [
    frame({ mouthSmileLeft: 0.5, mouthSmileRight: 0.5 }),
    frame({ mouthSmileLeft: 0.7, mouthSmileRight: 0.7 }),
    frame({ mouthSmileLeft: 0.9, mouthSmileRight: 0.9 }),
  ]);
  await captureOne(CalibrationFlow.runNoiseFloorSelfTest(), [
    frame({ mouthSmileLeft: 0.5, mouthSmileRight: 0.5 }),
    frame({ mouthSmileLeft: 0.5, mouthSmileRight: 0.5 }),
  ]);
}

beforeEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
  ({ StorageService } = await import('../../src/data/storage.ts'));
  ({ CalibrationFlow } = await import('../../src/session/calibration.ts'));
  ({ QualityMonitor } = await import('../../src/sensing/quality.ts'));
  ({ NormalizationLayer } = await import('../../src/metrics/normalize.ts'));
  capture.subscribers.clear();
  capture.running = false;
  capture.start.mockReset().mockResolvedValue(undefined);
  capture.stop.mockReset();
  frames.length = 0;
  safety.isAttested.mockResolvedValue(true);
  safety.isDemoMode.mockReturnValue(false);
  vi.stubGlobal('crypto', { randomUUID: () => '22222222-2222-4222-8222-222222222222' });
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({
        drawImage: () => undefined,
        getImageData: () => ({ data: new Uint8ClampedArray(64 * 64 * 4).fill(200) }),
      }),
    }),
  });
  await StorageService.deleteAllData();
  await StorageService.saveProfile(PROFILE);
  vi.spyOn(StorageService, 'getProfile').mockResolvedValue(PROFILE);
  QualityMonitor.evaluate(video, null);
});

describe('CalibrationFlow', () => {
  it('captures neutral stats from OK frames and counts mixed quality', async () => {
    const result = CalibrationFlow.captureNeutral();
    await captureThree(result, [frame({ mouthSmileLeft: 0.2, mouthSmileRight: 0.2 }), frame(), frame()]);

    await expect(result).resolves.toMatchObject({ qualityScore: 1, neutralStats: expect.any(Object) });
  });

  it('rejects a neutral capture below the quality floor without persisting', async () => {
    const result = CalibrationFlow.captureNeutral();
    await captureThree(result.then(() => undefined, () => undefined), [
      frame({}, 0),
      frame({}, 0),
      frame({}, 0),
    ].map((value) => ({ ...value, facePresent: false })));

    await expect(result).rejects.toMatchObject({ code: 'QUALITY_TOO_LOW' });
    expect(await StorageService.getActiveBaseline()).toBeNull();
  });

  it('uses the median comfortable-max peak', async () => {
    const result = CalibrationFlow.captureComfortableMax('EX_SMILE');
    await captureThree(result, [
      frame({ mouthSmileLeft: 0.5, mouthSmileRight: 0.2 }),
      frame({ mouthSmileLeft: 0.7, mouthSmileRight: 0.2 }),
      frame({ mouthSmileLeft: 0.9, mouthSmileRight: 0.2 }),
    ]);

    await expect(result).resolves.toBe(0.7);
  });

  it('rejects a comfortable-max median peak below activationFloor (held-still capture)', async () => {
    // Same invariant demoComfortableMax enforces: a noise-level comfortableMax makes
    // effortIndex = activation / comfortableMax read ANY facial motion, including
    // cross-activation bleed from an unrelated movement, as a full-effort rep.
    // QUALITY_TOO_LOW so CalibrationScreen's coaching/retry path handles it.
    const result = CalibrationFlow.captureComfortableMax('EX_SMILE');
    await captureThree(result.then(() => undefined, () => undefined), [
      frame({ mouthSmileLeft: 0.02, mouthSmileRight: 0.01 }),
      frame({ mouthSmileLeft: 0.03, mouthSmileRight: 0.02 }),
      frame({ mouthSmileLeft: 0.04, mouthSmileRight: 0.02 }),
    ]);
    await expect(result).rejects.toMatchObject({ code: 'QUALITY_TOO_LOW' });
  });

  it('uses the median of per-rep peaks, not all frame activations', async () => {
    const result = CalibrationFlow.captureComfortableMax('EX_SMILE');
    await captureThreeWithFrames(result, [
      [frame({ mouthSmileLeft: 0.2, mouthSmileRight: 0.2 }), frame({ mouthSmileLeft: 0.5, mouthSmileRight: 0.2 })],
      [frame({ mouthSmileLeft: 0.3, mouthSmileRight: 0.2 }), frame({ mouthSmileLeft: 0.7, mouthSmileRight: 0.2 })],
      [frame({ mouthSmileLeft: 0.4, mouthSmileRight: 0.2 }), frame({ mouthSmileLeft: 0.9, mouthSmileRight: 0.2 })],
    ]);

    await expect(result).resolves.toBe(0.7);
  });

  it("discards the previous run's comfortable-max when captureNeutral restarts (I1 regression)", async () => {
    await captureThree(CalibrationFlow.captureNeutral(), [frame(), frame(), frame()]);
    await captureThree(CalibrationFlow.captureComfortableMax('EX_SMILE'), [
      frame({ mouthSmileLeft: 0.5, mouthSmileRight: 0.5 }),
      frame({ mouthSmileLeft: 0.7, mouthSmileRight: 0.7 }),
      frame({ mouthSmileLeft: 0.9, mouthSmileRight: 0.9 }),
    ]);

    await captureThree(CalibrationFlow.captureNeutral(), [frame(), frame(), frame()]);

    await expect(CalibrationFlow.runNoiseFloorSelfTest()).rejects.toMatchObject({ code: 'NO_BASELINE' });
  });

  it('rejects a comfortable-max that never clears the RESTING activation (nonzero neutral read)', async () => {
    // Pairs like eyeBlink/browOuterUp read well above zero on a neutral face; a peak barely
    // above that resting read is a held-still capture, not a gentle rep. The floor is applied
    // to (median peak − neutralActivation), never to the absolute peak.
    await captureThree(CalibrationFlow.captureNeutral(), [
      frame({ mouthSmileLeft: 0.3, mouthSmileRight: 0.3 }),
      frame({ mouthSmileLeft: 0.3, mouthSmileRight: 0.3 }),
      frame({ mouthSmileLeft: 0.3, mouthSmileRight: 0.3 }),
    ]);
    const result = CalibrationFlow.captureComfortableMax('EX_SMILE');
    await captureThree(result.then(() => undefined, () => undefined), [
      frame({ mouthSmileLeft: 0.33, mouthSmileRight: 0.33 }),
      frame({ mouthSmileLeft: 0.32, mouthSmileRight: 0.32 }),
      frame({ mouthSmileLeft: 0.34, mouthSmileRight: 0.34 }),
    ]);
    await expect(result).rejects.toMatchObject({ code: 'QUALITY_TOO_LOW' });
  });

  it('persists neutralActivation from the neutral windows on the saved baseline', async () => {
    await captureThree(CalibrationFlow.captureNeutral(), [
      frame({ mouthSmileLeft: 0.3, mouthSmileRight: 0.1 }),
      frame({ mouthSmileLeft: 0.3, mouthSmileRight: 0.1 }),
      frame({ mouthSmileLeft: 0.3, mouthSmileRight: 0.1 }),
    ]);
    await captureThree(CalibrationFlow.captureComfortableMax('EX_SMILE'), [
      frame({ mouthSmileLeft: 0.5, mouthSmileRight: 0.5 }),
      frame({ mouthSmileLeft: 0.7, mouthSmileRight: 0.7 }),
      frame({ mouthSmileLeft: 0.9, mouthSmileRight: 0.9 }),
    ]);
    const noise = CalibrationFlow.runNoiseFloorSelfTest();
    await waitForSubscriber();
    emit(frame({ mouthSmileLeft: 0.5, mouthSmileRight: 0.5 }), 0);
    emit(frame({ mouthSmileLeft: 0.5, mouthSmileRight: 0.5 }), thresholds.calibration.captureSeconds * 1000);
    await noise;

    // Median resting max(mL,mR) over the neutral frames: max(0.3, 0.1) = 0.3 on every frame.
    expect((await StorageService.getActiveBaseline())?.neutralActivation).toEqual({ EX_SMILE: 0.3 });
  });

  it('rejects EX_PUCKER without a blendshape pair', async () => {
    await expect(CalibrationFlow.captureComfortableMax('EX_PUCKER')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('persists a zero symmetry noise floor for a constant stream', async () => {
    const neutral = CalibrationFlow.captureNeutral();
    await captureThree(neutral, [frame(), frame(), frame()]);
    const maximum = CalibrationFlow.captureComfortableMax('EX_SMILE');
    await captureThree(maximum, [
      frame({ mouthSmileLeft: 0.5, mouthSmileRight: 0.5 }),
      frame({ mouthSmileLeft: 0.7, mouthSmileRight: 0.7 }),
      frame({ mouthSmileLeft: 0.9, mouthSmileRight: 0.9 }),
    ]);

    const noise = CalibrationFlow.runNoiseFloorSelfTest();
    await waitForSubscriber();
    emit(frame({ mouthSmileLeft: 0.5, mouthSmileRight: 0.5 }), 0);
    emit(frame({ mouthSmileLeft: 0.5, mouthSmileRight: 0.5 }), thresholds.calibration.captureSeconds * 1000);

    await expect(noise).resolves.toBeCloseTo(0);
    expect((await StorageService.getActiveBaseline())?.noiseFloorSymmetry).toBeCloseTo(0);
  });

  it('persists the trailing-median SI noise of an alternating stream', async () => {
    await captureThree(CalibrationFlow.captureNeutral(), [frame(), frame(), frame()]);
    await captureThree(CalibrationFlow.captureComfortableMax('EX_SMILE'), [
      frame({ mouthSmileLeft: 0.5, mouthSmileRight: 0.5 }),
      frame({ mouthSmileLeft: 0.7, mouthSmileRight: 0.7 }),
      frame({ mouthSmileLeft: 0.9, mouthSmileRight: 0.9 }),
    ]);
    const noise = CalibrationFlow.runNoiseFloorSelfTest();
    await captureOne(noise, [
      frame({ mouthSmileLeft: 1, mouthSmileRight: 1 }),
      frame({ mouthSmileLeft: 1, mouthSmileRight: 0.5 }),
    ]);

    // The 3 s sample gap resets MetricEngine's 250 ms smoothing window: SI values are 1 and 0.5,
    // whose population std is 0.25.
    await expect(noise).resolves.toBeCloseTo(0.25);
  });

  // M5 (Gate 0 T7): runNoiseFloorSelfTest pins NormalizationLayer/MetricEngine to a throwaway
  // makeBaseline(0) baseline to measure the noise floor, then saves the corrected baseline
  // but used to leave both engines pinned to the throwaway. Assert on observable behaviour
  // (NormalizationLayer.normalize throwing NO_BASELINE), not on internals: MetricEngine has no
  // clearBaseline (none is added), so this only proves NormalizationLayer is actually cleared.
  it('clears NormalizationLayer after a successful self-test (does not leave it pinned to the throwaway baseline)', async () => {
    await persistBaseline();

    const approved = QualityMonitor.evaluate(video, frame({ mouthSmileLeft: 0.5, mouthSmileRight: 0.5 }, 0));
    if (approved.state !== 'QUALITY_OK') throw new Error('test setup: expected QUALITY_OK frame');

    expect(() => NormalizationLayer.normalize(approved.frame)).toThrow(
      expect.objectContaining({ code: 'NO_BASELINE' }),
    );
  });

  it('reports ok for identical drift frames and recalibrate for shifted features', async () => {
    await persistBaseline();
    vi.spyOn(StorageService, 'getActiveBaseline').mockResolvedValue((await StorageService.getActiveBaseline())!);
    QualityMonitor.evaluate(video, null);
    const ok = CalibrationFlow.checkBaselineDrift();
    await captureOne(ok, [frame(), frame()]);
    await expect(ok).resolves.toBe('ok');

    const shifted = frame();
    for (const index of [334, 105, 386, 374, 159, 145, 291, 61, 308, 78]) {
      shifted.landmarks[index] = { ...shifted.landmarks[index]!, y: shifted.landmarks[index]!.y + 0.2 };
    }
    QualityMonitor.evaluate(video, null);
    const drift = CalibrationFlow.checkBaselineDrift();
    await captureOne(drift, [shifted, shifted]);
    await expect(drift).resolves.toBe('recalibrate');
  });

  it('persists the actual neutral QUALITY_OK fraction', async () => {
    const neutral = CalibrationFlow.captureNeutral();
    await captureThreeWithFrames(neutral, [
      [frame({}, 0), frame({}, 0), frame({}, 0), frame({}, 0)],
      [frame({}, 0), frame({}, 0), frame({}, 0)],
      [Object.assign(frame({}, 0), { facePresent: false }), frame({}, 0), frame({}, 0)],
    ]);
    await captureThree(CalibrationFlow.captureComfortableMax('EX_SMILE'), [
      frame({ mouthSmileLeft: 0.5, mouthSmileRight: 0.5 }),
      frame({ mouthSmileLeft: 0.7, mouthSmileRight: 0.7 }),
      frame({ mouthSmileLeft: 0.9, mouthSmileRight: 0.9 }),
    ]);
    await captureOne(CalibrationFlow.runNoiseFloorSelfTest(), [
      frame({ mouthSmileLeft: 0.5, mouthSmileRight: 0.5 }),
      frame({ mouthSmileLeft: 0.5, mouthSmileRight: 0.5 }),
    ]);

    expect((await StorageService.getActiveBaseline())?.qualityScore).toBeCloseTo(0.9);
  });

  // I2 regression. The capture window used to open and close off lf.timestampMs behind an
  // `lf &&` guard, so a stream where every frame fails inference (lf === null) never opened
  // and never closed the window, captureFor hung forever. The window now runs off the raw
  // CaptureService timestamp, so the capture always terminates on schedule.
  it(
    'terminates a drift capture in which every frame fails inference',
    async () => {
      await persistBaseline();
      QualityMonitor.evaluate(video, null);
      const drift = CalibrationFlow.checkBaselineDrift();
      await waitForSubscriber();
      emit(null, 0);
      emit(null, thresholds.calibration.captureSeconds * 1000);

      await expect(drift).rejects.toMatchObject({ code: 'QUALITY_TOO_LOW' });
    },
    2000,
  );

  it('reports NO_BASELINE for drift checks without an active baseline', async () => {
    await expect(CalibrationFlow.checkBaselineDrift()).rejects.toMatchObject({ code: 'NO_BASELINE' });
  });

  it('blocks every method when unattested outside demo mode', async () => {
    safety.isAttested.mockResolvedValue(false);
    await expect(CalibrationFlow.captureNeutral()).rejects.toMatchObject({ code: 'NOT_ATTESTED' });
    await expect(CalibrationFlow.captureComfortableMax('EX_SMILE')).rejects.toMatchObject({ code: 'NOT_ATTESTED' });
    await expect(CalibrationFlow.runNoiseFloorSelfTest()).rejects.toMatchObject({ code: 'NOT_ATTESTED' });
    await expect(CalibrationFlow.checkBaselineDrift()).rejects.toMatchObject({ code: 'NOT_ATTESTED' });
  });
});
