import { EXERCISES } from '@/config/exercises';
import { thresholds } from '@/config/thresholds';
import type {
  CalibrationBaseline,
  EndReason,
  ExerciseId,
  ExerciseResultFull,
  SessionRecordFull,
  UserProfile,
} from '@/data/schema';
import { MirrorWellError } from '@/data/errors';
import { StorageService } from '@/data/storage';
import { MetricEngine } from '@/metrics/metrics';
import { RepDetector } from '@/metrics/reps';
import { SampleSmoother } from '@/metrics/smoothing';
import { NormalizationLayer } from '@/metrics/normalize';
import { CaptureService } from '@/sensing/capture';
import { LandmarkEngine } from '@/sensing/landmarks';
import { QualityMonitor } from '@/sensing/quality';
import { CalibrationFlow } from '@/session/calibration';
import { SafetyGate } from '@/session/safety';
import type { MetricSample, QualityState } from '@/types/sensing';
import type {
  RepEvent,
  SessionEventMap,
  SessionEventName,
  SessionPhase,
} from '@/types/session';

type Listener<E extends SessionEventName> = (
  payload: SessionEventMap[E],
) => void;

interface ExerciseAccumulator {
  exerciseId: ExerciseId;
  reps: RepEvent[];
  symmetrySamples: number[];
  effortSamples: number[];
  easeOffCount: number;
  okFrames: number;
  totalFrames: number;
}

const listeners: {
  [K in SessionEventName]: Set<Listener<K>>;
} = {
  stateChanged: new Set(),
  metricUpdate: new Set(),
  qualityUpdate: new Set(),
  repCompleted: new Set(),
  easeOff: new Set(),
  sessionEnded: new Set(),
  repDiscarded: new Set(),
  qualityOfferStop: new Set(),
};

let running = false;
let exerciseQueue: ExerciseId[] = [];
let exerciseIndex = 0;
let phase: SessionPhase = 'DEMO';
let profile: UserProfile | null = null;
let baseline: CalibrationBaseline | null = null;
let sessionId = '';
let startedAt = '';
let currentAccumulator: ExerciseAccumulator | null = null;
let completedResults: ExerciseAccumulator[] = [];
const smoother = new SampleSmoother();
let frameUnsubscribe: (() => void) | null = null;
let restEndsAt: number | null = null;
let restTimerId: ReturnType<typeof setInterval> | null = null;
let qualityBadSince: number | null = null;
let easeOffActive = false;
let easeOffSince: number | null = null;
let lastMetricEmitMs = 0;
let lastQuality: QualityState = 'FACE_LOST';
let comfortableMax = 1;

function emit<E extends SessionEventName>(
  event: E,
  payload: SessionEventMap[E],
): void {
  for (const cb of listeners[event] as Set<Listener<E>>) {
    cb(payload);
  }
}

function currentExerciseId(): ExerciseId {
  return exerciseQueue[exerciseIndex];
}

function comfortableMaxFor(exerciseId: ExerciseId): number {
  const value = baseline?.comfortableMax[exerciseId];
  return value !== undefined && value > 0 ? value : 1;
}

function startAccumulator(exerciseId: ExerciseId): void {
  currentAccumulator = {
    exerciseId,
    reps: [],
    symmetrySamples: [],
    effortSamples: [],
    easeOffCount: 0,
    okFrames: 0,
    totalFrames: 0,
  };
}

function clearRestTimer(): void {
  if (restTimerId !== null) {
    clearInterval(restTimerId);
    restTimerId = null;
  }
  restEndsAt = null;
}

function enterPhase(next: SessionPhase): void {
  phase = next;
  emit('stateChanged', { exerciseId: currentExerciseId(), state: next });
}

function beginRest(): void {
  clearRestTimer();
  const seconds = EXERCISES[currentExerciseId()].restSeconds;
  restEndsAt = performance.now() + seconds * 1000;
  enterPhase('REST');
  restTimerId = setInterval(() => {
    if (restEndsAt !== null && performance.now() >= restEndsAt) {
      clearRestTimer();
      advanceToNextExercise();
    }
  }, 250);
}

