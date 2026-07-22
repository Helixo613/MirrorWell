import type { EndReason, ExerciseId } from '@/data/schema';
import type { SessionRecordFull } from '@/data/storage';
import type { MetricSample } from '@/metrics/metrics';
import type { QualityState } from '@/sensing/quality';

export type SessionPhase = 'DEMO' | 'REPS' | 'REST';

export interface RepEvent {
  repIndex: number;
  peakSymmetryIndex: number | null;
  peakEffortIndex: number;
  durationMs: number;
  easeOffTriggered: boolean;
}

export interface SessionEventMap {
  stateChanged: { exerciseId: ExerciseId; state: SessionPhase };
  metricUpdate: { sample: MetricSample };
  qualityUpdate: { state: QualityState };
  repCompleted: { event: RepEvent };
  easeOff: { active: boolean };
  sessionEnded: { record: SessionRecordFull };
  repDiscarded: { reason: 'quality' };
  qualityOfferStop: { visible: boolean };
}

export type SessionEventName = keyof SessionEventMap;

export interface SessionStopReason {
  reason: EndReason;
}
