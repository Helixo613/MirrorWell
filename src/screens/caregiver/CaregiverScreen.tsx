import { BlockingNotice } from '@/components/feedback/BlockingNotice';
import { HomeHeader } from '@/components/home/HomeHeader';
import { ScreenShell } from '@/components/layout/ScreenShell';
import { SoftPanel } from '@/components/layout/SoftPanel';
import { StaggerFadeIn } from '@/components/motion/StaggerFadeIn';
import { QuietNavLink } from '@/components/navigation/QuietNavLink';
import { TrendsChart } from '@/components/trends/TrendsChart';
import { TrendsDataTable } from '@/components/trends/TrendsDataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { exercises } from '@/config/exercises';
import { strings } from '@/config/strings';
import { thresholds } from '@/config/thresholds';
import { useAppState } from '@/context/useAppState';
import {
  CAREGIVER_HEADING_ID,
  useCaregiverScreen,
} from '@/screens/caregiver/useCaregiverScreen';

const STAGGER_MS = 60;

/**
 * CaregiverScreen (FRONTEND §2.7): a READ-ONLY trusted-person view, with exactly one narrow
 * exception (SAFETY §5): the encouragement-note compose box. The route is already gated by
 * CaregiverRoute (redirects to /home when caregiverViewEnabled is false). No other interactive
 * element on this screen may mutate anything — the rest are navigation links (to /export and
 * /home).
 */
