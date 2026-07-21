import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalibrationBaseline, ExerciseId, UserProfile } from '../../src/data/schema.ts';
import { MirrorWellError } from '../../src/data/errors.ts';
import { aggregateNeutral, measureAbsolute, type NeutralStats } from '../../src/metrics/geometry.ts';
import type { LandmarkFrame } from '../../src/sensing/landmarks.ts';
import { thresholds } from '../../src/config/thresholds.ts';
import { exercises } from '../../src/config/exercises.ts';

// Test isolation: SessionController, CalibrationFlow, MetricEngine, RepDetector,
// NormalizationLayer and QualityMonitor all hold module-level state with no public reset, so
// it bled between tests. Each test gets a fresh module graph via vi.resetModules() + dynamic
// import in beforeEach — no test-only reset() is added to the production contract. Every
// stateful collaborator that is spied on or mutated here must come from the SAME fresh graph
// (a spy on a stale instance would target a module the unit under test no longer uses), hence
// the re-imports below. Pure config/value modules (thresholds, exercises, geometry,
// MirrorWellError) stay statically imported — nothing compares their identity.
let SessionController: typeof import('../../src/session/controller.ts').SessionController;
let SafetyGate: typeof import('../../src/session/safety.ts').SafetyGate;
let StorageService: typeof import('../../src/data/storage.ts').StorageService;
let CalibrationFlow: typeof import('../../src/session/calibration.ts').CalibrationFlow;
let MetricEngine: typeof import('../../src/metrics/metrics.ts').MetricEngine;
let NormalizationLayer: typeof import('../../src/metrics/normalize.ts').NormalizationLayer;
let RepDetector: typeof import('../../src/metrics/reps.ts').RepDetector;
let QualityMonitor: typeof import('../../src/sensing/quality.ts').QualityMonitor;
let db: typeof import('../../src/data/schema.ts').db;

// Mocks mirror src/session/calibration.ts's own test pattern (tests/unit/calibration.test.ts):
// production wires CaptureService + LandmarkEngine; tests replace both modules so frames are
// driven synthetically by frame-timestamp only (no wall-clock timers).
const capture = vi.hoisted(() => ({
  subscribers: new Set<(video: HTMLVideoElement, timestampMs: number) => void>(),
  running: false,
  /** Fired synchronously by a successful start() — the only way frames reach a subscriber in
   * these tests, mirroring production where CaptureService.tick() fans out only while running. */
  onStart: null as (() => void) | null,
  start: vi.fn(),
  stop: vi.fn(),
}));
const landmarkState = vi.hoisted(() => ({ current: null as LandmarkFrame | null, throwError: false }));

vi.mock('../../src/sensing/capture.ts', () => ({
  CaptureService: {
    onFrame: (cb: (video: HTMLVideoElement, timestampMs: number) => void) => {
      capture.subscribers.add(cb);
      return () => capture.subscribers.delete(cb);
    },
    // Models the real service's ownership flag: start() sets `running` (on success only),
    // stop() clears it, isRunning() reports it — so src/session/frames.ts's
    // start-if-not-running / stop-only-if-I-started logic is genuinely exercised.
    start: async (...args: unknown[]) => {
      await capture.start(...args);
      capture.running = true;
      capture.onStart?.();
    },
    stop: (...args: unknown[]) => {
      capture.running = false;
      capture.stop(...args);
    },
    isRunning: () => capture.running,
  },
}));
vi.mock('../../src/sensing/landmarks.ts', () => ({
  LandmarkEngine: {
    detect: (_video: HTMLVideoElement, timestampMs: number) => {
      if (landmarkState.throwError) throw new Error('inference failed (test)');
      if (!landmarkState.current) throw new Error('no frame queued (test)');
      return { ...landmarkState.current, timestampMs };
    },
  },
}));

const VIDEO = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const BASELINE_ID = '22222222-2222-4222-8222-222222222222';

let uuidCounter = 0;
function nextUuid(): string {
  uuidCounter += 1;
  return `aaaaaaaa-aaaa-4aaa-8aaa-${uuidCounter.toString(16).padStart(12, '0')}`;
}

