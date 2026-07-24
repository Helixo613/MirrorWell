// Pure decision layer for CalibrationScreen. Everything here is a total function of its
// arguments so it can be unit-tested (vitest runs in `environment: 'node'`; a React component
// cannot be rendered in this repo, so this module is the screen's only unit-test surface).
import { assignableExercises, exercises } from '@/config/exercises';
import { strings } from '@/config/strings';
import { thresholds } from '@/config/thresholds';
import { MirrorWellError, type ErrorCode } from '@/data/errors';
import type { ExerciseId } from '@/data/schema';
import {
  COMFORTABLE_REP_TOTAL,
  NEUTRAL_CAPTURE_TOTAL,
  type CalibrationExerciseContext,
  type CalibrationStep,
  type InteractivePhase,
} from './types';

/** Error codes that have their own copy in `strings.errors` and stop the screen. */
export type BlockingErrorCode = Extract<
  ErrorCode,
  | 'MODEL_LOAD_FAILED'
  | 'CAMERA_DENIED'
  | 'CAMERA_UNAVAILABLE'
  | 'DB_UNAVAILABLE'
  | 'NO_BASELINE'
  | 'VALIDATION_FAILED'
>;

/**
 * How the screen reacts to a thrown error. Branches on `code` only, `error.message` is
 * developer-facing and must never reach the DOM (API §1/§16).
 */
export type CalibrationErrorAction =
  | { kind: 'blocking'; code: BlockingErrorCode }
  | { kind: 'coaching' }
  | { kind: 'redirect'; to: '/onboarding' };

export function classifyError(error: unknown): CalibrationErrorAction {
  const code: ErrorCode =
    error instanceof MirrorWellError ? error.code : 'VALIDATION_FAILED';
  switch (code) {
    // Never a dead end (FRONTEND §2.2): coaching + redo, unlimited, no judgment copy.
    case 'QUALITY_TOO_LOW':
      return { kind: 'coaching' };
    case 'NOT_ATTESTED':
      return { kind: 'redirect', to: '/onboarding' };
    case 'MODEL_LOAD_FAILED':
    case 'CAMERA_DENIED':
    case 'CAMERA_UNAVAILABLE':
    case 'DB_UNAVAILABLE':
    case 'NO_BASELINE':
      return { kind: 'blocking', code };
    default:
      return { kind: 'blocking', code: 'VALIDATION_FAILED' };
  }
}

/**
 * Assigned exercises that `CalibrationFlow.captureComfortableMax` can actually measure.
 * `EX_PUCKER` has no `blendshapePair`, so it is not in `assignableExercises` and would throw
 * `VALIDATION_FAILED`, filtering here is what keeps it out of the sequence.
 */
export function calibrationExercises(
  assigned: readonly ExerciseId[] | undefined,
): CalibrationExerciseContext[] {
  return (assigned ?? [])
    .filter((id) => assignableExercises.includes(id))
    .map((id) => ({
      exerciseId: id,
      displayName: exercises[id]!.displayName,
      instruction: exercises[id]!.instruction,
    }));
}

/**
 * Ordering is fixed by the backend, not by taste: `captureNeutral()` resets the accumulated
 * comfortable-max map and `runNoiseFloorSelfTest()` needs both (else `NO_BASELINE`), so
 * neutral runs first, then every exercise, then the self-test. There is deliberately no
 * transition back to `neutral`: redo is scoped to the phase the user is standing in.
 */
export function nextStep(
  step: CalibrationStep,
  exerciseCount: number,
): CalibrationStep {
  switch (step.phase) {
    case 'neutral':
      return { phase: 'comfortableMax', exerciseIndex: 0 };
    case 'comfortableMax':
      return step.exerciseIndex + 1 < exerciseCount
        ? { phase: 'comfortableMax', exerciseIndex: step.exerciseIndex + 1 }
        : { phase: 'noiseFloor', exerciseIndex: step.exerciseIndex };
    case 'noiseFloor':
    case 'saving':
      return { phase: 'complete', exerciseIndex: step.exerciseIndex };
    case 'complete':
      return step;
  }
}

/**
 * One capture window, in ms. `captureNeutral` / `captureComfortableMax` each run
 * `neutralCaptures` of these back to back behind a single user tap.
 */
export const CAPTURE_WINDOW_MS = thresholds.calibration.captureSeconds * 1000;

/**
 * Progress dots for the N captures (FRONTEND §2.2). CalibrationFlow emits no per-window
 * event; one tap covers all N windows, so completion is derived from elapsed wall clock
 * against the real window length. Honest, because the windows really are that long, but it
 * is an estimate, not an event stream: the backend closes each window on an arriving frame
 * timestamp, so a stalled camera makes this run ahead. Hence the clamp.
 */
export function windowsElapsed(elapsedMs: number, total: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.min(total, Math.floor(elapsedMs / CAPTURE_WINDOW_MS));
}

export function captureTotal(phase: InteractivePhase): number {
  if (phase === 'neutral') return NEUTRAL_CAPTURE_TOTAL;
  if (phase === 'comfortableMax') return COMFORTABLE_REP_TOTAL;
  // The noise-floor self-test is a single window (calibration.ts: one captureFor()).
  return 1;
}

export interface PhaseCopy {
  title: string;
  body: string;
  subtitle: string | null;
  progressLabel: string;
}

export function phaseCopy(
  phase: InteractivePhase,
  exercise: CalibrationExerciseContext | null,
  completed: number,
): PhaseCopy {
  const total = captureTotal(phase);
  const current = Math.min(completed + 1, total);
  if (phase === 'comfortableMax' && exercise) {
    return {
      title: exercise.displayName,
      body: strings.calibration.comfortableMax.instruction,
      subtitle: exercise.instruction,
      progressLabel: strings.calibration.comfortableMax.repProgress(
        current,
        total,
      ),
    };
  }
  if (phase === 'noiseFloor') {
    return {
      title: strings.calibration.noiseFloor.title,
      body: strings.calibration.noiseFloor.instruction,
      subtitle: null,
      progressLabel: strings.calibration.phaseAnnouncement.noiseFloor,
    };
  }
  return {
    title: strings.calibration.neutral.title,
    body: strings.calibration.neutral.instruction,
    subtitle: null,
    progressLabel: strings.calibration.neutral.captureProgress(current, total),
  };
}

/** Primary action label. After a failed capture it becomes the phase's redo label. */
export function primaryLabel(
  phase: InteractivePhase,
  coaching: boolean,
): string {
  if (phase === 'comfortableMax') {
    return coaching
      ? strings.calibration.comfortableMax.redoLabel
      : strings.calibration.comfortableMax.captureLabel;
  }
  return coaching
    ? strings.calibration.neutral.redoLabel
    : strings.calibration.neutral.captureLabel;
}

/**
 * Advisory copy under the primary action. Deliberately advisory: the Capture button is never
 * disabled on quality (FRONTEND §4: capture is user-tapped, and gating it on a quality state
 * the user may not be able to clear would be exactly the dead end §2.2 forbids).
 */
export function helperText(
  isCapturing: boolean,
  qualityOk: boolean,
): string | null {
  if (isCapturing) return strings.calibration.helpers.capturing;
  if (!qualityOk) return strings.calibration.helpers.qualityNotReady;
  return null;
}
