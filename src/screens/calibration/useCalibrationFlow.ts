import { useCallback, useEffect, useMemo, useState } from 'react';
import { EXERCISES } from '@/config/exercises';
import { strings } from '@/config/strings';
import { isMirrorWellError } from '@/data/errors';
import type { CalibrationBaseline, ExerciseId } from '@/data/schema';
import { StorageService } from '@/data/storage';
import { NormalizationLayer } from '@/metrics/normalize';
import {
  CalibrationFlow,
  type CalibrationProgress,
} from '@/session/calibration';
import { useAppState } from '@/context/useAppState';
import {
  COMFORTABLE_REP_TOTAL,
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

function createBaselineId(): string {
  return crypto.randomUUID();
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function useCalibrationFlow(
  pipelineReady: boolean,
  qualityOk: boolean,
): UseCalibrationFlowResult {
  const { profile, setActiveBaseline } = useAppState();

  const exercises = useMemo<CalibrationExerciseContext[]>(() => {
    const assigned = profile?.assignedExercises ?? [];
    return assigned.map((id) => ({
      exerciseId: id,
      displayName: EXERCISES[id].displayName,
      instruction: EXERCISES[id].instruction,
    }));
  }, [profile?.assignedExercises]);

  const [ui, setUi] = useState<CalibrationUiState>({
    phase: 'neutral',
    neutralCompleted: 0,
    comfortableRepIndex: 0,
    exerciseIndex: 0,
    isCapturing: false,
  });
  const [neutralStats, setNeutralStats] = useState<
    CalibrationBaseline['neutralStats'] | null
  >(null);
  const [qualityScore, setQualityScore] = useState(0);
  const [comfortablePeaks, setComfortablePeaks] = useState<
    Partial<Record<ExerciseId, number[]>>
  >({});
  const [blockingError, setBlockingError] = useState<{
    title: string;
    body: string;
  } | null>(null);

  useEffect(() => {
    CalibrationFlow.beginNeutralSession();
    return () => {
      CalibrationFlow.clearSession();
    };
  }, []);

  const currentExercise = exercises[ui.exerciseIndex] ?? null;

  const onProgress = useCallback((progress: CalibrationProgress) => {
    setUi((prev) => ({
      ...prev,
      secondsRemaining: progress.secondsRemaining,
    }));
  }, []);

  const clearError = useCallback(() => {
    setBlockingError(null);
  }, []);

  const mapError = useCallback((error: unknown) => {
    if (isMirrorWellError(error)) {
      const mapped = strings.errors[error.code as keyof typeof strings.errors];
      if (mapped) {
        setBlockingError(mapped);
        return;
      }
    }
    setBlockingError(strings.errors.VALIDATION_FAILED);
  }, []);

  const finishCalibration = useCallback(async () => {
    if (!profile || !neutralStats) {
      return;
    }
    setUi((prev) => ({ ...prev, phase: 'saving', isCapturing: true }));
    try {
      await CalibrationFlow.runNoiseFloorSelfTest(onProgress);
      const comfortableMax = Object.fromEntries(
        profile.assignedExercises.map((id) => {
          const peaks = comfortablePeaks[id] ?? [];
          if (peaks.length < COMFORTABLE_REP_TOTAL) {
            throw new Error('Incomplete comfortable max captures');
          }
          return [id, median(peaks)];
        }),
      ) as Partial<Record<ExerciseId, number>>;

      const baseline: CalibrationBaseline = {
        baselineId: createBaselineId(),
        profileId: profile.profileId,
        capturedAt: new Date().toISOString(),
        neutralStats,
        comfortableMax,
        qualityScore,
        isActive: 1,
      };
      await StorageService.saveBaseline(baseline);
      NormalizationLayer.setBaseline(baseline);
      setActiveBaseline(baseline);
      CalibrationFlow.clearSession();
      setUi((prev) => ({
        ...prev,
        phase: 'complete',
        isCapturing: false,
      }));
    } catch (error) {
      setUi((prev) => ({ ...prev, isCapturing: false, phase: 'noiseFloor' }));
      mapError(error);
    }
  }, [
    comfortablePeaks,
    mapError,
    neutralStats,
    onProgress,
    profile,
    qualityScore,
    setActiveBaseline,
  ]);

  const handlePrimary = useCallback(async () => {
    if (!pipelineReady || ui.isCapturing) {
      return;
    }

    setUi((prev) => ({ ...prev, isCapturing: true }));
    clearError();

    try {
      if (ui.phase === 'neutral') {
        await CalibrationFlow.captureNeutralOnce(
          ui.neutralCompleted,
          onProgress,
        );
        const nextCompleted = ui.neutralCompleted + 1;
        if (nextCompleted >= NEUTRAL_CAPTURE_TOTAL) {
          const result = CalibrationFlow.finishNeutralSession();
          setNeutralStats(result.neutralStats);
          setQualityScore(result.qualityScore);
          setUi((prev) => ({
            ...prev,
            neutralCompleted: nextCompleted,
            phase: exercises.length > 0 ? 'comfortableMax' : 'noiseFloor',
            isCapturing: false,
            secondsRemaining: undefined,
          }));
        } else {
          setUi((prev) => ({
            ...prev,
            neutralCompleted: nextCompleted,
            isCapturing: false,
            secondsRemaining: undefined,
          }));
        }
        return;
      }

      if (ui.phase === 'comfortableMax' && currentExercise) {
        const peak = await CalibrationFlow.captureComfortableMaxOnce(
          currentExercise.exerciseId,
          ui.comfortableRepIndex,
          onProgress,
        );
        setComfortablePeaks((prev) => {
          const existing = prev[currentExercise.exerciseId] ?? [];
          return {
            ...prev,
            [currentExercise.exerciseId]: [...existing, peak],
          };
        });

        const nextRep = ui.comfortableRepIndex + 1;
        if (nextRep >= COMFORTABLE_REP_TOTAL) {
          const nextExerciseIndex = ui.exerciseIndex + 1;
          setUi((prev) => ({
            ...prev,
            comfortableRepIndex: 0,
            exerciseIndex: nextExerciseIndex,
            phase:
              nextExerciseIndex >= exercises.length
                ? 'noiseFloor'
                : 'comfortableMax',
            isCapturing: false,
            secondsRemaining: undefined,
          }));
        } else {
          setUi((prev) => ({
            ...prev,
            comfortableRepIndex: nextRep,
            isCapturing: false,
            secondsRemaining: undefined,
          }));
        }
        return;
      }

      if (ui.phase === 'noiseFloor') {
        await finishCalibration();
      }
    } catch (error) {
      setUi((prev) => ({ ...prev, isCapturing: false }));
      mapError(error);
    }
  }, [
    clearError,
    currentExercise,
    exercises.length,
    finishCalibration,
    mapError,
    onProgress,
    pipelineReady,
    ui.comfortableRepIndex,
    ui.exerciseIndex,
    ui.isCapturing,
    ui.neutralCompleted,
    ui.phase,
  ]);

  const handleRedo = useCallback(() => {
    clearError();
  }, [clearError]);

  const canCapture =
    pipelineReady &&
    qualityOk &&
    !ui.isCapturing &&
    !blockingError &&
    ui.phase !== 'saving' &&
    ui.phase !== 'complete' &&
    (ui.phase === 'neutral' ||
      ui.phase === 'comfortableMax' ||
      ui.phase === 'noiseFloor');

  const {
    instructionTitle,
    instructionBody,
    instructionSubtitle,
    progressLabel,
    captureTotal,
    captureCompleted,
    primaryLabel,
    redoLabel,
    phaseAnnouncement,
    actionHelperText,
  } = useMemo(() => {
    if (ui.phase === 'neutral') {
      const current = Math.min(ui.neutralCompleted + 1, NEUTRAL_CAPTURE_TOTAL);
      return {
        instructionTitle: strings.calibration.neutral.title,
        instructionBody: strings.calibration.neutral.instruction,
        instructionSubtitle: null,
        progressLabel: strings.calibration.neutral.captureProgress(
          current,
          NEUTRAL_CAPTURE_TOTAL,
        ),
        captureTotal: NEUTRAL_CAPTURE_TOTAL,
        captureCompleted: ui.neutralCompleted,
        primaryLabel: ui.isCapturing
          ? strings.calibration.helpers.capturing
          : strings.calibration.neutral.captureLabel,
        redoLabel: blockingError ? strings.calibration.neutral.redoLabel : null,
        phaseAnnouncement: strings.calibration.phaseAnnouncement.neutral(
          current,
          NEUTRAL_CAPTURE_TOTAL,
        ),
        actionHelperText: ui.isCapturing
          ? ui.secondsRemaining !== undefined
            ? strings.calibration.helpers.captureRemaining(ui.secondsRemaining)
            : strings.calibration.helpers.capturing
          : !qualityOk && pipelineReady
            ? strings.calibration.helpers.qualityNotReady
            : null,
      };
    }
    if (ui.phase === 'comfortableMax' && currentExercise) {
      const current = ui.comfortableRepIndex + 1;
      return {
        instructionTitle: currentExercise.displayName,
        instructionBody: strings.calibration.comfortableMax.instruction,
        instructionSubtitle: currentExercise.instruction,
        progressLabel: strings.calibration.comfortableMax.repProgress(
          current,
          COMFORTABLE_REP_TOTAL,
        ),
        captureTotal: COMFORTABLE_REP_TOTAL,
        captureCompleted: ui.comfortableRepIndex,
        primaryLabel: ui.isCapturing
          ? strings.calibration.helpers.capturing
          : strings.calibration.comfortableMax.captureLabel,
        redoLabel: blockingError
          ? strings.calibration.comfortableMax.redoLabel
          : null,
        phaseAnnouncement:
          strings.calibration.phaseAnnouncement.comfortableMax(
            currentExercise.displayName,
            current,
            COMFORTABLE_REP_TOTAL,
          ),
        actionHelperText: ui.isCapturing
          ? ui.secondsRemaining !== undefined
            ? strings.calibration.helpers.captureRemaining(ui.secondsRemaining)
            : strings.calibration.helpers.capturing
          : !qualityOk && pipelineReady
            ? strings.calibration.helpers.qualityNotReady
            : null,
      };
    }
    if (ui.phase === 'noiseFloor') {
      return {
        instructionTitle: strings.calibration.noiseFloor.title,
        instructionBody: strings.calibration.noiseFloor.instruction,
        instructionSubtitle: null,
        progressLabel: strings.calibration.noiseFloor.title,
        captureTotal: 0,
        captureCompleted: 0,
        primaryLabel: ui.isCapturing
          ? strings.calibration.saving
          : strings.calibration.actions.continue,
        redoLabel: blockingError ? strings.calibration.actions.tryAgain : null,
        phaseAnnouncement: strings.calibration.phaseAnnouncement.noiseFloor,
        actionHelperText: ui.isCapturing
          ? strings.calibration.saving
          : !qualityOk && pipelineReady
            ? strings.calibration.helpers.qualityNotReady
            : null,
      };
    }
    if (ui.phase === 'saving') {
      return {
        instructionTitle: strings.calibration.saving,
        instructionBody: '',
        instructionSubtitle: null,
        progressLabel: '',
        captureTotal: 0,
        captureCompleted: 0,
        primaryLabel: strings.calibration.saving,
        redoLabel: null,
        phaseAnnouncement: strings.calibration.phaseAnnouncement.saving,
        actionHelperText: strings.calibration.saving,
      };
    }
    return {
      instructionTitle: strings.calibration.complete,
      instructionBody: '',
      instructionSubtitle: null,
      progressLabel: '',
      captureTotal: 0,
      captureCompleted: 0,
      primaryLabel: strings.calibration.actions.continue,
      redoLabel: null,
      phaseAnnouncement: strings.calibration.phaseAnnouncement.complete,
      actionHelperText: null,
    };
  }, [
    blockingError,
    currentExercise,
    pipelineReady,
    qualityOk,
    ui,
  ]);

  return {
    ui,
    exercises,
    currentExercise,
    blockingError,
    canCapture,
    primaryLabel,
    redoLabel,
    actionHelperText,
    actionHelperId: 'calibration-action-helper',
    phaseAnnouncement,
    progressLabel,
    instructionTitle,
    instructionBody,
    instructionSubtitle,
    captureTotal,
    captureCompleted,
    handlePrimary,
    handleRedo,
    clearError,
  };
}
