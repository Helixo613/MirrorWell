import { SoftPanel } from '@/components/layout/SoftPanel';
import { cn } from '@/lib/utils';

export interface TrendsEmptyStateProps {
  title: string;
  body: string;
  className?: string;
}

export function TrendsEmptyState({
  title,
  body,
  className,
}: TrendsEmptyStateProps) {
  return (
    <SoftPanel
      labelledBy="trends-empty-title"
      className={cn('space-y-2', className)}
    >
      <h2 id="trends-empty-title" className="text-lg font-semibold">
        {title}
      </h2>
      <p className="text-base leading-relaxed text-muted-foreground">{body}</p>
    </SoftPanel>
  );
}
