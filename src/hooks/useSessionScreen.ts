import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EXERCISES } from '@/config/exercises';
import { thresholds } from '@/config/thresholds';
import { strings } from '@/config/strings';
import { isMirrorWellError } from '@/data/errors';
import type { ExerciseId, SessionRecordFull } from '@/data/schema';
import { SessionController } from '@/session/controller';
import { FeedbackRenderer } from '@/session/renderer';
import {
  playEaseOffTone,
  playQualityChime,
  playRepTick,
  pulseEaseOffHaptic,
  pulseRepHaptic,
} from '@/session/cues';
import type { QualityState } from '@/types/sensing';
import type { SessionPhase } from '@/types/session';
import { useAppState } from '@/context/useAppState';
import { useCameraPipeline } from '@/hooks/useCameraPipeline';

export type SessionScreenPhase =
  | 'loading'
  | 'quickSetup'
  | 'active'
  | 'error'
  | 'redFlag'
  | 'ended';

export interface UseSessionScreenResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  phase: SessionScreenPhase;
  sessionPhase: SessionPhase;
  exerciseId: ExerciseId | null;
  exerciseName: string;
  instruction: string;
  quality: QualityState;
  repDone: number;
  repTotal: number;
  easeOffActive: boolean;
  restSecondsRemaining: number;
  stopDialogOpen: boolean;
  qualityOfferOpen: boolean;
  quickSetupRunning: boolean;
  pipelineError: { title: string; body: string } | null;
  reducedFacePreview: boolean;
  isDemo: boolean;
  endedRecord: SessionRecordFull | null;
  repDiscardedMessage: string | null;
  liveAnnouncement: string;
  setStopDialogOpen: (open: boolean) => void;
  handleAdvance: () => void;
  handleExtendRest: () => void;
  handleQuickSetup: () => void;
  handleStopJustStop: () => void;
  handleStopFeltWrong: () => void;
  handleQualityContinue: () => void;
  handleQualityEnd: () => void;
  mountFeedbackCanvas: (canvas: HTMLCanvasElement) => void;
  unmountFeedbackCanvas: () => void;
  retryPipeline: () => void;
}

