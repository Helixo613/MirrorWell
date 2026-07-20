import { SegmentedControl } from '@/components/controls/SegmentedControl';
import type { SegmentedControlOption } from '@/components/controls/SegmentedControl';
import { cn } from '@/lib/utils';

export interface TrendsControlsToolbarProps<TExercise extends string> {
  exerciseLabel: string;
  granularityLabel: string;
  showExerciseSelector: boolean;
  showGranularity: boolean;
  exerciseOptions: SegmentedControlOption<TExercise>[];
  selectedExercise: TExercise;
  onExerciseChange: (value: TExercise) => void;
  granularityOptions: SegmentedControlOption<'weekly' | 'monthly'>[];
  granularity: 'weekly' | 'monthly';
  onGranularityChange: (value: 'weekly' | 'monthly') => void;
  className?: string;
}

export function TrendsControlsToolbar<TExercise extends string>({
  exerciseLabel,
  granularityLabel,
  showExerciseSelector,
  showGranularity,
  exerciseOptions,
  selectedExercise,
  onExerciseChange,
  granularityOptions,
  granularity,
  onGranularityChange,
  className,
}: TrendsControlsToolbarProps<TExercise>) {
  if (!showExerciseSelector && !showGranularity) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6',
        className,
      )}
    >
      {showExerciseSelector ? (
        <SegmentedControl
          label={exerciseLabel}
          options={exerciseOptions}
          value={selectedExercise}
          onChange={onExerciseChange}
          className="flex-1"
        />
      ) : null}
      {showGranularity ? (
        <SegmentedControl
          label={granularityLabel}
          options={granularityOptions}
          value={granularity}
          onChange={onGranularityChange}
          className={showExerciseSelector ? 'sm:shrink-0' : 'flex-1'}
        />
      ) : null}
    </div>
  );
}
