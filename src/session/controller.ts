// src/session/controller.ts — the session state machine, event surface, and session
// assembly (docs/BACKEND.md §1.6). Contracts: docs/API.md §10. The frontend's primary
// integration surface; event shapes are the closed table in ARCHITECTURE §12 — no others.
import type { EndReason, ExerciseId } from '../data/schema.ts';
import { MirrorWellError } from '../data/errors.ts';
import { StorageService, type ExerciseResultInput, type RepMetricInput, type SessionRecordFull, type SessionRecordInput } from '../data/storage.ts';
import { exercises, assignableExercises } from '../config/exercises.ts';
import { thresholds } from '../config/thresholds.ts';
import { MetricEngine, type MetricSample } from '../metrics/metrics.ts';
import { NormalizationLayer } from '../metrics/normalize.ts';
import { RepDetector, type RepEvent } from '../metrics/reps.ts';
import { CalibrationFlow } from './calibration.ts';
import { Emitter } from './emitter.ts';
import { SafetyGate } from './safety.ts';
import { openFrameSource } from './frames.ts';
import { type LandmarkFrame } from '../sensing/landmarks.ts';
import { QualityMonitor, type QualityResult, type QualityState } from '../sensing/quality.ts';
import { log } from '../log.ts';

type State = 'DEMO' | 'REPS' | 'REST';

type Events = {
  stateChanged: { exerciseId: ExerciseId; state: State };
  metricUpdate: { sample: MetricSample };
  qualityUpdate: { state: QualityState };
  repCompleted: { event: RepEvent };
  easeOff: { active: boolean };
  sessionEnded: { record: SessionRecordFull };
  qualityOfferStop: { visible: boolean };
};

const emitter = new Emitter<Events>();

// --- Session-scope state (reset in start()) ---
let exercisesInSession: ExerciseId[] = [];
let index = 0;
let state: State | null = null;
let stopping = false;
// Set by the first call to stop() (public or auto-triggered) and never cleared until the
// next start() — every subsequent call (concurrent or after completion) returns this SAME
// promise instead of re-running assembly/persistence (idempotent stop()).
let stopPromise: Promise<SessionRecordFull> | null = null;
let stopFrameSource: (() => void) | null = null;
let sessionId = '';
let profileId = '';
let baselineId = '';
let startedAt = '';
let results: ExerciseResultInput[] = [];
let lastQualityState: QualityState | null = null;

// --- Per-exercise-scope state (reset in resetExerciseAccumulators()) ---
let currentReps: RepMetricInput[] = [];
let exerciseFrameTotal = 0;
let exerciseFrameOk = 0;
let symmetrySum = 0;
let symmetryCount = 0;
let effortSum = 0;
let effortCount = 0;
let easeOffCount = 0;
let easeOffWasActive = false;
let repFrameTotal = 0;
let repFrameOk = 0;
let nonOkStreakStartMs: number | null = null;
let offerStopVisible = false;
let lastMetricEmitMs: number | null = null;

// --- REST-scope state ---
let restDeadlineMs = 0;

function emitState(): void {
  emitter.emit('stateChanged', { exerciseId: exercisesInSession[index]!, state: state! });
}

function resetExerciseAccumulators(): void {
  currentReps = [];
  exerciseFrameTotal = 0;
  exerciseFrameOk = 0;
  symmetrySum = 0;
  symmetryCount = 0;
  effortSum = 0;
  effortCount = 0;
  easeOffCount = 0;
  easeOffWasActive = false;
  repFrameTotal = 0;
  repFrameOk = 0;
  nonOkStreakStartMs = null;
  offerStopVisible = false;
  lastMetricEmitMs = null;
  MetricEngine.reset();
  RepDetector.reset();
}

function finalizeCurrentExerciseResult(): ExerciseResultInput {
  const exerciseId = exercisesInSession[index]!;
  return {
    resultId: crypto.randomUUID(),
    exerciseId,
    repsCompleted: currentReps.length,
    meanSymmetryIndex: symmetryCount === 0 ? null : symmetrySum / symmetryCount,
    meanEffortIndex: effortCount === 0 ? null : effortSum / effortCount,
    easeOffCount,
    lowQualityFramePct: exerciseFrameTotal === 0 ? 0 : 1 - exerciseFrameOk / exerciseFrameTotal,
    reps: currentReps,
  };
}

function maybeEmitMetricUpdate(sample: MetricSample): void {
  if (lastMetricEmitMs !== null && sample.timestampMs - lastMetricEmitMs < thresholds.session.metricEventMinIntervalMs) {
    return;
  }
  lastMetricEmitMs = sample.timestampMs;
  emitter.emit('metricUpdate', { sample });
}

function maybeEmitEaseOff(): void {
  const active = MetricEngine.isEaseOffActive();
  if (active === easeOffWasActive) return;
  easeOffWasActive = active;
  if (active) easeOffCount += 1;
  emitter.emit('easeOff', { active });
}

