import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { exercises } from '@/config/exercises';
import { strings } from '@/config/strings';
import { useAppState } from '@/context/useAppState';
import type { ExerciseId } from '@/data/schema';
import type { SessionRecordFull } from '@/data/storage';
import { useCameraPipeline } from '@/hooks/useCameraPipeline';
import type { QualityState } from '@/sensing/quality';
import type { SessionPhase } from '@/types/session';
import type { SessionApi } from '@/dev/sessionApiStub';

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
  quickSetupRunning: boolean;
  pipelineError: { title: string; body: string } | null;
  reducedFacePreview: boolean;
  isDemo: boolean;
  endedRecord: SessionRecordFull | null;
  liveAnnouncement: string;
  setStopDialogOpen: (open: boolean) => void;
  handleAdvance: () => void;
  handleExtendRest: () => void;
  handleQuickSetup: () => void;
  handleStopJustStop: () => void;
  handleStopFeltWrong: () => void;
  mountFeedbackCanvas: (canvas: HTMLCanvasElement) => void;
  unmountFeedbackCanvas: () => void;
  retryPipeline: () => void;
}

const useSessionStub = import.meta.env.VITE_USE_SESSION_STUB === 'true';
const fallbackExercises: readonly ExerciseId[] = ['EX_SMILE'];

export function useSessionScreen(): UseSessionScreenResult {
  const { profile, settings, gate } = useAppState();
  const isDemo = gate === 'DEMO';
  const assignedExercises = useMemo(
    () =>
      (profile?.assignedExercises ?? fallbackExercises).filter((exerciseId) => {
        // MODEL_AND_DATA §7: EX_PUCKER has no validated blendshapePair open decision.
        return exercises[exerciseId].blendshapePair !== undefined;
      }),
    [profile?.assignedExercises],
  );
  const apiRef = useRef<SessionApi | null>(null);
  const [api, setApi] = useState<SessionApi | null>(null);
  const [screenPhase, setScreenPhase] = useState<SessionScreenPhase>('loading');
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>('DEMO');
  const [exerciseId, setExerciseId] = useState<ExerciseId | null>(null);
  const [quality, setQuality] = useState<QualityState>('FACE_LOST');
  const [repDone, setRepDone] = useState(0);
  const [easeOffActive, setEaseOffActive] = useState(false);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [quickSetupRunning, setQuickSetupRunning] = useState(false);
  const [endedRecord, setEndedRecord] = useState<SessionRecordFull | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const cameraEnabled = !useSessionStub && screenPhase !== 'ended' && screenPhase !== 'redFlag';
  const { videoRef, quality: pipelineQuality, status, retry } =
    useCameraPipeline(cameraEnabled);
  const activeExercise = exerciseId ? exercises[exerciseId] : null;
  const repTotal = activeExercise?.repsPerSet ?? 0;

  useEffect(() => {
    if (!useSessionStub) return;
    let cancelled = false;

    // The compile-time guard lets Vite remove this dev-only chunk from default builds.
    void import('@/dev/sessionApiStub').then(({ createSessionApiStub }) => {
      if (!cancelled) {
        const nextApi = createSessionApiStub();
        apiRef.current = nextApi;
        setApi(nextApi);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!api) return;
    return api.on('stateChanged', ({ exerciseId: id, state }) => {
      setExerciseId(id);
      setSessionPhase(state);
    });
  }, [api]);

  useEffect(() => {
    if (!api) return;
    const unsubscribe = [
      api.on('metricUpdate', () => undefined),
      api.on('qualityUpdate', ({ state }) => setQuality(state)),
      api.on('repCompleted', () => {
        setRepDone((done) => {
          const completed = done + 1;
          setLiveAnnouncement(strings.session.a11y.repCompleted(completed, repTotal));
          return completed;
        });
      }),
      api.on('easeOff', ({ active }) => {
        setEaseOffActive(active);
        if (active) setLiveAnnouncement(strings.session.a11y.easeOffActive);
      }),
      api.on('qualityOfferStop', () => undefined),
      api.on('sessionEnded', ({ record }) => {
        setEndedRecord(record);
        setScreenPhase('ended');
      }),
    ];
    return () => unsubscribe.forEach((off) => off());
  }, [api, repTotal]);

  const start = useCallback(async () => {
    if (!api || assignedExercises.length === 0) return;
    await api.start(assignedExercises);
    setScreenPhase('active');
  }, [api, assignedExercises]);

  useEffect(() => {
    if (!useSessionStub || screenPhase !== 'loading') return;
    if (isDemo) {
      setScreenPhase('quickSetup');
      return;
    }
    void start();
  }, [isDemo, screenPhase, start]);

  const handleQuickSetup = useCallback(() => {
    setQuickSetupRunning(true);
    void start().finally(() => setQuickSetupRunning(false));
  }, [start]);

  const handleAdvance = useCallback(() => {
    setSessionPhase('REPS');
  }, []);

  const handleStopJustStop = useCallback(() => {
    setStopDialogOpen(false);
    void apiRef.current?.stop('user_stopped');
  }, []);

  const handleStopFeltWrong = useCallback(() => {
    setStopDialogOpen(false);
    setScreenPhase('redFlag');
    void apiRef.current?.stop('red_flag_stopped');
  }, []);

  return {
    videoRef,
    phase: status === 'initializing' && screenPhase === 'loading' ? 'loading' : screenPhase,
    sessionPhase,
    exerciseId,
    exerciseName: activeExercise?.displayName ?? '',
    instruction: activeExercise?.instruction ?? '',
    quality: useSessionStub ? quality : pipelineQuality,
    repDone,
    repTotal,
    easeOffActive,
    restSecondsRemaining: 0,
    stopDialogOpen,
    quickSetupRunning,
    pipelineError: null,
    reducedFacePreview: settings.reducedFacePreview,
    isDemo,
    endedRecord,
    liveAnnouncement,
    setStopDialogOpen,
    handleAdvance,
    handleExtendRest: handleAdvance,
    handleQuickSetup,
    handleStopJustStop,
    handleStopFeltWrong,
    mountFeedbackCanvas: () => undefined,
    unmountFeedbackCanvas: () => undefined,
    retryPipeline: retry,
  };
}
