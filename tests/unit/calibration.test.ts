import { beforeEach, describe, expect, it, vi } from 'vitest';
import { thresholds } from '../../src/config/thresholds.ts';
import { StorageService } from '../../src/data/storage.ts';
import type { UserProfile } from '../../src/data/schema.ts';
import { CalibrationFlow } from '../../src/session/calibration.ts';
import type { LandmarkFrame } from '../../src/sensing/landmarks.ts';

const capture = vi.hoisted(() => ({ subscribers: new Set<(video: HTMLVideoElement, timestampMs: number) => void>() }));
const safety = vi.hoisted(() => ({ isAttested: vi.fn(), isDemoMode: vi.fn() }));
const frames = vi.hoisted(() => [] as (LandmarkFrame | null)[]);

vi.mock('../../src/sensing/capture.ts', () => ({
  CaptureService: {
    onFrame: (cb: (video: HTMLVideoElement, timestampMs: number) => void) => {
      capture.subscribers.add(cb);
      return () => capture.subscribers.delete(cb);
    },
    stop: vi.fn(),
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

async function captureThree(result: Promise<unknown>, values: (LandmarkFrame | null)[]): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  for (let attempt = 0; capture.subscribers.size === 0 && attempt < 10; attempt++) {
    await Promise.resolve();
  }
  const durationMs = thresholds.calibration.captureSeconds * 1000;
  for (let i = 0; i < thresholds.calibration.neutralCaptures; i++) {
    await Promise.resolve();
    await Promise.resolve();
    emit(values[i]!, i * durationMs * 2);
    emit(values[i]!, i * durationMs * 2 + durationMs);
    await Promise.resolve();
  }
  await result;
}

beforeEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  capture.subscribers.clear();
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
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    emit(frame({ mouthSmileLeft: 0.5, mouthSmileRight: 0.5 }), 0);
    emit(frame({ mouthSmileLeft: 0.5, mouthSmileRight: 0.5 }), thresholds.calibration.captureSeconds * 1000);

    await expect(noise).resolves.toBeCloseTo(0);
    expect((await StorageService.getActiveBaseline())?.noiseFloorSymmetry).toBeCloseTo(0);
  });

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
