import { ScreenShell } from '@/components/layout/ScreenShell';
import { Button } from '@/components/ui/button';
import { BlockingNotice } from '@/components/feedback/BlockingNotice';
import { AccessibleDialog } from '@/components/feedback/AccessibleDialog';
import { CameraPreview } from '@/components/camera/CameraPreview';
import { FeedbackCanvas } from '@/components/session/FeedbackCanvas';
import { DemoWatermark } from '@/components/session/DemoWatermark';
import { QuickSetupOverlay } from '@/components/session/QuickSetupOverlay';
import { ArrivalOverlay } from '@/components/session/ArrivalOverlay';
import { SessionStatusStrip } from '@/components/session/SessionStatusStrip';
import { SessionRepCounter } from '@/components/session/SessionRepCounter';
import { SessionRestPanel } from '@/components/session/SessionRestPanel';
import { SessionLiveAnnouncer } from '@/components/session/SessionLiveAnnouncer';
import { SessionStopButton } from '@/components/session/SessionStopButton';
import { StopConfirmDialog } from '@/components/session/StopConfirmDialog';
import { QualityOfferCard } from '@/components/session/QualityOfferCard';
import { RedFlagGuidance } from '@/components/session/RedFlagGuidance';
import { strings } from '@/config/strings';
import { useSessionScreen } from '@/screens/session/useSessionScreen';

const HEADING_ID = 'session-heading';