function landmarkFrame(blendshapes: Record<string, number> = {}, timestampMs = 0): LandmarkFrame {
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

function fireSubscribers(ts: number): void {
  for (const cb of [...capture.subscribers]) cb(VIDEO, ts);
}

/** A QUALITY_OK frame at `ts` carrying the given per-side blendshape scores. */
function emitOk(blendshapes: Record<string, number>, ts: number): void {
  landmarkState.current = landmarkFrame(blendshapes, ts);
  fireSubscribers(ts);
}

/** A non-OK (FACE_LOST) frame at `ts` — never reaches metrics. */
function emitNonOk(ts: number): void {
  landmarkState.current = { ...landmarkFrame({}, ts), facePresent: false };
  fireSubscribers(ts);
}

function makeProfile(assignedExercises: ExerciseId[]): UserProfile {
  return {
    profileId: PROFILE_ID,
    createdAt: '2026-07-01T09:00:00.000Z',
    affectedSide: 'left',
    assignedExercises,
    attestedAt: '2026-07-01T09:00:00.000Z',
    consentVersion: '1',
  };
}

/** The neutral stats the synthetic `landmarkFrame()` geometry actually measures — a baseline
 * carrying these makes the REAL drift check report 'ok' (zero displacement). */
function syntheticNeutralStats(): NeutralStats {
  const result = QualityMonitor.evaluate(VIDEO, landmarkFrame({}, 0));
  if (result.state !== 'QUALITY_OK') throw new Error(`synthetic frame is ${result.state}`);
  return aggregateNeutral([measureAbsolute(result.frame)]);
}

function makeBaseline(comfortableMax: Partial<Record<ExerciseId, number>>, neutralStats?: NeutralStats): CalibrationBaseline {
  const zero = { left: { u: 0, v: 0 }, right: { u: 0, v: 0 } };
  return {
    baselineId: BASELINE_ID,
    profileId: PROFILE_ID,
    capturedAt: '2026-07-01T09:05:00.000Z',
    neutralStats: neutralStats ?? {
      REGION_BROW: zero,
      REGION_EYELID: zero,
      REGION_MOUTH_CORNER: zero,
      REGION_LIP: zero,
    },
    comfortableMax,
    qualityScore: 0.9,
    noiseFloorSymmetry: 0.01,
    noiseFloorDisplacement: 0.01,
    isActive: 1,
  };
}

/** Seeds a real (fake-indexeddb) profile + active baseline (comfortableMax = 1 for each
 * assigned exercise, so effortIndex === raw blendshape activation) and stubs the gate to
 * ATTESTED with a passing drift check. */
async function seedAttested(
  assignedExercises: ExerciseId[] = ['EX_SMILE', 'EX_EYE_CLOSURE'],
  stubDrift = true,
): Promise<void> {
  await StorageService.saveProfile(makeProfile(assignedExercises));
  const comfortableMax = Object.fromEntries(assignedExercises.map((id) => [id, 1])) as Partial<Record<ExerciseId, number>>;
  // When the drift check is NOT stubbed it runs for real against this baseline, so seed the
  // stats the synthetic frames actually measure (zero drift -> 'ok').
  await StorageService.saveBaseline(makeBaseline(comfortableMax, stubDrift ? undefined : syntheticNeutralStats()));
  vi.spyOn(SafetyGate, 'isAttested').mockResolvedValue(true);
  vi.spyOn(SafetyGate, 'isDemoMode').mockReturnValue(false);
  if (stubDrift) vi.spyOn(CalibrationFlow, 'checkBaselineDrift').mockResolvedValue('ok');
}

/**
 * Drives one deterministic rep via MetricEngine's trailing-5-median smoothing: `holdCount`
 * (>= 1) high-activation (0.3/0.3, symmetric) frames followed by exactly 3 low-activation
 * (0.02/0.02) frames reliably crosses reps.startThreshold on the first frame and reps.endThreshold
 * on the 3rd trailing low frame, regardless of `holdCount` (verified: a 5-window trailing
 * median needs at most 3 low values to out-vote any number of prior highs). `nonOkCount`
 * non-OK frames are inserted immediately after the start frame (order doesn't affect the
 * resulting OK-frame fraction, only the count) to exercise the rep-discard threshold.
 * Frames are spaced <= 250ms apart (metrics.gapResetMs / reps gap rule) so the smoothing
 * window and RepDetector's active span survive intact. Returns the final frame's timestamp.
 */
function driveOkRepFrames(pair: { left: string; right: string }, startTs: number, okCount: number, nonOkCount: number): number {
  if (okCount < 4) throw new Error('driveOkRepFrames needs okCount >= 4 (1+ hold, 3 drop)');
  const holdCount = okCount - 3;
  let ts = startTs;
  emitOk({ [pair.left]: 0.3, [pair.right]: 0.3 }, ts);
  for (let i = 0; i < nonOkCount; i++) {
    ts += 1;
    emitNonOk(ts);
  }
  for (let i = 1; i < holdCount; i++) {
    ts += 200;
    emitOk({ [pair.left]: 0.3, [pair.right]: 0.3 }, ts);
  }
  for (let i = 0; i < 3; i++) {
    ts += 200;
    emitOk({ [pair.left]: 0.02, [pair.right]: 0.02 }, ts);
  }
  return ts;
}

const unsubs: Array<() => void> = [];
function on<E extends Parameters<typeof SessionController.on>[0]>(
  event: E,
  cb: (payload: any) => void,
): void {
  unsubs.push(SessionController.on(event, cb));
}

beforeEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
  ({ SessionController } = await import('../../src/session/controller.ts'));
  ({ SafetyGate } = await import('../../src/session/safety.ts'));
  ({ StorageService } = await import('../../src/data/storage.ts'));
  ({ CalibrationFlow } = await import('../../src/session/calibration.ts'));
  ({ MetricEngine } = await import('../../src/metrics/metrics.ts'));
  ({ NormalizationLayer } = await import('../../src/metrics/normalize.ts'));
  ({ RepDetector } = await import('../../src/metrics/reps.ts'));
  ({ QualityMonitor } = await import('../../src/sensing/quality.ts'));
  ({ db } = await import('../../src/data/schema.ts'));
  capture.subscribers.clear();
  capture.running = false;
  capture.onStart = null;
  capture.start.mockReset().mockResolvedValue(undefined);
  capture.stop.mockReset();
  landmarkState.current = null;
  landmarkState.throwError = false;
  uuidCounter = 0;
  vi.stubGlobal('crypto', { randomUUID: nextUuid });
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({
        drawImage: () => undefined,
        getImageData: () => ({ data: new Uint8ClampedArray(64 * 64 * 4).fill(200) }),
      }),
    }),
  });
  await StorageService.deleteAllData();
});

