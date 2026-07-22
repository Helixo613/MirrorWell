import { thresholds } from '@/config/thresholds';
import type { ExerciseId } from '@/data/schema';

export type CalibrationPhase =
  | 'neutral'
  | 'comfortableMax'
  | 'noiseFloor'
  | 'saving'
  | 'complete';

/** The three phases the user actually taps through. `saving`/`complete` are terminal. */
export type InteractivePhase = Extract<
  CalibrationPhase,
  'neutral' | 'comfortableMax' | 'noiseFloor'
>;

/** Where the user is in the sequence. `exerciseIndex` only matters in `comfortableMax`. */
export interface CalibrationStep {
  phase: CalibrationPhase;
  exerciseIndex: number;
}

// Both totals are the SAME tunable: CalibrationFlow.captureNeutral and
// .captureComfortableMax each run `thresholds.calibration.neutralCaptures` capture windows
// (src/session/calibration.ts — captureWindows). Restating 3 here would be a second source
// of truth for a threshold (CLAUDE.md: every tunable lives in thresholds.ts).
export const NEUTRAL_CAPTURE_TOTAL = thresholds.calibration.neutralCaptures;
export const COMFORTABLE_REP_TOTAL = thresholds.calibration.neutralCaptures;

export interface CalibrationExerciseContext {
  exerciseId: ExerciseId;
  displayName: string;
  instruction: string;
}
