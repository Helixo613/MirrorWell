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
import { symmetryPlainLabel } from '@/lib/summaryMetrics';

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
  const hasResults = record.results.length > 0;

  return (
    <ScreenShell
      textScale={textScale}
      ariaLabelledBy={headingId}
      className="gap-0 pb-0"
    >
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <DemoWatermark label={strings.summary.demoWatermark} visible={isDemo} />

      <div className="flex flex-1 flex-col gap-6 pb-6">
        <StaggerFadeIn animationKey="summary-header">
          <HomeHeader
            title={strings.summary.title}
            subtitle={strings.summary.encouraging}
            headingId={headingId}
          />
        </StaggerFadeIn>

        {hasResults ? (
          <section
            aria-label={strings.summary.exerciseListLabel}
            className="flex flex-col gap-4"
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
