import { FadeIn } from '@/components/motion/FadeIn';
import { cn } from '@/lib/utils';
import type { SessionStatusVariant } from '@/lib/sessionStatus';

export interface SessionStatusStripProps {
  message: string;
  variant: SessionStatusVariant;
  className?: string;
}

export function SessionStatusStrip({
  message,
  variant,
  className,
}: SessionStatusStripProps) {
  return (
    <FadeIn animationKey={message}>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={cn(
          'rounded-lg px-4 py-3 text-center text-base font-medium',
          variant === 'safety' &&
            'border border-safety-border bg-safety text-safety-foreground',
          variant === 'muted' && 'text-muted-foreground',
          className,
        )}
      >
        {message}
      </p>
    </FadeIn>
  );
}
