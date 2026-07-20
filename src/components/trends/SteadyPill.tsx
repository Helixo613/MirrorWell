import { cn } from '@/lib/utils';

export interface SteadyPillProps {
  label: string;
  className?: string;
}

export function SteadyPill({ label, className }: SteadyPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-secondary px-3 py-1 text-sm font-medium text-muted-foreground',
        className,
      )}
    >
      {label}
    </span>
  );
}
