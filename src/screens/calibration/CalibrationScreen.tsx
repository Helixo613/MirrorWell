import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalibrationActionBar } from '@/components/calibration/CalibrationActionBar';
import { CalibrationJourneyBar } from '@/components/calibration/CalibrationJourneyBar';
import { CaptureProgress } from '@/components/calibration/CaptureProgress';
import { InstructionCard } from '@/components/calibration/InstructionCard';
import { CameraPreview } from '@/components/camera/CameraPreview';
import { QualityBanner } from '@/components/camera/QualityBanner';
import { BlockingNotice } from '@/components/feedback/BlockingNotice';
import { ScreenShell } from '@/components/layout/ScreenShell';
import { Button } from '@/components/ui/button';
import { strings } from '@/config/strings';
import { useAppState } from '@/context/useAppState';
import { MirrorWellError } from '@/data/errors';
import { StorageService } from '@/data/storage';
import { CaptureService } from '@/sensing/capture';
import { LandmarkEngine, type LandmarkFrame } from '@/sensing/landmarks';
import { QualityMonitor, type QualityState } from '@/sensing/quality';
import { CalibrationFlow } from '@/session/calibration';
import {
  CAPTURE_WINDOW_MS,
  calibrationExercises,
  captureTotal,
  classifyError,
  helperText,
  nextStep,
  phaseCopy,
  primaryLabel,
  windowsElapsed,
  type BlockingErrorCode,
} from '@/screens/calibration/machine';
import type {
  CalibrationStep,
  InteractivePhase,
} from '@/screens/calibration/types';

const HEADING_ID = 'calibration-heading';

const INITIAL_STEP: CalibrationStep = { phase: 'neutral', exerciseIndex: 0 };

// Memoizes an in-flight CaptureService.start(). capture.ts only flips `running` after
// getUserMedia resolves, so two overlapping starts each acquire a MediaStream and the second
// overwrites the first — leaking its tracks and leaving the camera light on after stop().
// React 18 StrictMode double-invokes the mount effect in dev, which is exactly that race.
// Same guard src/session/frames.ts uses; CaptureService exposes no memo of its own.
let startInFlight: Promise<void> | null = null;

function startCamera(): Promise<void> {
  startInFlight ??= CaptureService.start().finally(() => {
    startInFlight = null;
  });
  return startInFlight;
}

