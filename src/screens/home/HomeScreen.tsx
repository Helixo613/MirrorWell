import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BlockingNotice } from '@/components/feedback/BlockingNotice';
import { HomeActionFooter } from '@/components/home/HomeActionFooter';
import { AdherenceGarden } from '@/components/progress/AdherenceGarden';
import { HomeEmptyState } from '@/components/home/HomeEmptyState';
import { HOME_HEADING_ID, HomeHeader } from '@/components/home/HomeHeader';
import { LastSessionLine } from '@/components/home/LastSessionLine';
import { PrimaryActionButton } from '@/components/home/PrimaryActionButton';
import { RecalibrationCard } from '@/components/home/RecalibrationCard';
import { ScreenShell } from '@/components/layout/ScreenShell';
import { StaggerFadeIn } from '@/components/motion/StaggerFadeIn';
import { strings } from '@/config/strings';
import { useAppState } from '@/context/useAppState';
import { useHomeScreen } from '@/hooks/useHomeScreen';
import { greetingFor } from '@/screens/home/homeHelpers';
import { gardenWeeks } from '@/screens/home/gardenData';
import { milestonesFrom } from '@/screens/home/milestones';
import { practiceRhythmFrom, showsRhythmCount } from '@/screens/home/practiceRhythm';

const STAGGER_MS = 60;

export function HomeScreen() {
  const navigate = useNavigate();
  const { profile } = useAppState();
  const profileCreatedAt = profile?.createdAt ?? '';
  const assignedExerciseCount = profile?.assignedExercises.length ?? 0;

  const {
    status,
    settings,
    showRecalibration,
    lastSessionSummary,
    isFirstRun,
    errorTitle,
    errorBody,
    sessions,
  } = useHomeScreen(profileCreatedAt, assignedExerciseCount);

  const gardenToday = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const garden = gardenWeeks(
    sessions.map((session) => session.startedAt.slice(0, 10)),
    gardenToday,
  );
  const milestones = milestonesFrom(sessions).filter((milestone) => milestone.achieved);
  const rhythm = practiceRhythmFrom(
    sessions.map((session) => session.startedAt.slice(0, 10)),
    gardenToday,
  );

  const startSession = useCallback(() => {
    navigate('/session');
  }, [navigate]);

  const goToCalibration = useCallback(() => {
    navigate('/calibration');
  }, [navigate]);

  useEffect(() => {
    if (status !== 'loading' && status !== 'error') {
      const heading = document.getElementById(HOME_HEADING_ID);
      heading?.focus({ preventScroll: true });
    }
  }, [status]);

  if (status === 'loading') {
    return (
      <ScreenShell textScale={settings.textScale}>
        <p
          className="flex flex-1 items-center justify-center text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {strings.home.loading}
        </p>
      </ScreenShell>
    );
  }

  if (status === 'error' && errorTitle && errorBody) {
    return (
      <ScreenShell textScale={settings.textScale}>
        <BlockingNotice title={errorTitle} body={errorBody} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      textScale={settings.textScale}
      ariaLabelledBy={HOME_HEADING_ID}
      className="gap-10 lg:max-w-4xl"
    >
      <div className="flex flex-1 flex-col gap-10">
        <StaggerFadeIn animationKey={status}>
          <HomeHeader
            title={greetingFor(new Date().getHours(), profile?.nickname)}
            subtitle={strings.home.subtitle}
          >
            {profile?.motivation ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {profile.motivation}
              </p>
            ) : null}
          </HomeHeader>
        </StaggerFadeIn>

        <StaggerFadeIn animationKey={`${status}-garden`} delayMs={STAGGER_MS}>
          <AdherenceGarden weeks={garden} />
        </StaggerFadeIn>

        {/* Practice rhythm (SAFETY §8 carve-out). Rendered only when there is something the user
            has done; when the run ends this whole block disappears with no reset state, which is
            what keeps the count free of loss framing. */}
        {rhythm.days > 0 ? (
          <section aria-label={strings.home.rhythm.label} className="flex flex-wrap items-center gap-3">
            {showsRhythmCount(rhythm) ? (
              <span
                className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                aria-label={strings.home.rhythm.countAriaLabel(rhythm.days)}
              >
                {strings.home.rhythm.count(rhythm.days)}
              </span>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {rhythm.practicedToday
                ? strings.home.rhythm.practicedToday
                : strings.home.rhythm.openInvitation}
            </p>
          </section>
        ) : null}

        {milestones.length > 0 ? (
          <section aria-label={strings.home.milestones.label} className="flex flex-wrap gap-2">
            {milestones.map((milestone) => (
              <span key={milestone.id} className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                {strings.home.milestones[milestone.id]}
              </span>
            ))}
          </section>
        ) : null}

        <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          {isFirstRun ? (
            <StaggerFadeIn animationKey={`${status}-empty`} delayMs={STAGGER_MS}>
              <HomeEmptyState
                title={strings.home.empty.title}
                body={strings.home.empty.body}
              />
            </StaggerFadeIn>
          ) : null}

          {lastSessionSummary ? (
            <StaggerFadeIn
              animationKey={`${status}-last`}
              delayMs={STAGGER_MS * 2}
            >
              <LastSessionLine
                summary={lastSessionSummary}
                label={strings.home.lastSession.label}
              />
            </StaggerFadeIn>
          ) : null}

          {showRecalibration ? (
            <StaggerFadeIn
              animationKey={`${status}-recal`}
              delayMs={STAGGER_MS * (lastSessionSummary ? 3 : 2)}
            >
              <RecalibrationCard
                title={strings.home.recalibration.title}
                body={strings.home.recalibration.body}
                actionLabel={strings.home.recalibration.action}
                actionAriaLabel={strings.home.recalibration.actionAriaLabel}
                onRecalibrate={goToCalibration}
              />
            </StaggerFadeIn>
          ) : null}
        </div>

        <StaggerFadeIn animationKey={`${status}-footer`} delayMs={STAGGER_MS * 3}>
          <HomeActionFooter
            primaryAction={
              <PrimaryActionButton
                label={strings.home.startExercises}
                aria-label={strings.home.startExercisesAriaLabel}
                onClick={startSession}
              />
            }
          />
        </StaggerFadeIn>
      </div>
    </ScreenShell>
  );
}
