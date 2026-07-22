import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BlockingNotice } from '@/components/feedback/BlockingNotice';
import { InstructionCard } from '@/components/calibration/InstructionCard';
import { CameraPreview } from '@/components/camera/CameraPreview';
import { ScreenShell } from '@/components/layout/ScreenShell';
import { StickyScreenFooter } from '@/components/layout/StickyScreenFooter';
import { StaggerFadeIn } from '@/components/motion/StaggerFadeIn';
import { DemoWatermark } from '@/components/session/DemoWatermark';
import { FeedbackCanvas } from '@/components/session/FeedbackCanvas';
import { QualityOfferCard } from '@/components/session/QualityOfferCard';
import { QuickSetupOverlay } from '@/components/session/QuickSetupOverlay';
import { RedFlagGuidance } from '@/components/session/RedFlagGuidance';
import { SessionLiveAnnouncer } from '@/components/session/SessionLiveAnnouncer';
import { SessionRepCounter } from '@/components/session/SessionRepCounter';
import { SessionRestPanel } from '@/components/session/SessionRestPanel';
import { SessionStatusStrip } from '@/components/session/SessionStatusStrip';
import { SessionStopButton } from '@/components/session/SessionStopButton';
import { StopConfirmDialog } from '@/components/session/StopConfirmDialog';
import { strings } from '@/config/strings';
import { useAppState } from '@/context/useAppState';
import { useSessionScreen } from '@/hooks/useSessionScreen';
import { resolveSessionStatus } from '@/lib/sessionStatus';

const INSTRUCTION_ID = 'session-instruction-heading';
const REST_TITLE_ID = 'session-rest-title';
const STAGGER_MS = 60;

