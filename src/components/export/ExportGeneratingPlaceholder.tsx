import { strings } from '@/config/strings';
import { cn } from '@/lib/utils';

export interface ExportGeneratingPlaceholderProps {
  className?: string;
}

export function ExportGeneratingPlaceholder({
  className,
}: ExportGeneratingPlaceholderProps) {
  return (
    <div
      className={cn('space-y-3', className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="h-20 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      <p className="sr-only">{strings.export.generating}</p>
    </div>
  );
}
