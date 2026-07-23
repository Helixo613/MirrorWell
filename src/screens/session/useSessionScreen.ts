import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { exercises } from '@/config/exercises';
import { strings } from '@/config/strings';
import { useAppState } from '@/context/useAppState';
import { MirrorWellError } from '@/data/errors';
import type { ExerciseId } from '@/data/schema';
import { resolveSessionStatus, type SessionStatusMessage } from '@/lib/sessionStatus';
import { CaptureService } from '@/sensing/capture';
import { LandmarkEngine } from '@/sensing/landmarks';
import type { QualityState } from '@/sensing/quality';
import { SessionController } from '@/session/controller';
import { FeedbackRenderer } from '@/session/renderer';
import { DEMO_EXERCISE_ID, runDemoQuickSetup } from '@/screens/session/demoQuickSetup';
import { REST_EXTEND_SECONDS, restRemainingSeconds } from '@/screens/session/sessionHelpers';
import type { SummaryLocationState } from '@/types/summary';

export type SessionScreenPhase =
  | 'loading'
  | 'quickSetup'
  | 'active'
  | 'paused'
  | 'error'
  | 'redFlag';

export type SessionSubState = 'DEMO' | 'REPS' | 'REST';

interface ErrorNotice {
  title: string;
  body: string;
}

export interface UseSessionScreenResult {
  previewRef: React.RefObject<HTMLVideoElement>;
  phase: SessionScreenPhase;
  subState: SessionSubState;
  isDemo: boolean;
  textScale: number;
  reducedFacePreview: boolean;
  exerciseName: string;
  instruction: string;
  quality: QualityState;
  status: SessionStatusMessage | null;
  repSummary: string;
  easeOffActive: boolean;
  restSecondsRemaining: number;
  restRemainingLabel: string;
  stopDialogOpen: boolean;
  qualityOfferOpen: boolean;
  quickSetupRunning: boolean;
  error: ErrorNotice | null;
  liveAnnouncement: string;
  mountFeedbackCanvas: (canvas: HTMLCanvasElement) => void;
  unmountFeedbackCanvas: () => void;
  openStopDialog: () => void;
  closeStopDialog: () => void;
  handleQuickSetup: () => void;
  handleAdvance: () => void;
  handleExtendRest: () => void;
  handleJustStop: () => void;
  handleFeltWrong: () => void;
  handleQualityContinue: () => void;
  handleQualityEnd: () => void;
  handleResume: () => void;
  handleLeave: () => void;
}