export function SessionScreen() {
  const navigate = useNavigate();
  const { settings } = useAppState();
  const session = useSessionScreen();

  const statusMessage = useMemo(
    () =>
      resolveSessionStatus(
        session.quality,
        session.easeOffActive,
        session.repDiscardedMessage,
      ),
    [session.quality, session.easeOffActive, session.repDiscardedMessage],
  );

  const phaseKey = `${session.exerciseId ?? 'none'}-${session.sessionPhase}`;

  useEffect(() => {
    if (session.phase === 'ended' && session.endedRecord) {
      navigate('/summary', {
        replace: true,
        state: { record: session.endedRecord, demo: session.isDemo },
      });
    }
  }, [session.phase, session.endedRecord, session.isDemo, navigate]);

  useEffect(() => {
    const focusId =
      session.sessionPhase === 'REST' ? REST_TITLE_ID : INSTRUCTION_ID;
    const heading = document.getElementById(focusId);
    heading?.focus({ preventScroll: true });
  }, [session.exerciseId, session.sessionPhase]);

  const handleRedFlagDone = useCallback(() => {
    navigate(session.isDemo ? '/onboarding' : '/home', { replace: true });
  }, [navigate, session.isDemo]);

  if (session.phase === 'redFlag') {
    return (
      <RedFlagGuidance
        title={strings.session.redFlag.title}
        body={strings.session.redFlag.body}
        doneLabel={strings.session.redFlag.done}
        doneAriaLabel={strings.session.redFlag.doneAriaLabel}
        textScale={settings.textScale}
        onDone={handleRedFlagDone}
      />
    );
  }

  if (session.phase === 'loading') {
    return (
      <ScreenShell textScale={settings.textScale}>
        <p
          className="flex flex-1 items-center justify-center text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {strings.session.loading}
        </p>
      </ScreenShell>
    );
  }

  if (session.phase === 'error' && session.pipelineError) {
    return (
      <ScreenShell textScale={settings.textScale}>
        <BlockingNotice
          title={session.pipelineError.title}
          body={session.pipelineError.body}
        />
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="mt-6 w-full"
          onClick={session.retryPipeline}
        >
          {strings.calibration.actions.tryAgain}
        </Button>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      textScale={settings.textScale}
      className="relative gap-0 pb-0"
      ariaLabelledBy={
        session.sessionPhase === 'REST' ? REST_TITLE_ID : INSTRUCTION_ID
      }
    >
      <SessionLiveAnnouncer message={session.liveAnnouncement} />

      <DemoWatermark
        label={strings.session.demoWatermark}
        visible={session.isDemo}
      />

      <QuickSetupOverlay
        visible={session.phase === 'quickSetup'}
        title={strings.session.quickSetup.title}
        body={strings.session.quickSetup.body}
        actionLabel={strings.session.quickSetup.action}
        runningLabel={strings.session.quickSetup.running}
        isRunning={session.quickSetupRunning}
        onStart={() => void session.handleQuickSetup()}
      />

      <header className="sticky top-0 z-20 -mx-4 flex items-center justify-end border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
        <SessionStopButton
          label={strings.session.stop.label}
          ariaLabel={strings.session.stop.ariaLabel}
          onClick={() => session.setStopDialogOpen(true)}
        />
      </header>

      <div className="flex flex-1 flex-col gap-4 pt-4">
        <StaggerFadeIn animationKey={phaseKey}>
          <div className="flex flex-col gap-3">
            <div className="relative">
              <CameraPreview
                ref={session.videoRef}
                dimmed={session.reducedFacePreview}
                showFaceGuide={false}
              />
              <FeedbackCanvas
                onMount={session.mountFeedbackCanvas}
                onUnmount={session.unmountFeedbackCanvas}
              />
            </div>

            {session.sessionPhase === 'REPS' ? (
              <SessionRepCounter
                summary={strings.session.repCounter(
                  session.repDone,
                  session.repTotal,
                )}
                label={strings.session.repCounterLabel}
              />
            ) : null}

            <InstructionCard
              id={INSTRUCTION_ID}
              variant="inline"
              title={session.exerciseName}
              body={session.instruction}
            />
          </div>
        </StaggerFadeIn>

        {statusMessage ? (
          <StaggerFadeIn
            animationKey={statusMessage.message}
            delayMs={STAGGER_MS}
          >
            <SessionStatusStrip
              message={statusMessage.message}
              variant={statusMessage.variant}
            />
          </StaggerFadeIn>
        ) : null}

        {session.sessionPhase === 'REST' ? (
          <StaggerFadeIn animationKey={`${phaseKey}-rest`} delayMs={STAGGER_MS}>
            <SessionRestPanel
              title={strings.session.rest.title}
              remainingLabel={strings.session.rest.remaining(
                session.restSecondsRemaining,
              )}
              contentOnly
            />
          </StaggerFadeIn>
        ) : null}
      </div>

      {session.sessionPhase === 'DEMO' ? (
        <StickyScreenFooter>
          <Button
            type="button"
            size="lg"
            className="w-full"
            aria-label={strings.session.demo.readyAriaLabel}
            onClick={session.handleAdvance}
          >
            {strings.session.demo.ready}
          </Button>
        </StickyScreenFooter>
      ) : null}

      {session.sessionPhase === 'REST' ? (
        <StickyScreenFooter>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              aria-label={strings.session.rest.extendAriaLabel}
              onClick={session.handleExtendRest}
            >
              {strings.session.rest.extend}
            </Button>
            <Button
              type="button"
              size="lg"
              className="w-full"
              aria-label={strings.session.rest.skipAriaLabel}
              onClick={session.handleAdvance}
            >
              {strings.session.rest.skip}
            </Button>
          </div>
        </StickyScreenFooter>
      ) : null}

      <StopConfirmDialog
        open={session.stopDialogOpen}
        title={strings.session.stop.dialogTitle}
        body={strings.session.stop.dialogBody}
        justStopLabel={strings.session.stop.justStop}
        justStopAriaLabel={strings.session.stop.justStopAriaLabel}
        feltWrongLabel={strings.session.stop.feltWrong}
        feltWrongAriaLabel={strings.session.stop.feltWrongAriaLabel}
        cancelLabel={strings.session.stop.cancel}
        cancelAriaLabel={strings.session.stop.cancelAriaLabel}
        onJustStop={() => void session.handleStopJustStop()}
        onFeltWrong={() => void session.handleStopFeltWrong()}
        onCancel={() => session.setStopDialogOpen(false)}
      />

      <QualityOfferCard
        open={session.qualityOfferOpen}
        title={strings.session.qualityOffer.title}
        body={strings.session.qualityOffer.body}
        continueLabel={strings.session.qualityOffer.continue}
        endLabel={strings.session.qualityOffer.end}
        onContinue={session.handleQualityContinue}
        onEnd={() => void session.handleQualityEnd()}
      />
    </ScreenShell>
  );
}
