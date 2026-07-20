import { useCallback, useMemo, useState } from 'react';
import { exercises } from '@/config/exercises';
import { strings } from '@/config/strings';
import { useAppState } from '@/context/useAppState';
import {
  NEUTRAL_CAPTURE_TOTAL,
  type CalibrationExerciseContext,
  type CalibrationUiState,
} from '@/screens/calibration/types';

export interface UseCalibrationFlowResult {
  ui: CalibrationUiState;
  exercises: CalibrationExerciseContext[];
  currentExercise: CalibrationExerciseContext | null;
  blockingError: { title: string; body: string } | null;
  canCapture: boolean;
  primaryLabel: string;
  redoLabel: string | null;
  actionHelperText: string | null;
  actionHelperId: string;
  phaseAnnouncement: string;
  progressLabel: string;
  instructionTitle: string;
  instructionBody: string;
  instructionSubtitle: string | null;
  captureTotal: number;
  captureCompleted: number;
  handlePrimary: () => Promise<void>;
  handleRedo: () => void;
  clearError: () => void;
}

const useSessionStub = import.meta.env.VITE_USE_SESSION_STUB === 'true';

export function useCalibrationFlow(
  pipelineReady: boolean,
  qualityOk: boolean,
): UseCalibrationFlowResult {
  const { profile } = useAppState();
  const exercisesForProfile = useMemo<CalibrationExerciseContext[]>(
    () =>
      (profile?.assignedExercises ?? []).map((exerciseId) => ({
        exerciseId,
        displayName: exercises[exerciseId].displayName,
        instruction: exercises[exerciseId].instruction,
      })),
    [profile?.assignedExercises],
  );
  const [ui, setUi] = useState<CalibrationUiState>({
    phase: 'neutral',
    neutralCompleted: 0,
    comfortableRepIndex: 0,
    exerciseIndex: 0,
    isCapturing: false,
  });
  const [blockingError, setBlockingError] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const clearError = useCallback(() => setBlockingError(null), []);

  const handlePrimary = useCallback(async () => {
    if (!useSessionStub || !pipelineReady || !qualityOk || ui.isCapturing) return;
    setUi((current) => ({ ...current, isCapturing: true }));
    try {
      // The compile-time guard lets Vite remove this dev-only chunk from default builds.
      const { createSessionApiStub } = await import('@/dev/sessionApiStub');
      await createSessionApiStub().captureNeutral();
      setUi((current) => {
        const neutralCompleted = current.neutralCompleted + 1;
        return {
          ...current,
          neutralCompleted,
          isCapturing: false,
          phase: neutralCompleted >= NEUTRAL_CAPTURE_TOTAL ? 'complete' : 'neutral',
        };
      });
    } catch {
      setBlockingError(strings.errors.QUALITY_TOO_LOW);
      setUi((current) => ({ ...current, isCapturing: false }));
    }
  }, [pipelineReady, qualityOk, ui.isCapturing]);

  const current = Math.min(ui.neutralCompleted + 1, NEUTRAL_CAPTURE_TOTAL);
  const isComplete = ui.phase === 'complete';
  return {
    ui,
    exercises: exercisesForProfile,
    currentExercise: exercisesForProfile[ui.exerciseIndex] ?? null,
    blockingError,
    canCapture: useSessionStub && pipelineReady && qualityOk && !ui.isCapturing && !isComplete,
    primaryLabel: ui.isCapturing
      ? strings.calibration.helpers.capturing
      : strings.calibration.neutral.captureLabel,
    redoLabel: blockingError ? strings.calibration.neutral.redoLabel : null,
    actionHelperText: ui.isCapturing
      ? strings.calibration.helpers.capturing
      : !qualityOk && pipelineReady
        ? strings.calibration.helpers.qualityNotReady
        : null,
    actionHelperId: 'calibration-action-helper',
    phaseAnnouncement: isComplete
      ? strings.calibration.phaseAnnouncement.complete
      : strings.calibration.phaseAnnouncement.neutral(current, NEUTRAL_CAPTURE_TOTAL),
    progressLabel: strings.calibration.neutral.captureProgress(current, NEUTRAL_CAPTURE_TOTAL),
    instructionTitle: strings.calibration.neutral.title,
    instructionBody: strings.calibration.neutral.instruction,
    instructionSubtitle: null,
    captureTotal: NEUTRAL_CAPTURE_TOTAL,
    captureCompleted: ui.neutralCompleted,
    handlePrimary,
    handleRedo: clearError,
    clearError,
  };
}