// Offer-stop tracking is scoped to REPS only (BACKEND §1.6: "quality problems persisting
// > 30 s in REPS"). ≥30 s continuous non-OK → visible: true; first OK frame after → false.
function handleOfferStop(isOk: boolean, timestampMs: number): void {
  if (isOk) {
    if (offerStopVisible) {
      offerStopVisible = false;
      emitter.emit('qualityOfferStop', { visible: false });
    }
    nonOkStreakStartMs = null;
    return;
  }
  if (nonOkStreakStartMs === null) {
    nonOkStreakStartMs = timestampMs;
  } else if (!offerStopVisible && timestampMs - nonOkStreakStartMs >= thresholds.session.qualityProblemOfferStopMs) {
    offerStopVisible = true;
    emitter.emit('qualityOfferStop', { visible: true });
  }
}

function handleRepsFrame(quality: QualityResult, timestampMs: number): void {
  const exerciseId = exercisesInSession[index]!;
  const wasRepActive = RepDetector.getState() === 'active';

  exerciseFrameTotal += 1;
  if (wasRepActive) repFrameTotal += 1;

  if (quality.state !== 'QUALITY_OK') {
    handleOfferStop(false, timestampMs);
    return;
  }
  exerciseFrameOk += 1;
  if (wasRepActive) repFrameOk += 1;
  handleOfferStop(true, timestampMs);

  const nf = NormalizationLayer.normalize(quality.frame);
  const sample = MetricEngine.compute(nf, exerciseId);

  if (sample.symmetryIndex !== null) {
    symmetrySum += sample.symmetryIndex;
    symmetryCount += 1;
  }
  effortSum += sample.effortIndex;
  effortCount += 1;

  maybeEmitMetricUpdate(sample);
  maybeEmitEaseOff();

  const event = RepDetector.feed(sample);
  const isRepActiveNow = RepDetector.getState() === 'active';

  if (!wasRepActive && isRepActiveNow) {
    // Rep just started on this (OK) frame — this frame wasn't tallied above (wasRepActive
    // was false), so it seeds the new span's counters.
    repFrameTotal = 1;
    repFrameOk = 1;
  } else if (wasRepActive && !isRepActiveNow) {
    // Rep span just closed (event emitted, or silently discarded inside RepDetector for
    // being too short / a gap-abort with no restart — either way nothing to count).
    const okFraction = repFrameTotal === 0 ? 1 : repFrameOk / repFrameTotal;
    if (event && okFraction >= thresholds.reps.minQualityFramePct) {
      currentReps.push({
        repId: crypto.randomUUID(),
        repIndex: event.repIndex,
        peakSymmetryIndex: event.peakSymmetryIndex,
        peakEffortIndex: event.peakEffortIndex,
        // Same assembly-time conversion rule as easeOffTriggered below (ARCH §12): the event
        // surface carries the raw difference of frame timestamps — FRACTIONAL performance-clock
        // ms — while rep_metric.durationMs is "integer > 0" (DATABASE §
        // rep_metric). Unrounded, saveSession rejects the whole record at session end
        // (VALIDATION_FAILED), sessionEnded never fires, and the idempotent-stop guard then
        // swallows every later advance/stop click — a dead REST screen.
        durationMs: Math.round(event.durationMs),
        easeOffTriggered: event.easeOffTriggered ? 1 : 0,
      });
      emitter.emit('repCompleted', { event });
    }
    repFrameTotal = 0;
    repFrameOk = 0;
  }

  if (currentReps.length >= exercises[exerciseId]!.repsPerSet) {
    results.push(finalizeCurrentExerciseResult());
    state = 'REST';
    restDeadlineMs = timestampMs + exercises[exerciseId]!.restSeconds * 1000;
    emitState();
  }
}

function endRestPeriod(): void {
  if (index === exercisesInSession.length - 1) {
    if (stopPromise) return;
    stopping = true;
    stopPromise = stopSession('completed');
    // handleFrame is synchronous, so this auto-stop is never awaited here. Attach a handler so a
    // failed persist surfaces in the console instead of becoming an unhandled rejection; the
    // rejection is still delivered to any explicit stop() caller, which returns this same promise.
    void stopPromise.catch((err: unknown) => {
      log.error('SessionController', 'auto-stop failed to persist the session', {
        code: err instanceof MirrorWellError ? err.code : 'UNKNOWN',
      });
    });
    return;
  }
  index += 1;
  state = 'DEMO';
  resetExerciseAccumulators();
  emitState();
}

function handleFrame(video: HTMLVideoElement, timestampMs: number, lf: LandmarkFrame | null): void {
  if (!state || stopping) return;

  const quality = QualityMonitor.evaluate(video, lf);
  if (quality.state !== lastQualityState) {
    lastQualityState = quality.state;
    emitter.emit('qualityUpdate', { state: quality.state });
  }

  if (state === 'REST') {
    if (timestampMs >= restDeadlineMs) endRestPeriod();
    return;
  }
  if (state === 'DEMO') return;
  handleRepsFrame(quality, timestampMs);
}

