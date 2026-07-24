import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BlockingNotice } from '@/components/feedback/BlockingNotice';
import { HomeHeader } from '@/components/home/HomeHeader';
import { ScreenShell } from '@/components/layout/ScreenShell';
import { StaggerFadeIn } from '@/components/motion/StaggerFadeIn';
import { QuietNavLink } from '@/components/navigation/QuietNavLink';
import { TrendsChart } from '@/components/trends/TrendsChart';
import { TrendsChartCard } from '@/components/trends/TrendsChartCard';
import { TrendsChartSkeleton } from '@/components/trends/TrendsChartSkeleton';
import { TrendsControlsToolbar } from '@/components/trends/TrendsControlsToolbar';
import { TrendsDataTable } from '@/components/trends/TrendsDataTable';
import { TrendsEmptyState } from '@/components/trends/TrendsEmptyState';
import { exercises } from '@/config/exercises';
import { strings } from '@/config/strings';
import { useAppState } from '@/context/useAppState';
import { useTrendsScreen } from '@/hooks/useTrendsScreen';
import type { ExerciseId } from '@/data/schema';
import { TRENDS_HEADING_ID } from '@/types/trends';

const STAGGER_MS = 60;

export function TrendsScreen() {
  const navigate = useNavigate();
  const { profile } = useAppState();
  const assignedExercises = profile?.assignedExercises ?? [];
  const trends = useTrendsScreen(assignedExercises);

  const exerciseOptions = assignedExercises.map((exerciseId) => ({
    value: exerciseId,
    label: exercises[exerciseId].displayName,
    ariaLabel: exercises[exerciseId].displayName,
  }));

  const granularityOptions = [
    {
      value: 'monthly' as const,
      label: strings.trends.granularity.monthly,
      ariaLabel: strings.trends.granularity.monthlyAriaLabel,
    },
    {
      value: 'weekly' as const,
      label: strings.trends.granularity.weekly,
      ariaLabel: strings.trends.granularity.weeklyAriaLabel,
    },
  ];

  const showGranularity = trends.status === 'ready';
  const showExerciseSelector = assignedExercises.length > 1;

  if (trends.isInitialLoading) {
    return (
      <ScreenShell textScale={trends.settings.textScale}>
        <p
          className="flex flex-1 items-center justify-center text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {strings.trends.loading}
        </p>
      </ScreenShell>
    );
  }

  if (trends.status === 'error' && trends.errorTitle && trends.errorBody) {
    return (
      <ScreenShell textScale={trends.settings.textScale}>
        <BlockingNotice
          title={trends.errorTitle}
          body={trends.errorBody}
        />
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="mt-6 w-full"
          onClick={() => navigate('/home')}
        >
          {strings.trends.nav.back}
        </Button>
      </ScreenShell>
    );
  }

  const selectedExercise =
    trends.selectedExerciseId ?? assignedExercises[0] ?? 'EX_SMILE';

  const selectedExerciseName = trends.series
    ? exercises[trends.series.exerciseId].displayName
    : trends.selectedExerciseId
      ? exercises[trends.selectedExerciseId].displayName
      : '';

  return (
    <ScreenShell
      textScale={trends.settings.textScale}
      ariaLabelledBy={TRENDS_HEADING_ID}
      className="gap-6 md:max-w-shell-wide"
    >
      <p className="sr-only" role="status" aria-live="polite">
        {trends.liveAnnouncement}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {trends.viewAnnouncement}
      </p>

      <StaggerFadeIn animationKey="trends-header">
        <HomeHeader
          title={strings.trends.title}
          subtitle={strings.trends.subtitle}
          headingId={TRENDS_HEADING_ID}
        />
      </StaggerFadeIn>

      {trends.isRefreshing ? (
        <p className="sr-only" role="status" aria-live="polite">
          {strings.trends.refreshing}
        </p>
      ) : null}

      {trends.status === 'empty' ? (
        <StaggerFadeIn animationKey="trends-empty" delayMs={STAGGER_MS * 2}>
          <TrendsEmptyState
            title={strings.trends.empty.title}
            body={strings.trends.empty.body}
          />
        </StaggerFadeIn>
      ) : null}

      <div className="flex flex-col gap-6 md:grid md:grid-cols-[240px_1fr] md:items-start md:gap-6">
        {(showExerciseSelector || showGranularity) && (
          <StaggerFadeIn animationKey="trends-controls" delayMs={STAGGER_MS}>
            <TrendsControlsToolbar<ExerciseId>
              exerciseLabel={strings.trends.exerciseSelectorLabel}
              granularityLabel={strings.trends.granularity.label}
              showExerciseSelector={showExerciseSelector}
              showGranularity={showGranularity}
              exerciseOptions={exerciseOptions}
              selectedExercise={selectedExercise}
              onExerciseChange={trends.selectExercise}
              granularityOptions={granularityOptions}
              granularity={trends.granularity}
              onGranularityChange={(value) => void trends.setGranularity(value)}
            />
          </StaggerFadeIn>
        )}

        {trends.status === 'ready' && trends.series ? (
          <StaggerFadeIn
            animationKey={`trends-card-${trends.series.exerciseId}-${trends.viewMode}`}
            delayMs={STAGGER_MS * 2}
          >
            <TrendsChartCard
              caption={trends.caption}
              steadyLabels={trends.steadyLabels}
              viewMode={trends.viewMode}
              isRefreshing={trends.isDisplayPending}
              onToggleViewMode={trends.toggleViewMode}
            >
              {trends.isDisplayPending ? (
                <TrendsChartSkeleton />
              ) : trends.viewMode === 'chart' ? (
                <TrendsChart
                  exerciseName={selectedExerciseName}
                  points={trends.series.points}
                  granularity={trends.series.granularity}
                  highContrast={trends.settings.highContrast}
                />
              ) : (
                <TrendsDataTable
                  points={trends.series.points}
                  granularity={trends.series.granularity}
                />
              )}
            </TrendsChartCard>
          </StaggerFadeIn>
        ) : null}
      </div>

      <div className="mt-auto border-t border-border/60 pt-6">
        <QuietNavLink
          to="/home"
          label={strings.trends.nav.back}
          ariaLabel={strings.trends.nav.backAriaLabel}
          className="w-full"
        />
      </div>
    </ScreenShell>
  );
}
