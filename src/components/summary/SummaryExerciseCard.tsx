import { SymmetryBar } from '@/components/feedback/SymmetryBar';
import { SoftPanel } from '@/components/layout/SoftPanel';
import { strings } from '@/config/strings';
import type { ExerciseResultFull } from '@/data/schema';
import { gentleRepCounts, symmetryPlainLabel } from '@/lib/summaryMetrics';
import { cn } from '@/lib/utils';

export interface SummaryExerciseCardProps {
  result: ExerciseResultFull;
  exerciseName: string;
  headingId: string;
  highContrast: boolean;
  animateReveal?: boolean;
  className?: string;
}

export function SummaryExerciseCard({
  result,
  exerciseName,
  headingId,
  highContrast,
  animateReveal = false,
  className,
}: SummaryExerciseCardProps) {
  const plainSymmetry = symmetryPlainLabel(result.meanSymmetryIndex);
  const { gentle, total } = gentleRepCounts(result.reps);

  return (
    <SoftPanel
      as="article"
      labelledBy={headingId}
      className={cn('space-y-4', className)}
    >
      <header className="space-y-1.5">
        <h2 id={headingId} className="text-lg font-semibold leading-snug">
          {exerciseName}
        </h2>
        <p className="text-base text-muted-foreground">
          {strings.summary.repsDone(result.repsCompleted)}
        </p>
      </header>

      <div className="space-y-1.5">
        {/* Bar carries the accessible label (FRONTEND §4); visible text is decorative. */}
        <p
          className="text-sm font-medium text-muted-foreground"
          aria-hidden
        >
          {strings.summary.symmetry.label}
        </p>
        <SymmetryBar
          value={result.meanSymmetryIndex}
          ariaLabel={strings.summary.symmetry.barAriaLabel(plainSymmetry)}
          highContrast={highContrast}
          subdued={result.meanSymmetryIndex === null}
          animateReveal={animateReveal}
        />
        <p className="text-base text-foreground" aria-hidden>
          {plainSymmetry}
        </p>
      </div>

      {total > 0 ? (
        <p className="text-base leading-relaxed text-muted-foreground">
          {strings.summary.easeOffLine(gentle, total)}
        </p>
      ) : null}
    </SoftPanel>
  );
}