export function useSessionScreen(): UseSessionScreenResult {
  const { profile, settings, gate } = useAppState();
  const isDemo = gate === 'DEMO';
  const assignedExercises = useMemo<ExerciseId[]>(
    () => profile?.assignedExercises ?? ['EX_SMILE'],
    [profile?.assignedExercises],
  );

  const [screenPhase, setScreenPhase] = useState<SessionScreenPhase>('loading');
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>('DEMO');
  const [exerciseId, setExerciseId] = useState<ExerciseId | null>(null);
  const [quality, setQuality] = useState<QualityState>('FACE_LOST');
  const [repDone, setRepDone] = useState(0);
  const [repTotal, setRepTotal] = useState(10);
  const [easeOffActive, setEaseOffActive] = useState(false);
  const [restSecondsRemaining, setRestSecondsRemaining] = useState(0);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [qualityOfferOpen, setQualityOfferOpen] = useState(false);
  const [quickSetupRunning, setQuickSetupRunning] = useState(false);
  const [endedRecord, setEndedRecord] = useState<SessionRecordFull | null>(null);
  const [repDiscardedMessage, setRepDiscardedMessage] = useState<string | null>(
    null,
  );
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [pipelineError, setPipelineError] = useState<{
    title: string;
    body: string;
  } | null>(null);

  const startedRef = useRef(false);
  const lastQualityRef = useRef<QualityState>('FACE_LOST');

  const cameraEnabled = screenPhase !== 'ended' && screenPhase !== 'redFlag';
  const { videoRef, quality: pipelineQuality, status, error, retry } =
    useCameraPipeline(cameraEnabled);

  const exerciseName = exerciseId ? EXERCISES[exerciseId].displayName : '';
  const instruction = exerciseId ? EXERCISES[exerciseId].instruction : '';

  const mountFeedbackCanvas = useCallback((canvas: HTMLCanvasElement) => {
    FeedbackRenderer.mount(canvas);
  }, []);

  const unmountFeedbackCanvas = useCallback(() => {
    FeedbackRenderer.unmount();
  }, []);

  useEffect(() => {
    if (profile) {
      FeedbackRenderer.applySettings(settings, profile.affectedSide);
      FeedbackRenderer.setWatermark(isDemo);
    }
  }, [profile, settings, isDemo]);

  useEffect(() => {
    if (status !== 'ready' || startedRef.current) {
      return;
    }

    if (isDemo && screenPhase === 'loading') {
      setScreenPhase('quickSetup');
      return;
    }

    startedRef.current = true;
    void SessionController.start(assignedExercises)
      .then(() => {
        setScreenPhase('active');
      })
      .catch((err) => {
        if (isMirrorWellError(err)) {
          if (err.code === 'NO_BASELINE') {
            setPipelineError({
              title: strings.errors.VALIDATION_FAILED.title,
              body: strings.session.errors.noBaseline,
            });
          } else if (err.code === 'NOT_ATTESTED') {
            setPipelineError({
              title: strings.errors.VALIDATION_FAILED.title,
              body: strings.session.errors.notAttested,
            });
          } else {
            const mapped =
              strings.errors[err.code as keyof typeof strings.errors];
            setPipelineError(
              mapped ?? strings.errors.CAMERA_UNAVAILABLE,
            );
          }
        }
        setScreenPhase('error');
      });
  }, [status, assignedExercises, isDemo, screenPhase]);

  useEffect(() => {
    const unsubscribers = [
      SessionController.on('stateChanged', ({ exerciseId: id, state }) => {
        setExerciseId(id);
        setSessionPhase(state);
        FeedbackRenderer.setExercise(id);
        const progress = SessionController.getRepProgress();
        setRepDone(progress.done);
        setRepTotal(progress.total);
        FeedbackRenderer.setRepCount(progress.done, progress.total);
      }),
      SessionController.on('metricUpdate', ({ sample }) => {
        FeedbackRenderer.render(sample, lastQualityRef.current);
      }),
      SessionController.on('qualityUpdate', ({ state }) => {
        setQuality(state);
        FeedbackRenderer.render(null, state);
        if (state !== lastQualityRef.current && state !== 'QUALITY_OK') {
          playQualityChime(settings.audioCuesEnabled);
        }
        lastQualityRef.current = state;
      }),
      SessionController.on('repCompleted', () => {
        const progress = SessionController.getRepProgress();
        setRepDone(progress.done);
        FeedbackRenderer.setRepCount(progress.done, progress.total);
        playRepTick(settings.audioCuesEnabled);
        pulseRepHaptic(settings.hapticsEnabled);
        setRepDiscardedMessage(null);
        setLiveAnnouncement(
          strings.session.a11y.repCompleted(progress.done, progress.total),
        );
      }),
      SessionController.on('easeOff', ({ active }) => {
        setEaseOffActive(active);
        FeedbackRenderer.setEaseOff(active);
        if (active) {
          playEaseOffTone(settings.audioCuesEnabled);
          pulseEaseOffHaptic(settings.hapticsEnabled);
          setLiveAnnouncement(strings.session.a11y.easeOffActive);
        }
      }),
      SessionController.on('qualityOfferStop', ({ visible }) => {
        setQualityOfferOpen(visible);
      }),
      SessionController.on('repDiscarded', () => {
        setRepDiscardedMessage(strings.session.repDiscarded);
      }),
      SessionController.on('sessionEnded', ({ record }) => {
        setEndedRecord(record);
        setScreenPhase('ended');
      }),
    ];

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }, [settings.audioCuesEnabled, settings.hapticsEnabled]);

  useEffect(() => {
    if (sessionPhase !== 'REST') {
      return;
    }

    const tick = () => {
      const endsAt = SessionController.getRestEndsAt();
      if (endsAt === null) {
        setRestSecondsRemaining(0);
        return;
      }
      setRestSecondsRemaining(
        Math.max(0, Math.ceil((endsAt - performance.now()) / 1000)),
      );
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [sessionPhase]);

  useEffect(() => {
    if (status === 'error' && error) {
      const mapped =
        strings.errors[error.code as keyof typeof strings.errors] ??
        strings.errors.CAMERA_UNAVAILABLE;
      setPipelineError(mapped);
      setScreenPhase('error');
    }
  }, [status, error]);

  const handleAdvance = useCallback(() => {
    SessionController.advance();
  }, []);

  const handleExtendRest = useCallback(() => {
    SessionController.extendRest(thresholds.session.restExtendSeconds);
  }, []);

  const handleQuickSetup = useCallback(async () => {
    setQuickSetupRunning(true);
    try {
      await SessionController.runDemoQuickSetup();
      startedRef.current = true;
      await SessionController.start(assignedExercises);
      setScreenPhase('active');
    } catch {
      setPipelineError(strings.errors.QUALITY_TOO_LOW);
      setScreenPhase('error');
    } finally {
      setQuickSetupRunning(false);
    }
  }, [assignedExercises]);

  const handleStopJustStop = useCallback(async () => {
    setStopDialogOpen(false);
    await SessionController.stop('user_stopped');
  }, []);

  const handleStopFeltWrong = useCallback(async () => {
    setStopDialogOpen(false);
    await SessionController.stop('red_flag_stopped');
    setScreenPhase('redFlag');
  }, []);

  const handleQualityContinue = useCallback(() => {
    setQualityOfferOpen(false);
  }, []);

  const handleQualityEnd = useCallback(async () => {
    setQualityOfferOpen(false);
    await SessionController.stop('quality_abandoned');
  }, []);

  return {
    videoRef,
    phase:
      status === 'initializing' && screenPhase === 'loading'
        ? 'loading'
        : screenPhase,
    sessionPhase,
    exerciseId,
    exerciseName,
    instruction,
    quality: SessionController.isRunning() ? quality : pipelineQuality,
    repDone,
    repTotal,
    easeOffActive,
    restSecondsRemaining,
    stopDialogOpen,
    qualityOfferOpen,
    quickSetupRunning,
    pipelineError,
    reducedFacePreview: settings.reducedFacePreview,
    isDemo,
    endedRecord,
    repDiscardedMessage,
    liveAnnouncement,
    setStopDialogOpen,
    handleAdvance,
    handleExtendRest,
    handleQuickSetup,
    handleStopJustStop,
    handleStopFeltWrong,
    handleQualityContinue,
    handleQualityEnd,
    mountFeedbackCanvas,
    unmountFeedbackCanvas,
    retryPipeline: retry,
  };
}
