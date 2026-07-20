import { cn } from '@/lib/utils';

export interface SessionRepCounterProps {
  summary: string;
  label: string;
  className?: string;
}

export function SessionRepCounter({
  summary,
  label,
  className,
}: SessionRepCounterProps) {
  return (
    <p
      className={cn(
        'text-center text-xl font-medium tabular-nums text-foreground',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="sr-only">{label}: </span>
      {summary}
    </p>
  );
}