// SessionRecordInput (write shape) omits the parent keys StorageService assigns while
// persisting (ExerciseResult.sessionId, RepMetric.resultId — see saveSession in
// src/data/storage.ts). stop() must resolve a SessionRecordFull (docs/API.md §10: "the saved
// SessionRecordFull"), so mirror that assignment here rather than returning the write shape.
function toFull(record: SessionRecordInput): SessionRecordFull {
  return {
    ...record,
    results: record.results.map((result) => ({
      ...result,
      sessionId: record.sessionId,
      reps: result.reps.map((rep) => ({ ...rep, resultId: result.resultId })),
    })),
  };
}

async function stopSession(reason: EndReason): Promise<SessionRecordFull> {
  if (stopFrameSource) {
    stopFrameSource();
    stopFrameSource = null;
  }
  if (state === 'REPS') {
    results.push(finalizeCurrentExerciseResult());
  }

  const record: SessionRecordInput = {
    sessionId,
    profileId,
    baselineId,
    startedAt,
    endedAt: new Date().toISOString(),
    endReason: reason,
    results,
  };

  state = null;
  stopping = false;

  if (!SafetyGate.isDemoMode()) {
    await StorageService.saveSession(record);
  }
  const full = toFull(record);
  emitter.emit('sessionEnded', { record: full });
  return full;
}

export const SessionController = {
  async start(exerciseIds: ExerciseId[]): Promise<void> {
    if (!(await SafetyGate.isAttested()) && !SafetyGate.isDemoMode()) {
      throw new MirrorWellError('NOT_ATTESTED', 'attestation required');
    }
    if (exerciseIds.length === 0 || exerciseIds.some((id) => !assignableExercises.includes(id))) {
      throw new MirrorWellError('VALIDATION_FAILED', 'invalid exercises');
    }

    if (SafetyGate.isDemoMode()) {
      // Demo's ephemeral quick-calibration (ARCHITECTURE §11) runs as an inline overlay in
      // SessionScreen (a later plan) and calls NormalizationLayer/MetricEngine.setBaseline
      // directly before start() — there is no persisted baseline to fetch, and no active-
      // baseline check applies. profileId/baselineId here are session-local placeholders:
      // the record is returned/emitted only, never persisted (assertDemoWritable backstop),
      // so no canonical identifier or storage row is invented.
      profileId = crypto.randomUUID();
      baselineId = crypto.randomUUID();
    } else {
      const baseline = await StorageService.getActiveBaseline();
      if (!baseline) throw new MirrorWellError('NO_BASELINE', 'no active baseline');
      const profile = await StorageService.getProfile();
      if (!profile || exerciseIds.some((id) => !profile.assignedExercises.includes(id))) {
        throw new MirrorWellError('VALIDATION_FAILED', 'exercise not assigned to profile');
      }
      if ((await CalibrationFlow.checkBaselineDrift()) === 'recalibrate') {
        throw new MirrorWellError('RECALIBRATION_REQUIRED', 'recalibration required');
      }
      NormalizationLayer.setBaseline(baseline);
      MetricEngine.setBaseline(baseline);
      profileId = baseline.profileId;
      baselineId = baseline.baselineId;
    }

    // Idempotent seam: the drift check above already started and released the camera, so this
    // starts it again for the session and owns it until stop().
    stopFrameSource = await openFrameSource(handleFrame);

    exercisesInSession = exerciseIds;
    index = 0;
    sessionId = crypto.randomUUID();
    startedAt = new Date().toISOString();
    results = [];
    lastQualityState = null;
    stopping = false;
    stopPromise = null;
    state = 'DEMO';
    resetExerciseAccumulators();
    emitState();
  },

  advance(): void {
    if (!state) return;
    if (state === 'DEMO') {
      state = 'REPS';
      emitState();
      return;
    }
    if (state === 'REST') {
      endRestPeriod();
    }
  },

  extendRest(seconds: number): void {
    if (state !== 'REST') return;
    restDeadlineMs += seconds * 1000;
  },

  async stop(reason: EndReason): Promise<SessionRecordFull> {
    if (stopPromise) return stopPromise;
    if (!state) {
      // No session has ever started (state and stopPromise both still at their initial
      // values — a legitimately-ended session always leaves stopPromise set, caught above).
      // Session-scope state (sessionId, profileId, baselineId, startedAt) is still empty;
      // running assembly/persistence against it is the M1 bug (a rejected saveSession got
      // cached in stopPromise and poisoned every later stop()). docs/API.md §10 documents
      // stop()'s response as "the saved SessionRecordFull" for a session that actually ran —
      // there is none here, so there is nothing to save or return. VALIDATION_FAILED is
      // already documented (API §16) as thrown by SessionController to mean "caller bug, not
      // a user problem", which is exactly this case. Deliberately NOT cached in stopPromise:
      // each premature call rejects independently and leaves no poison behind for start().
      throw new MirrorWellError('VALIDATION_FAILED', 'stop() called with no active session');
    }
    stopping = true;
    stopPromise = stopSession(reason);
    return stopPromise;
  },

  on<E extends keyof Events>(event: E, callback: (payload: Events[E]) => void): () => void {
    return emitter.on(event, callback);
  },
};
