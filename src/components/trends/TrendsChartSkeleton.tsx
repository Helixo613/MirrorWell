import { cn } from '@/lib/utils';

export interface TrendsChartSkeletonProps {
  className?: string;
}

export function TrendsChartSkeleton({ className }: TrendsChartSkeletonProps) {
  return (
    <div
      className={cn('space-y-4', className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="h-56 w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none sm:h-64" />
      <div className="h-4 w-4/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
    </div>
  );
}
