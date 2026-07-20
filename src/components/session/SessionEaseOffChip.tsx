import { cn } from '@/lib/utils';

export interface SessionEaseOffChipProps {
  message: string;
  visible: boolean;
  className?: string;
}

export function SessionEaseOffChip({
  message,
  visible,
  className,
}: SessionEaseOffChipProps) {
  if (!visible) {
    return null;
  }

  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        'rounded-md border border-safety-border bg-safety px-4 py-2 text-center text-base font-medium text-safety-foreground motion-safe:animate-fade-in',
        className,
      )}
    >
      {message}
    </p>
  );
}