export function useSessionScreen(): UseSessionScreenResult {
  const { profile, settings, gate } = useAppState();
  const navigate = useNavigate();
  const isDemo = gate === 'DEMO';

  const sessionExercises = useMemo<ExerciseId[]>(
    () => (isDemo ? [DEMO_EXERCISE_ID] : (profile?.assignedExercises ?? [])),
    [isDemo, profile?.assignedExercises],
  );

  const [phase, setPhase] = useState<SessionScreenPhase>('loading');
  const [subState, setSubState] = useState<SessionSubState>('DEMO');
  const [exerciseId, setExerciseId] = useState<ExerciseId | null>(null);
  const [quality, setQuality] = useState<QualityState>('FACE_LOST');
  const [repDone, setRepDone] = useState(0);
  const [repTotal, setRepTotal] = useState(0);
  const [easeOffActive, setEaseOffActive] = useState(false);
  const [restSecondsRemaining, setRestSecondsRemaining] = useState(0);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [qualityOfferOpen, setQualityOfferOpen] = useState(false);
  const [quickSetupRunning, setQuickSetupRunning] = useState(false);
  const [error, setError] = useState<ErrorNotice | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const previewRef = useRef<HTMLVideoElement>(null);
  const mountedRef = useRef(true);
  const startedRef = useRef(false);
  const phaseRef = useRef<SessionScreenPhase>(phase);
  const qualityRef = useRef<QualityState>('FACE_LOST');
  const repDoneRef = useRef(0);
  const repTotalRef = useRef(0);
  const isDemoRef = useRef(isDemo);
  const restDeadlineRef = useRef(0);
  const teardownTimerRef = useRef<number | null>(null);
  phaseRef.current = phase;
  isDemoRef.current = isDemo;

  const applyStartError = useCallback((err: unknown) => {
    const code = err instanceof MirrorWellError ? err.code : null;
    if (code === 'NOT_ATTESTED') {
      setError({ title: strings.errors.VALIDATION_FAILED.title, body: strings.session.errors.notAttested });
    } else if (code && code in strings.errors) {
      setError(strings.errors[code as keyof typeof strings.errors]);
    } else {
      setError(strings.errors.CAMERA_UNAVAILABLE);
    }
    setPhase('error');
  }, []);

  const mountFeedbackCanvas = useCallback((canvas: HTMLCanvasElement) => {
    const video = previewRef.current;
    if (video) FeedbackRenderer.mount(canvas, video);
  }, []);

  const unmountFeedbackCanvas = useCallback(() => {
    FeedbackRenderer.unmount();
  }, []);

  // Keep the renderer's display settings + demo watermark in sync.
  useEffect(() => {
    FeedbackRenderer.applySettings(settings, profile?.affectedSide ?? 'unknown');
    FeedbackRenderer.setWatermark(isDemo);
  }, [settings, profile?.affectedSide, isDemo]);

  // Warm-up, then start (real) or hand off to the quick-setup overlay (demo). StrictMode-safe via
  // mountedRef + startedRef (mirrors CalibrationScreen).
  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      try {
        if (!LandmarkEngine.isReady()) await LandmarkEngine.init();
        if (!mountedRef.current) return;
        if (isDemo) {
          setPhase('quickSetup');
          return;
        }
        if (startedRef.current) return;
        startedRef.current = true;
        await SessionController.start(sessionExercises);
        if (!mountedRef.current) {
          // Unmounted while start() was still opening the camera. The teardown effect's
          // deferred stop() may already have run (a macrotask) BEFORE start() resolved, when
          // the stream did not exist yet — so its CaptureService.stop() was a no-op and the
          // stream that arrived afterward would leak. Release it here (idempotent with the
          // teardown). The hard camera rule (CLAUDE.md): open only while this screen is mounted.
          void SessionController.stop('user_stopped').catch(() => {});
          CaptureService.stop();
          return;
        }
        setPhase('active');
      } catch (err) {
        if (mountedRef.current) applyStartError(err);
      }
    })();
    return () => {
      mountedRef.current = false;
    };
  }, [isDemo, sessionExercises, applyStartError]);

  // Share CaptureService's MediaStream into the preview <video> — no detect loop here; the
  // SessionController owns inference during the session (one detect per frame).
  useEffect(() => {
    return CaptureService.onFrame((video) => {
      const preview = previewRef.current;
      if (preview && preview.srcObject !== video.srcObject) {
        preview.srcObject = video.srcObject;
      }
    });
  }, []);

  // Drive ALL render state from the closed 7-event surface (API §10) and nothing else.
  useEffect(() => {
    const unsubscribers = [
      SessionController.on('stateChanged', ({ exerciseId: id, state }) => {
        setExerciseId(id);
        setSubState(state);
        FeedbackRenderer.setExercise(id);
        const total = exercises[id]!.repsPerSet;
        repDoneRef.current = 0;
        repTotalRef.current = total;
        setRepDone(0);
        setRepTotal(total);
        FeedbackRenderer.setRepCount(0, total);
        if (state === 'REST') {
          restDeadlineRef.current = performance.now() + exercises[id]!.restSeconds * 1000;
        }
      }),
      SessionController.on('metricUpdate', ({ sample }) => {
        FeedbackRenderer.render(sample, qualityRef.current);
      }),
      SessionController.on('qualityUpdate', ({ state }) => {
        qualityRef.current = state;
        setQuality(state);
        FeedbackRenderer.render(null, state);
      }),
      SessionController.on('repCompleted', () => {
        repDoneRef.current += 1;
        const done = repDoneRef.current;
        setRepDone(done);
        FeedbackRenderer.setRepCount(done, repTotalRef.current);
        setLiveAnnouncement(strings.session.a11y.repCompleted(done, repTotalRef.current));
      }),
      SessionController.on('easeOff', ({ active }) => {
        // Ease-off's persistent aria-live text is carried by the SessionStatusStrip (safety
        // variant, amber) via resolveSessionStatus; the sr-only announcer stays for transient
        // rep-completion so the two aria-live regions never double-announce the same state.
        setEaseOffActive(active);
        FeedbackRenderer.setEaseOff(active);
      }),
      SessionController.on('qualityOfferStop', ({ visible }) => {
        setQualityOfferOpen(visible);
      }),
      SessionController.on('sessionEnded', ({ record }) => {
        if (record.endReason === 'red_flag_stopped') {
          setPhase('redFlag');
          return;
        }
        const state: SummaryLocationState = { record, demo: isDemoRef.current };
        navigate('/summary', { state });
      }),
    ];
    return () => {
      for (const unsub of unsubscribers) unsub();
    };
  }, [navigate]);

  // REST countdown — derived from the event stream (there is no getRestEndsAt). Display-only; the
  // controller auto-advances REST on its own frame timestamps.
  useEffect(() => {
    if (subState !== 'REST') {
      setRestSecondsRemaining(0);
      return;
    }
    const update = () =>
      setRestSecondsRemaining(restRemainingSeconds(restDeadlineRef.current, performance.now()));
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [subState]);

  // FRONTEND §6 interruption: hidden mid-session → pause + camera light off. The controller's
  // session state is preserved (no frames arrive, so no progress); resume restarts the camera.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && phaseRef.current === 'active') {
        CaptureService.stop();
        setPhase('paused');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Camera + session teardown on REAL unmount. Deferred by a macrotask so a StrictMode
  // fake-unmount (dev only) — immediately followed by a remount that clears the timer — does not
  // tear down a live session. In production (the e2e gate) effects run once, so this fires on the
  // genuine unmount and releases every camera track.
  useEffect(() => {
    if (teardownTimerRef.current !== null) {
      window.clearTimeout(teardownTimerRef.current);
      teardownTimerRef.current = null;
    }
    return () => {
      teardownTimerRef.current = window.setTimeout(() => {
        void SessionController.stop('user_stopped').catch(() => {});
        CaptureService.stop();
      }, 0);
    };
  }, []);

  const handleQuickSetup = useCallback(() => {
    setQuickSetupRunning(true);
    setError(null);
    void (async () => {
      try {
        await runDemoQuickSetup(DEMO_EXERCISE_ID);
        if (!mountedRef.current) {
          // runDemoQuickSetup's capture windows release the camera on their own teardown, so a
          // mid-quick-setup unmount leaves nothing open here — but start() below has not run.
          CaptureService.stop();
          return;
        }
        startedRef.current = true;
        await SessionController.start([DEMO_EXERCISE_ID]);
        if (!mountedRef.current) {
          // Same race as the real path: start() may have opened the camera after the deferred
          // teardown already ran. Release it here (idempotent).
          void SessionController.stop('user_stopped').catch(() => {});
          CaptureService.stop();
          return;
        }
        setPhase('active');
      } catch (err) {
        if (mountedRef.current) applyStartError(err);
      } finally {
        if (mountedRef.current) setQuickSetupRunning(false);
      }
    })();
  }, [applyStartError]);

  const handleAdvance = useCallback(() => {
    SessionController.advance();
  }, []);

  const handleExtendRest = useCallback(() => {
    SessionController.extendRest(REST_EXTEND_SECONDS);
    restDeadlineRef.current += REST_EXTEND_SECONDS * 1000;
    setRestSecondsRemaining(restRemainingSeconds(restDeadlineRef.current, performance.now()));
  }, []);

  const openStopDialog = useCallback(() => setStopDialogOpen(true), []);
  const closeStopDialog = useCallback(() => setStopDialogOpen(false), []);

  const handleJustStop = useCallback(() => {
    setStopDialogOpen(false);
    void SessionController.stop('user_stopped').catch(() => {});
  }, []);

  const handleFeltWrong = useCallback(() => {
    setStopDialogOpen(false);
    void SessionController.stop('red_flag_stopped').catch(() => {});
  }, []);

  const handleQualityContinue = useCallback(() => {
    setQualityOfferOpen(false);
  }, []);

  const handleQualityEnd = useCallback(() => {
    void SessionController.stop('quality_abandoned').catch(() => {});
  }, []);

  const handleResume = useCallback(() => {
    void (async () => {
      try {
        await CaptureService.start();
        if (!mountedRef.current) return;
        setPhase('active');
      } catch (err) {
        if (mountedRef.current) applyStartError(err);
      }
    })();
  }, [applyStartError]);

  // Both the red-flag guidance "Done" and the start-error "Back" leave the session; RootRedirect
  // routes to /home (attested) or the demo entry per gate.
  const handleLeave = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const exerciseName = exerciseId ? exercises[exerciseId]!.displayName : '';
  const instruction = exerciseId ? exercises[exerciseId]!.instruction : '';
  const status = resolveSessionStatus(quality, easeOffActive, null);

  return {
    previewRef,
    phase,
    subState,
    isDemo,
    textScale: settings.textScale,
    reducedFacePreview: settings.reducedFacePreview,
    exerciseName,
    instruction,
    quality,
    status,
    repSummary: strings.session.repCounter(repDone, repTotal),
    easeOffActive,
    restSecondsRemaining,
    restRemainingLabel: strings.session.rest.remaining(restSecondsRemaining),
    stopDialogOpen,
    qualityOfferOpen,
    quickSetupRunning,
    error,
    liveAnnouncement,
    mountFeedbackCanvas,
    unmountFeedbackCanvas,
    openStopDialog,
    closeStopDialog,
    handleQuickSetup,
    handleAdvance,
    handleExtendRest,
    handleJustStop,
    handleFeltWrong,
    handleQualityContinue,
    handleQualityEnd,
    handleResume,
    handleLeave,
  };
}
