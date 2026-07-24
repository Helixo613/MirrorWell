import { useMemo } from 'react';
import { DemoWatermark } from '@/components/session/DemoWatermark';
import { HomeHeader } from '@/components/home/HomeHeader';
import { PrimaryActionButton } from '@/components/home/PrimaryActionButton';
import { ScreenShell } from '@/components/layout/ScreenShell';
import { StickyScreenFooter } from '@/components/layout/StickyScreenFooter';
import { StaggerFadeIn } from '@/components/motion/StaggerFadeIn';
import { SummaryExerciseCard } from '@/components/summary/SummaryExerciseCard';
import { exercises } from '@/config/exercises';
import { strings } from '@/config/strings';
import { useSummaryScreen } from '@/hooks/useSummaryScreen';
import { gentlenessStat, symmetryPlainLabel } from '@/lib/summaryMetrics';
import { milestonesFrom } from '@/screens/home/milestones';

const STAGGER_MS = 60;

export function SummaryScreen() {
  const summary = useSummaryScreen();
  const record = summary.record;

  const announcement = useMemo(() => {
    if (!record) {
      return '';
    }
    const lines = record.results.map((result) =>
      strings.summary.a11y.exerciseLine(
        exercises[result.exerciseId].displayName,
        result.repsCompleted,
        symmetryPlainLabel(result.meanSymmetryIndex),
      ),
    );
    return [strings.summary.a11y.announcement, ...lines].join(' ');
  }, [record]);

  if (summary.status === 'redirecting' || !record) {
    return null;
  }

  const { isDemo, textScale, highContrast, handleDone, headingId } = summary;
  const milestones = milestonesFrom(summary.history).filter((milestone) => milestone.achieved);
  const hasResults = record.results.length > 0;
  const { gentle, total } = gentlenessStat(record.results);
  const celebration =
    gentle === total
      ? strings.summary.celebration.allGentle
      : strings.summary.celebration.someGentle(gentle, total);

  return (
    <ScreenShell
      textScale={textScale}
      ariaLabelledBy={headingId}
      className="gap-0 pb-0 md:max-w-shell-wide"
    >
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <DemoWatermark label={strings.summary.demoWatermark} visible={isDemo} />

      <div className="flex flex-1 flex-col gap-6 pb-6">
        <StaggerFadeIn animationKey="summary-header">
          <HomeHeader
            title={strings.summary.title}
            headingId={headingId}
          />
        </StaggerFadeIn>

        {total > 0 ? (
          <section
            aria-label={strings.summary.celebration.label}
            className="motion-safe:animate-[summary-celebration_400ms_ease-out_both] rounded-2xl border border-primary/20 bg-primary/5 p-5"
          >
            <style>{`@keyframes summary-celebration { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: scale(1); } } @keyframes summary-check { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }`}</style>
            <div className="flex items-start gap-3">
              <svg
                aria-hidden="true"
                className="mt-0.5 h-7 w-7 shrink-0 text-primary"
                viewBox="0 0 24 24"
              >
                <path
                  className="motion-safe:animate-[summary-check_300ms_ease-out_both]"
                  d="m5 12 4 4L19 6"
                  fill="none"
                  stroke="currentColor"
                  strokeDasharray="24"
                  strokeWidth="2"
                />
              </svg>
              <p className="text-lg font-semibold leading-relaxed text-foreground">
                {celebration}
              </p>
            </div>
          </section>
        ) : null}

        {milestones.length > 0 ? (
          <section aria-label={strings.summary.milestones.label} className="flex flex-wrap gap-2">
            {milestones.map((milestone) => (
              <span key={milestone.id} className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                {strings.home.milestones[milestone.id]}
              </span>
            ))}
          </section>
        ) : null}

        {hasResults ? (
          <section
            aria-label={strings.summary.exerciseListLabel}
            className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-4"
          >
            {record.results.map((result, index) => (
              <StaggerFadeIn
                key={result.resultId}
                animationKey={result.resultId}
                delayMs={STAGGER_MS * (index + 1)}
              >
                <SummaryExerciseCard
                  result={result}
                  exerciseName={exercises[result.exerciseId].displayName}
                  headingId={`summary-exercise-${index}`}
                  highContrast={highContrast}
                  animateReveal
                />
              </StaggerFadeIn>
            ))}
          </section>
        ) : (
          <StaggerFadeIn animationKey="summary-empty" delayMs={STAGGER_MS}>
            <p className="text-base leading-relaxed text-muted-foreground">
              {strings.summary.emptyResults}
            </p>
          </StaggerFadeIn>
        )}

        <p className="text-base leading-relaxed text-muted-foreground">
          {strings.summary.qualityNote}
        </p>
      </div>

      <StickyScreenFooter>
        <PrimaryActionButton
          label={isDemo ? strings.summary.demoDone : strings.summary.done}
          aria-label={
            isDemo
              ? strings.summary.demoDoneAriaLabel
              : strings.summary.doneAriaLabel
          }
          onClick={handleDone}
        />
      </StickyScreenFooter>
    </ScreenShell>
  );
}