export function CalibrationScreen() {
  const navigate = useNavigate();
  const { profile, settings, setActiveBaseline } = useAppState();

  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [blockingCode, setBlockingCode] = useState<BlockingErrorCode | null>(
    null,
  );
  const [quality, setQuality] = useState<QualityState>('FACE_LOST');
  const [step, setStep] = useState<CalibrationStep>(INITIAL_STEP);
  const [isCapturing, setIsCapturing] = useState(false);
  const [coaching, setCoaching] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const previewRef = useRef<HTMLVideoElement>(null);
  // Survives StrictMode's dev-only mount→unmount→remount of the SAME component instance, which
  // a per-effect `cancelled` local does not: the remount's effect sets this back to true before
  // the first run's pending start resolves, so the screen does not stop a camera it still needs.
  const mountedRef = useRef(true);
  // Mirrors `isCapturing` for the frame subscriber, which must read it synchronously and
  // must not re-subscribe when it flips.
  const capturingRef = useRef(false);
  // Set when the tab is hidden mid-capture; the stop is deferred until the capture settles.
  const pendingHideRef = useRef(false);
  // True while a resume's getUserMedia is in flight — the window in which `paused` is still true
  // so the hide branch cannot see an 'active' screen to stop.
  const resumingRef = useRef(false);

  const exerciseList = useMemo(
    () => calibrationExercises(profile?.assignedExercises),
    [profile?.assignedExercises],
  );

  const applyError = useCallback(
    (error: unknown) => {
      const action = classifyError(error);
      if (action.kind === 'coaching') {
        setCoaching(true);
        return;
      }
      if (action.kind === 'redirect') {
        navigate(action.to, { replace: true });
        return;
      }
      setBlockingCode(action.code);
    },
    [navigate],
  );

  // Warm-up + camera ownership. The screen owns CaptureService: openFrameSource (used by
  // CalibrationFlow) sees isRunning() === true, so it never takes ownership and never stops
  // the stream. Releasing it on unmount is therefore this effect's job, and it is the hard
  // camera rule (CLAUDE.md) — the stream may be open only while this screen is mounted.
  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      try {
        if (!LandmarkEngine.isReady()) {
          await LandmarkEngine.init();
        }
        if (!mountedRef.current) return;
        await startCamera();
        if (!mountedRef.current) {
          // Unmounted while getUserMedia was still pending — the cleanup below already ran and
          // its stop() was a no-op because no stream existed yet. This is the only place that
          // can release the stream that arrived afterwards, and leaving it is a direct breach
          // of the hard camera rule (CLAUDE.md): open only while this screen is mounted. The
          // window is wide in practice — a first-time permission prompt sits inside it.
          CaptureService.stop();
          return;
        }
        setReady(true);
      } catch (error) {
        if (mountedRef.current) applyError(error);
      }
    })();
    return () => {
      mountedRef.current = false;
      CaptureService.stop();
    };
  }, [attempt, applyError]);

  // Live quality banner. Exactly ONE LandmarkEngine.detect() may run per frame
  // (detectForVideo requires strictly increasing timestamps), so this loop stands down for
  // the whole duration of a CalibrationFlow capture — which owns inference via
  // src/session/frames.ts. Without the guard every capture would fail QUALITY_TOO_LOW.
  useEffect(() => {
    if (!ready || paused) return;
    return CaptureService.onFrame((video, timestampMs) => {
      // CaptureService owns a detached <video>; the preview shares its MediaStream rather
      // than re-parenting the element (one stream, two elements).
      const preview = previewRef.current;
      if (preview && preview.srcObject !== video.srcObject) {
        preview.srcObject = video.srcObject;
      }
      if (capturingRef.current) return;
      let lf: LandmarkFrame | null;
      try {
        lf = LandmarkEngine.detect(video, timestampMs);
      } catch {
        lf = null; // INFERENCE_FAILED is absorbed as FACE_LOST, same as frames.ts.
      }
      setQuality(QualityMonitor.evaluate(video, lf).state);
    });
  }, [ready, paused]);

  // FRONTEND §6: hidden tab → camera off (light off, privacy). A hide that lands during a
  // capture is still deferred (below): captureFor() in src/session/calibration.ts now aborts
  // rather than hanging when the camera stops mid-window (S1-REQ-3), but aborting turns a
  // transient tab-blink into a blocking CAMERA_UNAVAILABLE notice. Deferring lets the capture
  // finish and stops the camera immediately afterwards (settleCapture), which is both quieter
  // and still off-within-one-window.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (capturingRef.current) {
          pendingHideRef.current = true;
          return;
        }
        // Also covers a hide that lands while a resume's getUserMedia is still pending: stopping
        // now is a no-op, but the resume's own post-await document.hidden check then releases the
        // stream that arrives afterwards, so the camera ends up off either way.
        CaptureService.stop();
        setPaused(true);
        return;
      }
      pendingHideRef.current = false;
      if (paused && !resumingRef.current) {
        resumingRef.current = true;
        void startCamera()
          .then(() => {
            // Unmounted while getUserMedia was pending: the mount effect's cleanup already ran
            // its CaptureService.stop() synchronously, before this stream existed, so it was a
            // no-op. Release here or the camera stays on with the screen gone (hard camera rule,
            // CLAUDE.md). The mount path guards this same window; resume did not.
            if (!mountedRef.current) {
              CaptureService.stop();
              return;
            }
            // The tab may have been hidden AGAIN during this resume. Previously this branch
            // unconditionally cleared `paused`, which re-enabled the quality loop below and ran
            // LandmarkEngine.detect on a backgrounded tab with the camera live (FRONTEND §6).
            if (document.hidden) {
              CaptureService.stop();
              return;
            }
            setPaused(false);
          })
          .catch(applyError)
          .finally(() => {
            resumingRef.current = false;
          });
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [paused, applyError]);

  // Progress dots: one tick per real capture window (see machine.windowsElapsed).
  useEffect(() => {
    if (!isCapturing) {
      setElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, CAPTURE_WINDOW_MS);
    return () => window.clearInterval(timer);
  }, [isCapturing]);

  // Heading focus on phase change (FRONTEND §4).
  useEffect(() => {
    if (!ready) return;
    document.getElementById(HEADING_ID)?.focus({ preventScroll: true });
  }, [ready, step.phase, step.exerciseIndex]);

  useEffect(() => {
    if (step.phase === 'complete') navigate('/home', { replace: true });
  }, [step.phase, navigate]);

  const settleCapture = useCallback(() => {
    capturingRef.current = false;
    setIsCapturing(false);
    if (!pendingHideRef.current) return;
    pendingHideRef.current = false;
    if (document.hidden) {
      CaptureService.stop();
      setPaused(true);
    }
  }, []);

  const runCapture = useCallback(async () => {
    if (capturingRef.current) return;
    setCoaching(false);
    capturingRef.current = true;
    setIsCapturing(true);
    try {
      if (step.phase === 'neutral') {
        await CalibrationFlow.captureNeutral();
      } else if (step.phase === 'comfortableMax') {
        const exercise = exerciseList[step.exerciseIndex];
        if (!exercise) {
          throw new MirrorWellError(
            'VALIDATION_FAILED',
            'no assignable exercise at index',
          );
        }
        await CalibrationFlow.captureComfortableMax(exercise.exerciseId);
      } else {
        // runNoiseFloorSelfTest persists the baseline itself — the screen saves nothing.
        await CalibrationFlow.runNoiseFloorSelfTest();
        setActiveBaseline(await StorageService.getActiveBaseline());
      }
      setStep((previous) => nextStep(previous, exerciseList.length));
    } catch (error) {
      applyError(error);
    } finally {
      settleCapture();
    }
  }, [step, exerciseList, applyError, settleCapture, setActiveBaseline]);

  const retry = useCallback(() => {
    setBlockingCode(null);
    setReady(false);
    setAttempt((value) => value + 1);
  }, []);

  if (blockingCode) {
    const copy = strings.errors[blockingCode];
    return (
      <ScreenShell textScale={settings.textScale}>
        <BlockingNotice title={copy.title} body={copy.body}>
          {blockingCode === 'DB_UNAVAILABLE' ? null : (
            <Button type="button" size="lg" className="mt-2" onClick={retry}>
              {strings.calibration.actions.tryAgain}
            </Button>
          )}
        </BlockingNotice>
      </ScreenShell>
    );
  }

  // Nothing assignable to measure (e.g. only EX_PUCKER assigned): the self-test would throw
  // NO_BASELINE, so say so instead of walking the user into a failing capture.
  if (exerciseList.length === 0) {
    return (
      <ScreenShell textScale={settings.textScale}>
        <BlockingNotice
          title={strings.errors.NO_BASELINE.title}
          body={strings.errors.NO_BASELINE.body}
        />
      </ScreenShell>
    );
  }

  if (step.phase === 'saving' || step.phase === 'complete') {
    return (
      <ScreenShell textScale={settings.textScale}>
        <p
          className="flex flex-1 items-center justify-center text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {step.phase === 'saving'
            ? strings.calibration.saving
            : strings.calibration.complete}
        </p>
      </ScreenShell>
    );
  }

  if (!ready) {
    return (
      <ScreenShell textScale={settings.textScale}>
        <p
          className="flex flex-1 items-center justify-center text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {strings.calibration.loading}
        </p>
      </ScreenShell>
    );
  }

  const phase: InteractivePhase = step.phase;
  const total = captureTotal(phase);
  const completed = windowsElapsed(elapsedMs, total);
  const copy = phaseCopy(phase, exerciseList[step.exerciseIndex] ?? null, completed);

  return (
    <ScreenShell textScale={settings.textScale} ariaLabelledBy={HEADING_ID}>
      <CalibrationJourneyBar phase={step.phase} />
      <CameraPreview
        ref={previewRef}
        isCapturing={isCapturing}
        dimmed={settings.reducedFacePreview}
      />
      <QualityBanner quality={quality} className="mt-4" />
      <InstructionCard
        id={HEADING_ID}
        variant="inline"
        className="mt-6"
        title={copy.title}
        body={copy.body}
        subtitle={copy.subtitle}
      />
      <CaptureProgress
        className="mt-6"
        total={total}
        completed={completed}
        label={copy.progressLabel}
      />
      {coaching ? (
        <BlockingNotice
          className="mt-6"
          title={strings.errors.QUALITY_TOO_LOW.title}
          body={strings.errors.QUALITY_TOO_LOW.body}
        />
      ) : null}
      <CalibrationActionBar
        className="mt-6"
        helperText={helperText(isCapturing, quality === 'QUALITY_OK')}
      >
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={isCapturing}
          onClick={() => void runCapture()}
        >
          {primaryLabel(phase, coaching)}
        </Button>
      </CalibrationActionBar>
    </ScreenShell>
  );
}
