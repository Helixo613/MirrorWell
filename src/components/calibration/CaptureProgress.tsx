import { SegmentProgress } from '@/components/progress/SegmentProgress';
import { cn } from '@/lib/utils';

export interface CaptureProgressProps {
  total: number;
  completed: number;
  label: string;
  className?: string;
}

export function CaptureProgress({
  total,
  completed,
  label,
  className,
}: CaptureProgressProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <p className="text-center text-sm text-muted-foreground">{label}</p>
      <div role="group" aria-label={label}>
        <SegmentProgress
          total={total}
          completed={completed}
          highlightActive
        />
      </div>
    </div>
  );
}
