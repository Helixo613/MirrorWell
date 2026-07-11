import { cn } from '@/lib/utils';

export interface LastSessionLineProps {
  summary: string;
  label: string;
  className?: string;
}

export function LastSessionLine({
  summary,
  label,
  className,
}: LastSessionLineProps) {
  return (
    <p
      className={cn(
        'text-base leading-relaxed text-muted-foreground',
        className,
      )}
    >
      <span className="sr-only">{label}: </span>
      {summary}
    </p>
  );
}
