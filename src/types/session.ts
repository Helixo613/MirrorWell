import type {
  EndReason,
  ExerciseId,
  SessionRecordFull,
} from '@/data/schema';
import type { MetricSample, QualityState } from '@/types/sensing';

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
}

export type SessionEventName = keyof SessionEventMap;

export interface SessionStopReason {
  reason: EndReason;
}
