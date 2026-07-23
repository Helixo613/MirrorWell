import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BlockingNotice } from '@/components/feedback/BlockingNotice';
import { HomeActionFooter } from '@/components/home/HomeActionFooter';
import { HomeEmptyState } from '@/components/home/HomeEmptyState';
import { HOME_HEADING_ID, HomeHeader } from '@/components/home/HomeHeader';
import { LastSessionLine } from '@/components/home/LastSessionLine';
import { PrimaryActionButton } from '@/components/home/PrimaryActionButton';
import { RecalibrationCard } from '@/components/home/RecalibrationCard';
import { ScreenShell } from '@/components/layout/ScreenShell';
import { StaggerFadeIn } from '@/components/motion/StaggerFadeIn';
import {
  QuietNavItem,
  QuietNavList,
} from '@/components/navigation/QuietNavList';
import { QuietNavLink } from '@/components/navigation/QuietNavLink';
import { strings } from '@/config/strings';
import { useAppState } from '@/context/useAppState';
import { useHomeScreen } from '@/hooks/useHomeScreen';
import { greetingFor } from '@/screens/home/homeHelpers';

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
  } = useHomeScreen(profileCreatedAt, assignedExerciseCount);

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

  const navigation = (
    <QuietNavList label={strings.home.nav.label} className="border-t-0 pt-0">
      <QuietNavItem>
        <QuietNavLink
          to="/trends"
          label={strings.home.nav.trends}
          ariaLabel={strings.home.nav.trendsAriaLabel}
        />
      </QuietNavItem>
      <QuietNavItem>
        <QuietNavLink
          to="/export"
          label={strings.home.nav.export}
          ariaLabel={strings.home.nav.exportAriaLabel}
        />
      </QuietNavItem>
      <QuietNavItem>
        <QuietNavLink
          to="/settings"
          label={strings.home.nav.settings}
          ariaLabel={strings.home.nav.settingsAriaLabel}
        />
      </QuietNavItem>
      {settings.caregiverViewEnabled ? (
        <QuietNavItem>
          <QuietNavLink
            to="/caregiver"
            label={strings.home.nav.caregiver}
            ariaLabel={strings.home.nav.caregiverAriaLabel}
          />
        </QuietNavItem>
      ) : null}
    </QuietNavList>
  );

  return (
    <ScreenShell
      textScale={settings.textScale}
      ariaLabelledBy={HOME_HEADING_ID}
      className="gap-10"
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

        <div className="flex flex-col gap-8">
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
            navigation={navigation}
          />
        </StaggerFadeIn>
      </div>
    </ScreenShell>
  );
}