export function SessionScreen() {
  const s = useSessionScreen();

  if (s.phase === 'loading') {
    return (
      <ScreenShell textScale={s.textScale}>
        <p className="flex flex-1 items-center justify-center text-center text-base text-muted-foreground">
          {strings.session.loading}
        </p>
      </ScreenShell>
    );
  }

  if (s.phase === 'error' && s.error) {
    return (
      <ScreenShell textScale={s.textScale}>
        <div className="flex flex-1 flex-col justify-center">
          <BlockingNotice title={s.error.title} body={s.error.body}>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="mt-2 w-full sm:w-auto"
              aria-label={
                s.errorExitIsCalibration
                  ? strings.session.errorCalibrateAriaLabel
                  : strings.session.errorBackAriaLabel
              }
              onClick={s.handleLeave}
            >
              {s.errorExitIsCalibration
                ? strings.session.errorCalibrate
                : strings.session.errorBack}
            </Button>
          </BlockingNotice>
        </div>
      </ScreenShell>
    );
  }

  if (s.phase === 'redFlag') {
    return (
      <RedFlagGuidance
        title={strings.session.redFlag.title}
        body={strings.session.redFlag.body}
        doneLabel={strings.session.redFlag.done}
        doneAriaLabel={strings.session.redFlag.doneAriaLabel}
        textScale={s.textScale}
        onDone={s.handleLeave}
      />
    );
  }

  // In-session scaffold, shared across quickSetup | active | paused so the FeedbackCanvas (and its
  // renderer) stays mounted across sub-state transitions. Phase-specific content is layered on top.
  return (
    <ScreenShell
      variant="wide"
      textScale={s.textScale}
      ariaLabelledBy={HEADING_ID}
      className="mx-auto max-w-standalone"
    >
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 id={HEADING_ID} className="text-lg font-medium text-foreground">
            {s.exerciseName || strings.session.screenTitle}
          </h1>
          {s.phase === 'active' ? (
            <SessionStopButton
              label={strings.session.stop.label}
              ariaLabel={strings.session.stop.ariaLabel}
              onClick={s.openStopDialog}
            />
          ) : null}
        </div>

        <div className="relative overflow-hidden rounded-2xl">
          <CameraPreview ref={s.previewRef} dimmed={s.reducedFacePreview} />
          {/* Keep canvas mounted (renderer needs a stable surface) but hide gauges during arrival —
              the green effort meter peeking through the scrim looked broken/crooked. */}
          <div
            className={s.phase === 'arrival' ? 'pointer-events-none invisible' : undefined}
            aria-hidden={s.phase === 'arrival' || undefined}
          >
            <FeedbackCanvas onMount={s.mountFeedbackCanvas} onUnmount={s.unmountFeedbackCanvas} />
          </div>
          <DemoWatermark label={strings.session.demoWatermark} visible={s.isDemo} />
          {s.phase === 'active' && s.coachText ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-4">
              <p className="rounded-lg bg-background/90 px-5 py-2.5 text-center text-xl font-semibold shadow-md">
                {s.coachText}
              </p>
            </div>
          ) : null}
          <QuickSetupOverlay
            visible={s.phase === 'quickSetup'}
            title={strings.session.quickSetup.title}
            body={strings.session.quickSetup.body}
            actionLabel={strings.session.quickSetup.action}
            runningLabel={strings.session.quickSetup.running}
            isRunning={s.quickSetupRunning}
            phaseText={
              s.quickSetupPhase === 'neutral'
                ? strings.session.quickSetup.phaseNeutral
                : s.quickSetupPhase === 'gentle'
                  ? strings.session.quickSetup.phaseGentle
                  : null
            }
            onStart={s.handleQuickSetup}
          />
          <ArrivalOverlay
            visible={s.phase === 'arrival'}
            message={strings.session.arrival.message}
            beginLabel={strings.session.arrival.begin}
            beginAriaLabel={strings.session.arrival.beginAriaLabel}
            stopLabel={strings.session.arrival.stop}
            stopAriaLabel={strings.session.arrival.stopAriaLabel}
            onBegin={s.handleBeginArrival}
            onStop={s.openStopDialog}
            note={s.encouragementNote}
            noteHeading={strings.session.arrival.note.heading}
            dismissNoteLabel={strings.session.arrival.note.dismiss}
            dismissNoteAriaLabel={strings.session.arrival.note.dismissAriaLabel}
            onDismissNote={s.handleDismissNote}
          />
        </div>

        {s.phase === 'active' ? (
          <div className="flex flex-1 flex-col gap-4">
            {s.subState === 'DEMO' ? (
              <div className="space-y-4 text-center">
                <p className="text-base leading-relaxed text-muted-foreground">{s.instruction}</p>
                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  aria-label={strings.session.demo.readyAriaLabel}
                  onClick={s.handleAdvance}
                >
                  {strings.session.demo.ready}
                </Button>
              </div>
            ) : null}

            {s.subState === 'REPS' ? (
              <div className="space-y-3">
                {s.status ? (
                  <SessionStatusStrip message={s.status.message} variant={s.status.variant} />
                ) : null}
                <SessionRepCounter summary={s.repSummary} label={strings.session.repCounterLabel} />
                <p className="text-center text-sm text-muted-foreground">{strings.session.coach.legend}</p>
              </div>
            ) : null}

            {s.subState === 'REST' ? (
              <SessionRestPanel
                title={strings.session.rest.title}
                remainingLabel={s.restRemainingLabel}
                motivation={
                  s.motivation
                    ? strings.session.rest.motivation(s.motivation)
                    : undefined
                }
                extendLabel={strings.session.rest.extend}
                extendAriaLabel={strings.session.rest.extendAriaLabel}
                skipLabel={strings.session.rest.skip}
                skipAriaLabel={strings.session.rest.skipAriaLabel}
                onExtend={s.handleExtendRest}
                onSkip={s.handleAdvance}
              />
            ) : null}

            <SessionLiveAnnouncer message={s.liveAnnouncement} />
          </div>
        ) : null}
      </div>

      <StopConfirmDialog
        open={s.stopDialogOpen}
        title={strings.session.stop.dialogTitle}
        body={strings.session.stop.dialogBody}
        justStopLabel={strings.session.stop.justStop}
        justStopAriaLabel={strings.session.stop.justStopAriaLabel}
        feltWrongLabel={strings.session.stop.feltWrong}
        feltWrongAriaLabel={strings.session.stop.feltWrongAriaLabel}
        cancelLabel={strings.session.stop.cancel}
        cancelAriaLabel={strings.session.stop.cancelAriaLabel}
        onJustStop={s.handleJustStop}
        onFeltWrong={s.handleFeltWrong}
        onCancel={s.closeStopDialog}
      />

      <QualityOfferCard
        open={s.qualityOfferOpen}
        title={strings.session.qualityOffer.title}
        body={strings.session.qualityOffer.body}
        continueLabel={strings.session.qualityOffer.continue}
        endLabel={strings.session.qualityOffer.end}
        onContinue={s.handleQualityContinue}
        onEnd={s.handleQualityEnd}
      />

      <AccessibleDialog
        open={s.phase === 'paused'}
        title={strings.session.paused.title}
        description={strings.session.paused.body}
        onClose={s.handleResume}
      >
        <Button
          type="button"
          size="lg"
          className="w-full"
          aria-label={strings.session.paused.resumeAriaLabel}
          disabled={s.resuming}
          onClick={s.handleResume}
        >
          {s.resuming ? strings.session.paused.resuming : strings.session.paused.resume}
        </Button>
      </AccessibleDialog>
    </ScreenShell>
  );
}