afterEach(() => {
  while (unsubs.length) unsubs.pop()!();
});

describe('SessionController preconditions', () => {
  it('checks attestation before baseline', async () => {
    vi.spyOn(SafetyGate, 'isAttested').mockResolvedValue(false);
    vi.spyOn(SafetyGate, 'isDemoMode').mockReturnValue(false);
    const baselineSpy = vi.spyOn(StorageService, 'getActiveBaseline');
    await expect(SessionController.start(['EX_SMILE'])).rejects.toMatchObject({ code: 'NOT_ATTESTED' });
    expect(baselineSpy).not.toHaveBeenCalled();
  });

  it('rejects missing baseline', async () => {
    vi.spyOn(SafetyGate, 'isAttested').mockResolvedValue(true);
    vi.spyOn(SafetyGate, 'isDemoMode').mockReturnValue(false);
    vi.spyOn(StorageService, 'getActiveBaseline').mockResolvedValue(null);
    await expect(SessionController.start(['EX_SMILE'])).rejects.toMatchObject({ code: 'NO_BASELINE' });
  });

  it('rejects invalid exercise lists without touching storage', async () => {
    vi.spyOn(SafetyGate, 'isAttested').mockResolvedValue(true);
    vi.spyOn(SafetyGate, 'isDemoMode').mockReturnValue(false);
    const baselineSpy = vi.spyOn(StorageService, 'getActiveBaseline');
    await expect(SessionController.start([])).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(SessionController.start(['EX_PUCKER'])).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(baselineSpy).not.toHaveBeenCalled();
  });

  it('rejects a drift recalibration signal', async () => {
    await seedAttested(['EX_SMILE']);
    vi.spyOn(CalibrationFlow, 'checkBaselineDrift').mockResolvedValue('recalibrate');
    await expect(SessionController.start(['EX_SMILE'])).rejects.toMatchObject({ code: 'RECALIBRATION_REQUIRED' });
  });

  it('rejects an exercise not assigned to the profile', async () => {
    await seedAttested(['EX_SMILE']); // profile.assignedExercises = ['EX_SMILE'] only
    await expect(SessionController.start(['EX_SMILE', 'EX_BROW_RAISE'])).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('skips the storage baseline/drift checks in demo mode', async () => {
    vi.spyOn(SafetyGate, 'isAttested').mockResolvedValue(false);
    vi.spyOn(SafetyGate, 'isDemoMode').mockReturnValue(true);
    const baselineSpy = vi.spyOn(StorageService, 'getActiveBaseline');
    const driftSpy = vi.spyOn(CalibrationFlow, 'checkBaselineDrift');
    MetricEngine.setBaseline(makeBaseline({ EX_SMILE: 1 }));
    NormalizationLayer.setBaseline(makeBaseline({ EX_SMILE: 1 }));

    await SessionController.start(['EX_SMILE']);

    expect(baselineSpy).not.toHaveBeenCalled();
    expect(driftSpy).not.toHaveBeenCalled();
    await SessionController.stop('user_stopped');
  });

  // C1 regression. The real (unstubbed) drift path: CalibrationFlow.checkBaselineDrift()
  // awaits a frame window, and nothing before it ever started the camera — so on every
  // attested session start() used to hang forever. Frames here only flow from a successful
  // CaptureService.start() (capture.onStart), exactly like production, so the deadlock is
  // reproducible; the per-test timeout turns a regression into a failure, not a hung suite.
  it(
    'completes start() on the real drift path — the drift check owns and releases the camera',
    async () => {
      await seedAttested(['EX_SMILE'], false);
      capture.onStart = () => {
        capture.onStart = null; // bounded: one window's worth of frames, fired once
        emitOk({}, 0);
        emitOk({}, thresholds.calibration.captureSeconds * 1000);
      };
      const seen: Array<{ exerciseId: string; state: string }> = [];
      on('stateChanged', (p) => seen.push(p));

      await SessionController.start(['EX_SMILE']);

      expect(seen.at(-1)).toEqual({ exerciseId: 'EX_SMILE', state: 'DEMO' });
      // Drift started the camera and stopped it (it owned it); the session then started it
      // again for itself.
      expect(capture.start).toHaveBeenCalledTimes(2);
      expect(capture.stop).toHaveBeenCalledTimes(1);
      await SessionController.stop('user_stopped');
    },
    2000,
  );

  it('propagates CAMERA_DENIED from camera start and unsubscribes the frame source', async () => {
    await seedAttested(['EX_SMILE']);
    capture.start.mockRejectedValueOnce(new MirrorWellError('CAMERA_DENIED', 'denied'));

    await expect(SessionController.start(['EX_SMILE'])).rejects.toMatchObject({ code: 'CAMERA_DENIED' });
    expect(capture.subscribers.size).toBe(0);
    // A rejected start() acquires nothing (capture.ts leaves stream === null), so the seam must
    // NOT call stop() on the failed-start path — that could tear down a camera another consumer
    // owns (frames.ts finding 1). Unsubscribe is the whole cleanup; subscribers.size === 0 above.
    expect(capture.stop).not.toHaveBeenCalled();
  });
});

describe('SessionController hot path', () => {
  it('walks stateChanged DEMO->REPS->REST->DEMO(next)->...->auto-stop completed', async () => {
    await seedAttested(['EX_EYE_CLOSURE', 'EX_SMILE']);
    const seen: Array<{ exerciseId: string; state: string }> = [];
    on('stateChanged', (p) => seen.push(p));
    const ended = vi.fn();
    on('sessionEnded', ended);

    await SessionController.start(['EX_EYE_CLOSURE', 'EX_SMILE']);
    expect(seen.at(-1)).toEqual({ exerciseId: 'EX_EYE_CLOSURE', state: 'DEMO' });

    SessionController.advance();
    expect(seen.at(-1)).toEqual({ exerciseId: 'EX_EYE_CLOSURE', state: 'REPS' });

    let ts = 1000;
    for (let i = 0; i < exercises.EX_EYE_CLOSURE.repsPerSet; i++) {
      ts = driveOkRepFrames(exercises.EX_EYE_CLOSURE.blendshapePair!, ts + 2000, 6, 0);
    }
    expect(seen.at(-1)).toEqual({ exerciseId: 'EX_EYE_CLOSURE', state: 'REST' });

    SessionController.advance(); // ends REST early -> next exercise's DEMO
    expect(seen.at(-1)).toEqual({ exerciseId: 'EX_SMILE', state: 'DEMO' });

    SessionController.advance();
    expect(seen.at(-1)).toEqual({ exerciseId: 'EX_SMILE', state: 'REPS' });

    for (let i = 0; i < exercises.EX_SMILE.repsPerSet; i++) {
      ts = driveOkRepFrames(exercises.EX_SMILE.blendshapePair!, ts + 2000, 6, 0);
    }
    expect(seen.at(-1)).toEqual({ exerciseId: 'EX_SMILE', state: 'REST' });

    // Deadline passes on the last exercise's REST -> auto-stop('completed'). stopSession()
    // awaits StorageService.saveSession (async IndexedDB work), so give it a tick.
    emitOk({}, ts + exercises.EX_SMILE.restSeconds * 1000 + 10);
    await vi.waitFor(() => expect(ended).toHaveBeenCalledTimes(1));
    const record = ended.mock.calls[0]![0].record;
    expect(record.endReason).toBe('completed');
    expect(record.results).toHaveLength(2);
    expect(record.results[0]!.exerciseId).toBe('EX_EYE_CLOSURE');
    expect(record.results[0]!.repsCompleted).toBe(exercises.EX_EYE_CLOSURE.repsPerSet);
    expect(record.results[1]!.exerciseId).toBe('EX_SMILE');
    expect(record.results[1]!.repsCompleted).toBe(exercises.EX_SMILE.repsPerSet);
  });

  it('throttles metricUpdate to <= 15 events under a 30Hz synthetic frame stream', async () => {
    await seedAttested(['EX_SMILE']);
    await SessionController.start(['EX_SMILE']);
    SessionController.advance();
    const updates: unknown[] = [];
    on('metricUpdate', (p) => updates.push(p));

    for (let i = 0; i < 30; i++) {
      emitOk({ mouthSmileLeft: 0.1, mouthSmileRight: 0.1 }, i * 33);
    }

    expect(updates.length).toBeGreaterThan(0);
    expect(updates.length).toBeLessThanOrEqual(15);
  });

  it('discards a rep at 50% OK frames and keeps one at 70%', async () => {
    await seedAttested(['EX_SMILE']);
    await SessionController.start(['EX_SMILE']);
    SessionController.advance();
    const completed = vi.fn();
    on('repCompleted', completed);

    const afterFirst = driveOkRepFrames(exercises.EX_SMILE.blendshapePair!, 0, 5, 5); // 50% -> discard
    expect(completed).not.toHaveBeenCalled();

    driveOkRepFrames(exercises.EX_SMILE.blendshapePair!, afterFirst + 2000, 7, 3); // 70% -> keep
    expect(completed).toHaveBeenCalledTimes(1);
  });

  it('holds the discard threshold exactly at reps.minQualityFramePct (59% discarded, 60% kept)', async () => {
    expect(thresholds.reps.minQualityFramePct).toBe(0.6);
    await seedAttested(['EX_SMILE']);
    await SessionController.start(['EX_SMILE']);
    SessionController.advance();
    const completed = vi.fn();
    on('repCompleted', completed);

    const afterFirst = driveOkRepFrames(exercises.EX_SMILE.blendshapePair!, 0, 59, 41); // 0.59 -> discard
    expect(completed).not.toHaveBeenCalled();

    driveOkRepFrames(exercises.EX_SMILE.blendshapePair!, afterFirst + 2000, 60, 40); // 0.60 -> keep
    expect(completed).toHaveBeenCalledTimes(1);
  });

  it('offers stop after 30s continuous non-OK in REPS and clears on recovery', async () => {
    await seedAttested(['EX_SMILE']);
    await SessionController.start(['EX_SMILE']);
    SessionController.advance();
    const visibility: boolean[] = [];
    on('qualityOfferStop', (p) => visibility.push(p.visible));

    emitNonOk(0);
    emitNonOk(thresholds.session.qualityProblemOfferStopMs - 1);
    expect(visibility).toEqual([]);

    emitNonOk(thresholds.session.qualityProblemOfferStopMs);
    expect(visibility).toEqual([true]);

    emitOk({ mouthSmileLeft: 0.2, mouthSmileRight: 0.2 }, thresholds.session.qualityProblemOfferStopMs + 100);
    expect(visibility).toEqual([true, false]);
  });

  it('mirrors isEaseOffActive() transitions exactly once per transition', async () => {
    await seedAttested(['EX_SMILE']);
    await SessionController.start(['EX_SMILE']);
    SessionController.advance();
    const seen: boolean[] = [];
    on('easeOff', (p) => seen.push(p.active));

    emitOk({ mouthSmileLeft: 0.8, mouthSmileRight: 0.8 }, 0);
    emitOk({ mouthSmileLeft: 0.8, mouthSmileRight: 0.8 }, 100);
    emitOk({ mouthSmileLeft: 0.8, mouthSmileRight: 0.8 }, 200);
    expect(seen).toEqual([]);
    emitOk({ mouthSmileLeft: 0.8, mouthSmileRight: 0.8 }, 300); // sustained >= 300ms -> active
    expect(seen).toEqual([true]);

    // MetricEngine.isEaseOffActive() reads the SMOOTHED (5-trailing-median) effortIndex, so
    // dropping it back below threshold needs enough low frames to out-vote the window's highs
    // (same trailing-median mechanics as the rep-ending sequence: 3 lows always suffice).
    emitOk({ mouthSmileLeft: 0.1, mouthSmileRight: 0.1 }, 400);
    emitOk({ mouthSmileLeft: 0.1, mouthSmileRight: 0.1 }, 500);
    expect(seen).toEqual([true]);
    emitOk({ mouthSmileLeft: 0.1, mouthSmileRight: 0.1 }, 600);
    expect(seen).toEqual([true, false]);
  });

  it('resets MetricEngine/RepDetector on exercise transition; no metric state leaks between exercises', async () => {
    await seedAttested(['EX_EYE_CLOSURE', 'EX_SMILE']);
    await SessionController.start(['EX_EYE_CLOSURE', 'EX_SMILE']);
    SessionController.advance();

    // Asymmetric leak probe: sub-startThreshold (no rep triggered) but leaves a distinctly
    // asymmetric entry in MetricEngine's smoothing window.
    emitOk({ eyeBlinkLeft: 0.14, eyeBlinkRight: 0.02 }, 0);

    let ts = 2000;
    for (let i = 0; i < exercises.EX_EYE_CLOSURE.repsPerSet; i++) {
      ts = driveOkRepFrames(exercises.EX_EYE_CLOSURE.blendshapePair!, ts, 6, 0) + 2000;
    }
    const lastComputedTs = ts - 2000;

    const metricResetSpy = vi.spyOn(MetricEngine, 'reset');
    const repResetSpy = vi.spyOn(RepDetector, 'reset');

    SessionController.advance(); // REST -> DEMO(EX_SMILE): must call both resets
    expect(metricResetSpy).toHaveBeenCalledTimes(1);
    expect(repResetSpy).toHaveBeenCalledTimes(1);

    SessionController.advance(); // DEMO -> REPS(EX_SMILE)
    const samples: Array<{ symmetryIndex: number | null }> = [];
    on('metricUpdate', (p) => samples.push(p.sample));
    // Small gap (<= metrics.gapResetMs) from the last EX_EYE_CLOSURE compute — if reset()
    // were skipped, the leaked asymmetric window entry would still be live here.
    emitOk({ mouthSmileLeft: 0.3, mouthSmileRight: 0.3 }, lastComputedTs + 50);
    expect(samples[0]!.symmetryIndex).toBe(1);
  });

  it('treats a thrown detect() (INFERENCE_FAILED) as a non-crashing FACE_LOST frame', async () => {
    await seedAttested(['EX_SMILE']);
    await SessionController.start(['EX_SMILE']);
    SessionController.advance();
    const seenQuality: string[] = [];
    on('qualityUpdate', (p) => seenQuality.push(p.state));

    landmarkState.throwError = true;
    expect(() => emitOk({}, 0)).not.toThrow();
    expect(seenQuality).toEqual(['FACE_LOST']);
  });

  it('propagates a downstream pipeline error instead of swallowing it as a phantom FACE_LOST frame', async () => {
    await seedAttested(['EX_SMILE']);
    await SessionController.start(['EX_SMILE']);
    SessionController.advance();
    const seenQuality: string[] = [];
    on('qualityUpdate', (p) => seenQuality.push(p.state));

    // detect() succeeds (a real OK frame) but the downstream pipeline (MetricEngine.compute)
    // throws. The narrowed frameSource try/catch only wraps LandmarkEngine.detect, so this
    // must propagate out of the frame callback rather than being caught and re-dispatched as
    // a FACE_LOST frame.
    vi.spyOn(MetricEngine, 'compute').mockImplementationOnce(() => {
      throw new MirrorWellError('NO_BASELINE', 'forced test failure');
    });

    expect(() => emitOk({ mouthSmileLeft: 0.3, mouthSmileRight: 0.3 }, 0)).toThrow();
    expect(seenQuality).not.toContain('FACE_LOST');
  });

  it('extendRest(seconds) lengthens the REST deadline; no API exists to shorten it', async () => {
    await seedAttested(['EX_EYE_CLOSURE', 'EX_SMILE']);
    await SessionController.start(['EX_EYE_CLOSURE', 'EX_SMILE']);
    SessionController.advance();

    let ts = 0;
    for (let i = 0; i < exercises.EX_EYE_CLOSURE.repsPerSet; i++) {
      ts = driveOkRepFrames(exercises.EX_EYE_CLOSURE.blendshapePair!, ts, 6, 0) + 2000;
    }
    const lastRepEndTs = ts - 2000;
    const originalDeadline = lastRepEndTs + exercises.EX_EYE_CLOSURE.restSeconds * 1000;

    SessionController.extendRest(10);

    const states: string[] = [];
    on('stateChanged', (p) => states.push(p.state));
    emitOk({}, originalDeadline); // would have ended REST without the extension
    expect(states).toEqual([]);

    emitOk({}, originalDeadline + 10 * 1000);
    expect(states).toEqual(['DEMO']);

    expect((SessionController as unknown as Record<string, unknown>).shortenRest).toBeUndefined();
  });
});

describe('SessionController session assembly', () => {
  it('persists a partial record on user_stopped mid-REPS with easeOffTriggered as 0|1', async () => {
    await seedAttested(['EX_SMILE']);
    await SessionController.start(['EX_SMILE']);
    SessionController.advance();
    driveOkRepFrames(exercises.EX_SMILE.blendshapePair!, 0, 7, 0);

    const record = await SessionController.stop('user_stopped');

    expect(record.endReason).toBe('user_stopped');
    expect(record.results).toHaveLength(1);
    const result = record.results[0]!;
    expect(result.repsCompleted).toBe(1);
    // All 7 driven frames are symmetric (0.3/0.3 then 0.02/0.02) -> SI smooths to 1 throughout;
    // no non-OK frames -> lowQualityFramePct 0; activation never exceeds easeOffThreshold (0.6).
    expect(result.meanSymmetryIndex).toBe(1);
    expect(result.lowQualityFramePct).toBe(0);
    expect(result.easeOffCount).toBe(0);
    const rep = result.reps[0]!;
    expect(rep.easeOffTriggered === 0 || rep.easeOffTriggered === 1).toBe(true);

    // stop() resolves a SessionRecordFull (docs/API.md §10) — results/reps carry their
    // parent keys, matching what getSessions() would return for this same session.
    expect(result.sessionId).toBe(record.sessionId);
    expect(rep.resultId).toBe(result.resultId);

    const saved = await StorageService.getSessions({ from: '2000-01-01T00:00:00.000Z', to: '2100-01-01T00:00:00.000Z' });
    expect(saved.some((s) => s.sessionId === record.sessionId)).toBe(true);
  });

  it('computes lowQualityFramePct from the non-OK frame fraction across the whole exercise', async () => {
    await seedAttested(['EX_SMILE']);
    await SessionController.start(['EX_SMILE']);
    SessionController.advance();
    // 5 OK + 5 non-OK -> rep discarded (50% < 0.6), but exerciseFrameTotal/Ok still tally
    // every REPS-state frame regardless of rep outcome: lowQualityFramePct = 5/10 = 0.5.
    driveOkRepFrames(exercises.EX_SMILE.blendshapePair!, 0, 5, 5);

    const record = await SessionController.stop('user_stopped');
    const result = record.results[0]!;
    expect(result.repsCompleted).toBe(0);
    expect(result.lowQualityFramePct).toBe(0.5);
  });

  it('does not persist anything in demo mode but still returns and emits the record', async () => {
    vi.spyOn(SafetyGate, 'isAttested').mockResolvedValue(false);
    vi.spyOn(SafetyGate, 'isDemoMode').mockReturnValue(true);
    MetricEngine.setBaseline(makeBaseline({ EX_SMILE: 1 }));
    NormalizationLayer.setBaseline(makeBaseline({ EX_SMILE: 1 }));
    await SessionController.start(['EX_SMILE']);
    SessionController.advance();
    driveOkRepFrames(exercises.EX_SMILE.blendshapePair!, 0, 7, 0);

    const ended = vi.fn();
    on('sessionEnded', ended);
    const record = await SessionController.stop('user_stopped');

    expect(record.results[0]!.repsCompleted).toBe(1);
    expect(ended).toHaveBeenCalledTimes(1);
    // Demo returns the record without persisting, but it must still be Full-shaped.
    expect(record.results[0]!.sessionId).toBe(record.sessionId);
    expect(record.results[0]!.reps[0]!.resultId).toBe(record.results[0]!.resultId);
    expect(await db.session_record.count()).toBe(0);
    expect(await db.exercise_result.count()).toBe(0);
    expect(await db.rep_metric.count()).toBe(0);
  });

  it('stop() is idempotent: two concurrent calls persist once and resolve to the same record', async () => {
    await seedAttested(['EX_SMILE']);
    await SessionController.start(['EX_SMILE']);
    SessionController.advance();
    driveOkRepFrames(exercises.EX_SMILE.blendshapePair!, 0, 7, 0);

    const ended = vi.fn();
    on('sessionEnded', ended);
    const saveSpy = vi.spyOn(StorageService, 'saveSession');

    const [a, b] = await Promise.all([
      SessionController.stop('user_stopped'),
      SessionController.stop('red_flag_stopped'), // different reason -> must be ignored
    ]);

    expect(a).toBe(b);
    expect(a.endReason).toBe('user_stopped');
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledTimes(1);

    // A third call after full completion must not re-persist or re-emit either.
    const c = await SessionController.stop('quality_abandoned');
    expect(c).toBe(a);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  // T5/M1 regression: stop() before any start() must not run session assembly against
  // empty state, must not persist, and — critically — must not poison stopPromise for a
  // session that legitimately starts and stops afterward.
  it('stop() before any start() is a no-op that touches neither storage nor the event surface', async () => {
    const saveSpy = vi.spyOn(StorageService, 'saveSession');
    const ended = vi.fn();
    on('sessionEnded', ended);

    await expect(SessionController.stop('user_stopped')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    expect(saveSpy).not.toHaveBeenCalled();
    expect(ended).not.toHaveBeenCalled();
  });

  it('repeated premature stop() calls never cache a poisoned stopPromise', async () => {
    const saveSpy = vi.spyOn(StorageService, 'saveSession');

    // Pre-fix, call #1 ran assembly and cached the resulting rejection in stopPromise
    // (saveSession count -> 1); call #2 returned that SAME cached rejection without running
    // assembly again (count stays 1, but never 0). Post-fix, each call rejects independently
    // without ever touching storage.
    await expect(SessionController.stop('user_stopped')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(SessionController.stop('quality_abandoned')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(saveSpy).not.toHaveBeenCalled();

    // And nothing is left behind to interfere with a real session afterward.
    await seedAttested(['EX_SMILE']);
    await SessionController.start(['EX_SMILE']);
    SessionController.advance();
    driveOkRepFrames(exercises.EX_SMILE.blendshapePair!, 0, 7, 0);

    const record = await SessionController.stop('user_stopped');

    expect(record.endReason).toBe('user_stopped');
    expect(record.results).toHaveLength(1);
    expect(record.sessionId).not.toBe('');
  });
});