function advanceToNextExercise(): void {
  if (currentAccumulator) {
    completedResults.push(currentAccumulator);
    currentAccumulator = null;
  }

  RepDetector.reset();
  smoother.reset();
  easeOffActive = false;
  easeOffSince = null;
  emit('easeOff', { active: false });
  qualityBadSince = null;
  emit('qualityOfferStop', { visible: false });

  exerciseIndex += 1;
  if (exerciseIndex >= exerciseQueue.length) {
    void finishSession('completed');
    return;
  }

  startAccumulator(currentExerciseId());
  comfortableMax = comfortableMaxFor(currentExerciseId());
  enterPhase('DEMO');
}

function buildSessionRecord(endReason: EndReason): SessionRecordFull {
  const allAccumulators = [
    ...completedResults,
    ...(currentAccumulator ? [currentAccumulator] : []),
  ];

  const results: ExerciseResultFull[] = allAccumulators.map((acc) => {
    const resultId = crypto.randomUUID();
    const symmetryValues = acc.symmetrySamples;
    const effortValues = acc.effortSamples;
    const meanSymmetryIndex =
      symmetryValues.length > 0
        ? symmetryValues.reduce((a, b) => a + b, 0) / symmetryValues.length
        : null;
    const meanEffortIndex =
      effortValues.length > 0
        ? effortValues.reduce((a, b) => a + b, 0) / effortValues.length
        : null;
    const lowQualityFramePct =
      acc.totalFrames > 0
        ? (acc.totalFrames - acc.okFrames) / acc.totalFrames
        : 0;

    return {
      resultId,
      sessionId,
      exerciseId: acc.exerciseId,
      repsCompleted: acc.reps.length,
      meanSymmetryIndex,
      meanEffortIndex,
      easeOffCount: acc.easeOffCount,
      lowQualityFramePct,
      reps: acc.reps.map((rep, index) => ({
        repId: crypto.randomUUID(),
        resultId,
        repIndex: index,
        peakSymmetryIndex: rep.peakSymmetryIndex,
        peakEffortIndex: rep.peakEffortIndex,
        durationMs: rep.durationMs,
        easeOffTriggered: rep.easeOffTriggered ? 1 : 0,
      })),
    };
  });

  return {
    sessionId,
    profileId: profile!.profileId,
    baselineId: baseline!.baselineId,
    startedAt,
    endedAt: new Date().toISOString(),
    endReason,
    results,
  };
}

async function finishSession(endReason: EndReason): Promise<void> {
  stopFrameLoop();
  clearRestTimer();
  running = false;

  const record = buildSessionRecord(endReason);

  if (!SafetyGate.isDemoMode()) {
    await StorageService.saveSession(record);
  }

  emit('sessionEnded', { record });
}

function stopFrameLoop(): void {
  frameUnsubscribe?.();
  frameUnsubscribe = null;
}

function updateEaseOff(sample: MetricSample): void {
  const { easeOffThreshold, easeOffSustainMs } = thresholds.metrics;
  if (sample.effortIndex > easeOffThreshold) {
    if (easeOffSince === null) {
      easeOffSince = performance.now();
    } else if (
      !easeOffActive &&
      performance.now() - easeOffSince >= easeOffSustainMs
    ) {
      easeOffActive = true;
      RepDetector.markEaseOff();
      if (currentAccumulator) {
        currentAccumulator.easeOffCount += 1;
      }
      emit('easeOff', { active: true });
    }
  } else {
    easeOffSince = null;
    if (easeOffActive) {
      easeOffActive = false;
      emit('easeOff', { active: false });
    }
  }
}

