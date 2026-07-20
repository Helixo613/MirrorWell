import { cn } from '@/lib/utils';

export interface SegmentProgressProps {
  total: number;
  /** Number of fully completed segments */
  completed: number;
  className?: string;
  /** Visually highlight the active segment (current step) */
  highlightActive?: boolean;
}

export function SegmentProgress({
  total,
  completed,
  className,
  highlightActive = true,
}: SegmentProgressProps) {
  return (
    <div className={cn('flex gap-1.5', className)}>
      {Array.from({ length: total }, (_, index) => {
        const isComplete = index < completed;
        const isActive = highlightActive && index === completed;
        return (
          <div
            key={index}
            aria-hidden
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-200',
              isComplete && 'bg-primary',
              isActive && !isComplete && 'bg-primary/50',
              !isComplete && !isActive && 'bg-muted-foreground/25',
            )}
          />
        );
      })}
    </div>
  );
}
