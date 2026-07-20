import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BlockingNotice } from '@/components/feedback/BlockingNotice';
import { CalibrationActionBar } from '@/components/calibration/CalibrationActionBar';
import { CalibrationJourneyBar } from '@/components/calibration/CalibrationJourneyBar';
import { CaptureProgress } from '@/components/calibration/CaptureProgress';
import { InstructionCard } from '@/components/calibration/InstructionCard';
import { CameraPreview } from '@/components/camera/CameraPreview';
import { QualityBanner } from '@/components/camera/QualityBanner';
import { ScreenShell } from '@/components/layout/ScreenShell';
import { FadeIn } from '@/components/motion/FadeIn';
import { strings } from '@/config/strings';
import { useAppState } from '@/context/useAppState';
import { useCameraPipeline } from '@/hooks/useCameraPipeline';
import { useCalibrationFlow } from '@/screens/calibration/useCalibrationFlow';
import { StorageService } from '@/data/storage';

const INSTRUCTION_ID = 'calibration-instruction-heading';
const ACTION_HELPER_ID = 'calibration-action-helper';
const useSessionStub = import.meta.env.VITE_USE_SESSION_STUB === 'true';

export function CalibrationScreen() {
  const navigate = useNavigate();
  const { settings, profile } = useAppState();
  const cameraEnabled = !useSessionStub && Boolean(profile);
  const { videoRef, quality, status, error, retry } =
    useCameraPipeline(cameraEnabled);
  const pipelineReady = useSessionStub || status === 'ready';
  const qualityOk = useSessionStub || quality === 'QUALITY_OK';

  const flow = useCalibrationFlow(pipelineReady, qualityOk);

  useEffect(() => {
    let cancelled = false;
    void StorageService.getActiveBaseline().then((baseline) => {
      if (!cancelled && baseline) {
        navigate('/home', { replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    const heading = document.getElementById(INSTRUCTION_ID);
    heading?.focus({ preventScroll: true });
  }, [
    flow.ui.phase,
    flow.captureCompleted,
    flow.ui.exerciseIndex,
    flow.instructionTitle,
  ]);

  const pipelineError = error
    ? strings.errors[error.code as keyof typeof strings.errors] ??
      strings.errors.CAMERA_UNAVAILABLE
    : null;

  if (!profile) {
    return (
      <ScreenShell textScale={settings.textScale}>
        <p className="text-muted-foreground">
          {strings.calibration.errors.notAttested}
        </p>
      </ScreenShell>
    );
  }

  if (status === 'initializing') {
    return (
      <ScreenShell textScale={settings.textScale}>
        <p className="text-center text-lg text-muted-foreground" role="status">
          {strings.calibration.loading}
        </p>
      </ScreenShell>
    );
  }

  if (status === 'error' && pipelineError) {
    return (
      <ScreenShell textScale={settings.textScale}>
        <BlockingNotice
          title={pipelineError.title}
          body={pipelineError.body}
          className="mb-6"
        />
        {error?.recoverable ? (
          <Button type="button" size="lg" className="w-full" onClick={retry}>
            {strings.calibration.actions.tryAgain}
          </Button>
        ) : null}
      </ScreenShell>
    );
  }

  const showQualityBanner = quality !== 'QUALITY_OK';
  const previewDimmed = showQualityBanner && !flow.ui.isCapturing;

  return (
    <ScreenShell textScale={settings.textScale}>
      <header className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">
          {strings.app.name}
        </p>
      </header>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {flow.phaseAnnouncement}
      </p>

      {flow.ui.phase !== 'complete' && flow.ui.phase !== 'saving' ? (
        <CalibrationJourneyBar phase={flow.ui.phase} />
      ) : null}

      {flow.blockingError ? (
        <BlockingNotice
          title={flow.blockingError.title}
          body={flow.blockingError.body}
          className="mb-4"
        />
      ) : null}

      <div className="flex flex-1 flex-col gap-6 sm:gap-8">
        <CameraPreview
          ref={videoRef}
          dimmed={previewDimmed}
          isCapturing={flow.ui.isCapturing}
          showFaceGuide
        />

        {showQualityBanner ? (
          <QualityBanner quality={quality} subdued={flow.ui.isCapturing} />
        ) : null}

        <FadeIn
          animationKey={`${flow.ui.phase}-${flow.captureCompleted}-${flow.ui.exerciseIndex}`}
        >
          <InstructionCard
            id={INSTRUCTION_ID}
            title={flow.instructionTitle}
            body={flow.instructionBody}
            subtitle={flow.instructionSubtitle}
            meta={
              flow.ui.isCapturing && flow.ui.secondsRemaining !== undefined
                ? strings.calibration.helpers.captureRemaining(
                    flow.ui.secondsRemaining,
                  )
                : flow.progressLabel
            }
          >
            {flow.ui.phase !== 'noiseFloor' && flow.captureTotal > 0 ? (
              <CaptureProgress
                total={flow.captureTotal}
                completed={flow.captureCompleted}
                label={flow.progressLabel}
              />
            ) : null}
          </InstructionCard>
        </FadeIn>
      </div>

      {flow.ui.phase === 'complete' ? (
        <CalibrationActionBar>
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => navigate('/home', { replace: true })}
          >
            {strings.calibration.actions.continue}
          </Button>
        </CalibrationActionBar>
      ) : (
        <CalibrationActionBar
          helperText={flow.actionHelperText}
          helperId={ACTION_HELPER_ID}
          secondary={
            flow.redoLabel ? (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="w-full min-h-touch"
                onClick={flow.handleRedo}
              >
                {flow.redoLabel}
              </Button>
            ) : null
          }
        >
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={!flow.canCapture}
            aria-describedby={
              flow.actionHelperText ? ACTION_HELPER_ID : undefined
            }
            onClick={() => void flow.handlePrimary()}
          >
            {flow.primaryLabel}
          </Button>
        </CalibrationActionBar>
      )}
    </ScreenShell>
  );
}
