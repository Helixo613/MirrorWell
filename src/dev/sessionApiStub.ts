import type { EndReason, ExerciseId, RegionId } from '../data/schema.ts';
import type { SessionRecordFull } from '../data/storage.ts';
import type { MetricSample } from '../metrics/metrics.ts';
import type { RepEvent } from '../metrics/reps.ts';
import type { QualityState } from '../sensing/quality.ts';

export type SessionState = 'DEMO' | 'REPS' | 'REST';

export type NeutralCaptureResult = {
  neutralStats: Record<RegionId, { left: { u: number; v: number }; right: { u: number; v: number } }>;
  qualityScore: number;
};

type SessionEvents = {
  stateChanged: { exerciseId: ExerciseId; state: SessionState };
  metricUpdate: { sample: MetricSample };
  repCompleted: { event: RepEvent };
  easeOff: { active: boolean };
  qualityUpdate: { state: QualityState };
  qualityOfferStop: { visible: boolean };
  sessionEnded: { record: SessionRecordFull };
};

export interface SessionApi {
  start(exerciseIds: ExerciseId[]): Promise<void>;
  stop(reason: EndReason): Promise<SessionRecordFull>;
  on<Event extends keyof SessionEvents>(event: Event, cb: (payload: SessionEvents[Event]) => void): () => void;
  off<Event extends keyof SessionEvents>(event: Event, cb: (payload: SessionEvents[Event]) => void): void;
  captureNeutral(): Promise<NeutralCaptureResult>;
}

const STUB_SESSION_ID = '00000000-0000-4000-8000-000000000001';
const STUB_PROFILE_ID = '00000000-0000-4000-8000-000000000002';
const STUB_BASELINE_ID = '00000000-0000-4000-8000-000000000003';
const STUB_RESULT_ID = '00000000-0000-4000-8000-000000000004';
const STUB_REP_ID = '00000000-0000-4000-8000-000000000005';

export function createSessionApiStub(): SessionApi {
  const listeners: { [Event in keyof SessionEvents]: Set<(payload: SessionEvents[Event]) => void> } = {
    stateChanged: new Set(),
    metricUpdate: new Set(),
    repCompleted: new Set(),
    easeOff: new Set(),
    qualityUpdate: new Set(),
    qualityOfferStop: new Set(),
    sessionEnded: new Set(),
  };
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let exerciseId: ExerciseId = 'EX_SMILE';
  let startedAt = new Date().toISOString();

  function emit<Event extends keyof SessionEvents>(event: Event, payload: SessionEvents[Event]): void {
    for (const cb of listeners[event]) cb(payload);
  }

  function schedule(delayMs: number, action: () => void): void {
    const timer = setTimeout(() => {
      timers.delete(timer);
      action();
    }, delayMs);
    timers.add(timer);
  }

  function clearTimers(): void {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  }

  function makeRecord(reason: EndReason): SessionRecordFull {
    const endedAt = new Date().toISOString();
    return {
      sessionId: STUB_SESSION_ID,
      profileId: STUB_PROFILE_ID,
      baselineId: STUB_BASELINE_ID,
      startedAt,
      endedAt,
      endReason: reason,
      results: [{
        resultId: STUB_RESULT_ID,
        sessionId: STUB_SESSION_ID,
        exerciseId,
        repsCompleted: 1,
        meanSymmetryIndex: 0.83,
        meanEffortIndex: 0.5,
        easeOffCount: 1,
        lowQualityFramePct: 0,
        reps: [{
          repId: STUB_REP_ID,
          resultId: STUB_RESULT_ID,
          repIndex: 0,
          peakSymmetryIndex: 0.95,
          peakEffortIndex: 0.7,
          durationMs: 800,
          easeOffTriggered: 1,
        }],
      }],
    };
  }

  return {
    async start(exerciseIds) {
      exerciseId = exerciseIds[0] ?? 'EX_SMILE';
      startedAt = new Date().toISOString();
      emit('stateChanged', { exerciseId, state: 'DEMO' });
      schedule(0, () => emit('metricUpdate', { sample: { symmetryIndex: 0.95, effortIndex: 0.2, timestampMs: 0 } }));
      schedule(100, () => emit('metricUpdate', { sample: { symmetryIndex: 0.6, effortIndex: 0.7, timestampMs: 100 } }));
      schedule(200, () => emit('easeOff', { active: true }));
      schedule(300, () => emit('repCompleted', { event: { repIndex: 0, peakSymmetryIndex: 0.95, peakEffortIndex: 0.7, durationMs: 800, easeOffTriggered: true } }));
      schedule(400, () => emit('qualityOfferStop', { visible: true }));
      schedule(500, () => emit('metricUpdate', { sample: { symmetryIndex: 0.95, effortIndex: 0.2, timestampMs: 500 } }));
      schedule(600, () => emit('easeOff', { active: false }));
      schedule(700, () => emit('qualityOfferStop', { visible: false }));
    },
    async stop(reason) {
      clearTimers();
      const record = makeRecord(reason);
      emit('sessionEnded', { record });
      return record;
    },
    on(event, cb) {
      listeners[event].add(cb);
      return () => this.off(event, cb);
    },
    off(event, cb) {
      listeners[event].delete(cb);
    },
    async captureNeutral() {
      return {
        neutralStats: {
          REGION_BROW: { left: { u: 0.01, v: 0.02 }, right: { u: 0.03, v: 0.04 } },
          REGION_EYELID: { left: { u: 0.05, v: 0.06 }, right: { u: 0.07, v: 0.08 } },
          REGION_MOUTH_CORNER: { left: { u: 0.09, v: 0.1 }, right: { u: 0.11, v: 0.12 } },
          REGION_LIP: { left: { u: 0.13, v: 0.14 }, right: { u: 0.15, v: 0.16 } },
        },
        qualityScore: 0.9,
      };
    },
  };
}