function trackQuality(state: QualityState): void {
  if (state === lastQuality) {
    return;
  }
  lastQuality = state;
  emit('qualityUpdate', { state });

  if (phase !== 'REPS') {
    qualityBadSince = null;
    emit('qualityOfferStop', { visible: false });
    return;
  }

  if (state !== 'QUALITY_OK') {
    if (qualityBadSince === null) {
      qualityBadSince = performance.now();
    } else if (
      performance.now() - qualityBadSince >=
      thresholds.session.qualityProblemOfferStopMs
    ) {
      emit('qualityOfferStop', { visible: true });
    }
  } else {
    qualityBadSince = null;
    emit('qualityOfferStop', { visible: false });
  }
}

function processFrame(video: HTMLVideoElement, timestampMs: number): void {
  if (!running || !currentAccumulator) {
    return;
  }

  let lf;
  try {
    lf = LandmarkEngine.detect(video, timestampMs);
  } catch (error) {
    if (error instanceof MirrorWellError && error.code === 'INFERENCE_FAILED') {
      lf = null;
    } else {
      return;
    }
  }

  const quality = QualityMonitor.evaluate(video, lf);
  trackQuality(quality);

  if (phase !== 'REPS' || quality !== 'QUALITY_OK' || !lf) {
    return;
  }

  currentAccumulator.totalFrames += 1;
  currentAccumulator.okFrames += 1;

  const nf = NormalizationLayer.normalize(lf, video);
  const raw = MetricEngine.compute(
    nf,
    currentExerciseId(),
    comfortableMax,
  );
  const sample = smoother.push(raw);

  if (sample.symmetryIndex !== null) {
    currentAccumulator.symmetrySamples.push(sample.symmetryIndex);
  }
  currentAccumulator.effortSamples.push(sample.effortIndex);

  const now = performance.now();
  if (
    now - lastMetricEmitMs >=
    1000 / thresholds.session.metricEmitHz
  ) {
    lastMetricEmitMs = now;
    emit('metricUpdate', { sample });
  }

  updateEaseOff(sample);

  const repEvent = RepDetector.feed(sample, true);
  if (repEvent) {
    currentAccumulator.reps.push(repEvent);
    emit('repCompleted', { event: repEvent });

    const targetReps = EXERCISES[currentExerciseId()].repsPerSet;
    if (currentAccumulator.reps.length >= targetReps) {
      beginRest();
    }
  } else if (
    RepDetector.isActive() === false &&
    currentAccumulator.reps.length <
      RepDetector.getRepIndex() + (phase === 'REPS' ? 0 : 0)
  ) {
    // rep discarded handled inside RepDetector finalize returning null
  }
}

function validateExerciseList(exerciseIds: ExerciseId[]): ExerciseId[] {
  if (exerciseIds.length === 0) {
    throw new MirrorWellError(
      'VALIDATION_FAILED',
      'exercise list empty',
      true,
    );
  }

  const smileOnly = exerciseIds.filter((id) => id === 'EX_SMILE');
  if (smileOnly.length === 0) {
    throw new MirrorWellError(
      'VALIDATION_FAILED',
      'EX_SMILE required for session v1',
      true,
    );
  }

  return smileOnly;
}

