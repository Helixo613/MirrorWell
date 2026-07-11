import type { ExerciseId } from '@/data/schema';

export type CalibrationPhase =
  | 'neutral'
  | 'comfortableMax'
  | 'noiseFloor'
  | 'saving'
  | 'complete';

export interface CalibrationUiState {
  phase: CalibrationPhase;
  neutralCompleted: number;
  comfortableRepIndex: number;
  exerciseIndex: number;
  secondsRemaining?: number;
  isCapturing: boolean;
}

export const NEUTRAL_CAPTURE_TOTAL = 3;
export const COMFORTABLE_REP_TOTAL = 3;

export interface CalibrationExerciseContext {
  exerciseId: ExerciseId;
  displayName: string;
  instruction: string;
}