export function CaregiverScreen() {
  const { profile, settings } = useAppState();
  const assignedExercises = profile?.assignedExercises ?? [];
  const caregiver = useCaregiverScreen(assignedExercises);
  const copy = strings.caregiver;

  if (caregiver.status === 'loading') {
    return (
      <ScreenShell textScale={settings.textScale}>
        <p
          className="flex flex-1 items-center justify-center text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {copy.loading}
        </p>
      </ScreenShell>
    );
  }

  if (caregiver.status === 'error' && caregiver.errorTitle && caregiver.errorBody) {
    return (
      <ScreenShell textScale={settings.textScale}>
        <BlockingNotice title={caregiver.errorTitle} body={caregiver.errorBody} />
        <div className="mt-6">
          <QuietNavLink
            to="/home"
            label={copy.nav.back}
            ariaLabel={copy.nav.backAriaLabel}
            className="w-full"
          />
        </div>
      </ScreenShell>
    );
  }

  const trendsWithData = caregiver.trends.filter((trend) => trend.points.length > 0);

  return (
    <ScreenShell
      variant="wide"
      textScale={settings.textScale}
      ariaLabelledBy={CAREGIVER_HEADING_ID}
      className="gap-6"
    >
      <p className="sr-only" role="status" aria-live="polite">
        {caregiver.liveAnnouncement}
      </p>

      <StaggerFadeIn animationKey="caregiver-header">
        <HomeHeader
          title={copy.title}
          subtitle={copy.subtitle}
          headingId={CAREGIVER_HEADING_ID}
        />
      </StaggerFadeIn>

      <StaggerFadeIn animationKey="caregiver-banner" delayMs={STAGGER_MS}>
        <p className="rounded-lg bg-secondary/40 px-4 py-3 text-sm font-medium text-foreground">
          {copy.banner}
        </p>
      </StaggerFadeIn>

      {/* Note compose + the short single-topic status cards below are same-kind tiles —
          auto-fit spreads them 1/2/3-up as the wide shell widens. The (wider) trends-chart
          panels stay their own full section, gridded separately below. */}
      <div className="fluid-grid">
        <StaggerFadeIn animationKey="caregiver-note" delayMs={STAGGER_MS * 2}>
          <SoftPanel aria-labelledby="caregiver-note-heading" className="flex h-full flex-col gap-3 p-4">
            <h2 id="caregiver-note-heading" className="text-lg font-semibold text-foreground">
              {copy.note.heading}
            </h2>
            <div className="space-y-2">
              <Label htmlFor="caregiver-note-input">{copy.note.label}</Label>
              <Input
                id="caregiver-note-input"
                value={caregiver.noteText}
                maxLength={thresholds.caregiver.noteMaxLength}
                disabled={caregiver.noteSaving}
                onChange={(event) => caregiver.setNoteText(event.target.value)}
              />
              <p className="text-sm text-muted-foreground">{copy.note.hint}</p>
            </div>
            {caregiver.noteSaveFeedback ? (
              <p className="text-sm font-medium text-foreground" role="status" aria-live="polite">
                {caregiver.noteSaveFeedback}
              </p>
            ) : null}
            {caregiver.noteErrorMessage ? (
              <p className="text-sm text-destructive" role="alert">
                {caregiver.noteErrorMessage}
              </p>
            ) : null}
            <Button
              type="button"
              className="mt-auto"
              disabled={caregiver.noteSaving || caregiver.noteText.trim().length === 0}
              aria-label={copy.note.saveAriaLabel}
              onClick={() => void caregiver.saveNote()}
            >
              {caregiver.noteSaving ? copy.note.saving : copy.note.save}
            </Button>
          </SoftPanel>
        </StaggerFadeIn>

        {caregiver.status === 'empty' ? (
          <StaggerFadeIn animationKey="caregiver-empty" delayMs={STAGGER_MS * 2}>
            <SoftPanel>
              <h2 className="text-lg font-semibold text-foreground">
                {copy.empty.title}
              </h2>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                {copy.empty.body}
              </p>
            </SoftPanel>
          </StaggerFadeIn>
        ) : (
          <>
            {caregiver.adherence ? (
              <StaggerFadeIn animationKey="caregiver-adherence" delayMs={STAGGER_MS * 2}>
                <SoftPanel aria-labelledby="caregiver-adherence-heading">
                  <h2
                    id="caregiver-adherence-heading"
                    className="text-lg font-semibold text-foreground"
                  >
                    {copy.adherence.heading}
                  </h2>
                  <p className="mt-2 text-base text-foreground">
                    {copy.adherence.completionRate(
                      Math.round(caregiver.adherence.completionRate * 100),
                    )}
                  </p>
                  <p className="mt-1 text-base text-muted-foreground">
                    {copy.adherence.sessionsPerWeek(
                      caregiver.adherence.sessionsPerWeek.join(', ') || '0',
                    )}
                  </p>
                </SoftPanel>
              </StaggerFadeIn>
            ) : null}

            {caregiver.lastSessionSummary ? (
              <StaggerFadeIn animationKey="caregiver-last" delayMs={STAGGER_MS * 4}>
                <SoftPanel aria-labelledby="caregiver-last-heading">
                  <h2
                    id="caregiver-last-heading"
                    className="text-lg font-semibold text-foreground"
                  >
                    {copy.lastSessionHeading}
                  </h2>
                  <p className="mt-2 text-base text-foreground">
                    {caregiver.lastSessionSummary}
                  </p>
                </SoftPanel>
              </StaggerFadeIn>
            ) : null}

            <StaggerFadeIn animationKey="caregiver-quality" delayMs={STAGGER_MS * 5}>
              <SoftPanel aria-labelledby="caregiver-quality-heading">
                <h2
                  id="caregiver-quality-heading"
                  className="text-lg font-semibold text-foreground"
                >
                  {copy.measurementQuality.heading}
                </h2>
                <p className="mt-2 text-base text-muted-foreground">
                  {caregiver.clearlyCapturedPct === null
                    ? copy.measurementQuality.unavailable
                    : copy.measurementQuality.value(caregiver.clearlyCapturedPct)}
                </p>
              </SoftPanel>
            </StaggerFadeIn>
          </>
        )}
      </div>

      {caregiver.status !== 'empty' ? (
        <>
          {trendsWithData.length > 0 ? (
            <StaggerFadeIn animationKey="caregiver-trends" delayMs={STAGGER_MS * 3}>
              <section aria-labelledby="caregiver-trends-heading" className="space-y-4">
                <h2
                  id="caregiver-trends-heading"
                  className="text-lg font-semibold text-foreground"
                >
                  {copy.trendsHeading}
                </h2>
                <div className="fluid-grid">
                  {trendsWithData.map((trend) => (
                    <SoftPanel key={trend.exerciseId}>
                      <h3 className="mb-2 text-base font-medium text-foreground">
                        {exercises[trend.exerciseId].displayName}
                      </h3>
                      {/* Visual chart for sighted users; the SVG carries no data a screen
                          reader can read, so it is hidden and the same series is exposed as an
                          sr-only data table (FRONTEND §4 — trend data must be AT-reachable). */}
                      <div aria-hidden="true">
                        <TrendsChart
                          exerciseName={exercises[trend.exerciseId].displayName}
                          points={trend.points}
                          granularity={trend.granularity}
                          highContrast={settings.highContrast}
                        />
                      </div>
                      <TrendsDataTable
                        points={trend.points}
                        granularity={trend.granularity}
                        className="sr-only"
                      />
                    </SoftPanel>
                  ))}
                </div>
              </section>
            </StaggerFadeIn>
          ) : null}
        </>
      ) : null}

      <div className="mt-auto max-w-shell flex flex-col gap-1 border-t border-border/60 pt-6">
        <QuietNavLink
          to="/export"
          label={copy.exportLink}
          ariaLabel={copy.exportLinkAriaLabel}
          className="w-full"
        />
        <QuietNavLink
          to="/home"
          label={copy.nav.back}
          ariaLabel={copy.nav.backAriaLabel}
          className="w-full"
        />
      </div>
    </ScreenShell>
  );
}