export const SessionController = {
  on<E extends SessionEventName>(
    event: E,
    callback: Listener<E>,
  ): () => void {
    listeners[event].add(callback as Listener<E>);
    return () => {
      listeners[event].delete(callback as Listener<E>);
    };
  },

  getPhase(): SessionPhase {
    return phase;
  },

  getRestEndsAt(): number | null {
    return restEndsAt;
  },

  getCurrentExerciseId(): ExerciseId | null {
    return running ? currentExerciseId() : null;
  },

  getRepProgress(): { done: number; total: number } {
    const exerciseId = running ? currentExerciseId() : null;
    if (!exerciseId || !currentAccumulator) {
      return { done: 0, total: 0 };
    }
    return {
      done: currentAccumulator.reps.length,
      total: EXERCISES[exerciseId].repsPerSet,
    };
  },

  async start(exerciseIds: ExerciseId[]): Promise<void> {
    if (running) {
      return;
    }

    const attested = await SafetyGate.isAttested();
    if (!attested && !SafetyGate.isDemoMode()) {
      throw new MirrorWellError('NOT_ATTESTED', 'Not attested', true);
    }

    if (!CaptureService.isRunning()) {
      throw new MirrorWellError(
        'CAMERA_UNAVAILABLE',
        'Camera must be running before session start',
        true,
      );
    }

    if (!LandmarkEngine.isReady()) {
      await LandmarkEngine.init();
    }

    profile = await StorageService.getProfile();
    if (!profile) {
      throw new MirrorWellError('VALIDATION_FAILED', 'No profile', true);
    }

    exerciseQueue = validateExerciseList(exerciseIds);

    if (SafetyGate.isDemoMode()) {
      const demoStats = CalibrationFlow.getSessionNeutralStats();
      if (!demoStats) {
        throw new MirrorWellError('NO_BASELINE', 'Demo baseline required', true);
      }
      baseline = {
        baselineId: 'demo-in-memory',
        profileId: profile.profileId,
        capturedAt: new Date().toISOString(),
        neutralStats: demoStats,
        comfortableMax: { EX_SMILE: comfortableMaxFor('EX_SMILE') },
        qualityScore: 1,
        isActive: 1,
      };
    } else {
      baseline = await StorageService.getActiveBaseline();
      if (!baseline) {
        throw new MirrorWellError('NO_BASELINE', 'No active baseline', true);
      }

      NormalizationLayer.setBaseline(baseline);
      const drift = await CalibrationFlow.checkBaselineDrift();
      if (drift === 'recalibrate') {
        throw new MirrorWellError(
          'NO_BASELINE',
          'Baseline drift — recalibrate',
          true,
        );
      }
    }

    NormalizationLayer.setBaseline(baseline);

    sessionId = crypto.randomUUID();
    startedAt = new Date().toISOString();
    exerciseIndex = 0;
    completedResults = [];
    RepDetector.reset();
    smoother.reset();
    easeOffActive = false;
    qualityBadSince = null;
    lastQuality = 'FACE_LOST';

    startAccumulator(currentExerciseId());
    comfortableMax = comfortableMaxFor(currentExerciseId());

    running = true;
    enterPhase('DEMO');

    const video = CaptureService.getVideoElement();
    if (!video) {
      throw new MirrorWellError('CAMERA_UNAVAILABLE', 'No video element', true);
    }

    frameUnsubscribe = CaptureService.onFrame(processFrame);
  },

  advance(): void {
    if (!running) {
      return;
    }

    if (phase === 'DEMO') {
      enterPhase('REPS');
      return;
    }

    if (phase === 'REST') {
      clearRestTimer();
      advanceToNextExercise();
    }
  },

  extendRest(seconds: number): void {
    if (phase !== 'REST' || restEndsAt === null || seconds <= 0) {
      return;
    }
    restEndsAt += seconds * 1000;
  },

  async stop(reason: EndReason): Promise<SessionRecordFull> {
    if (!running) {
      throw new MirrorWellError('VALIDATION_FAILED', 'Session not running', true);
    }

    stopFrameLoop();
    clearRestTimer();
    running = false;

    const record = buildSessionRecord(reason);

    if (!SafetyGate.isDemoMode()) {
      await StorageService.saveSession(record);
    }

    emit('sessionEnded', { record });
    return record;
  },

  async runDemoQuickSetup(): Promise<void> {
    if (!SafetyGate.isDemoMode()) {
      return;
    }
    CalibrationFlow.clearSession();
    const { neutralStats } = await CalibrationFlow.captureNeutral();
    const peak = await CalibrationFlow.captureComfortableMaxOnce('EX_SMILE', 0);
    const profileRow = await StorageService.getProfile();
    baseline = {
      baselineId: 'demo-in-memory',
      profileId: profileRow?.profileId ?? 'demo',
      capturedAt: new Date().toISOString(),
      neutralStats,
      comfortableMax: { EX_SMILE: peak },
      qualityScore: 1,
      isActive: 1,
    };
    NormalizationLayer.setBaseline(baseline);
  },

  isRunning(): boolean {
    return running;
  },
};
