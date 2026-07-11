import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { symmetryBarFill } from '@/lib/summaryMetrics';

export interface SymmetryBarProps {
  value: number | null;
  ariaLabel: string;
  highContrast?: boolean;
  subdued?: boolean;
  /** Animate the fill from center outward on mount (skipped under reduced motion). */
  animateReveal?: boolean;
  className?: string;
}

/**
 * Center-anchored horizontal symmetry bar — matches in-session visual language
 * without showing numeric grades (FRONTEND §2.5). Carries the plain-language
 * value as its accessible label (FRONTEND §4).
 */
export function SymmetryBar({
  value,
  ariaLabel,
  highContrast = false,
  subdued = false,
  animateReveal = false,
  className,
}: SymmetryBarProps) {
  const fill = symmetryBarFill(value);
  const [revealed, setRevealed] = useState(!animateReveal);

  useEffect(() => {
    if (!animateReveal) {
      return;
    }
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, [animateReveal]);

  const fillPct = `${(revealed ? fill : 0) * 50}%`;
  const fillColor = highContrast ? 'bg-foreground' : 'bg-primary';

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn('relative h-3 w-full', className)}
    >
      <div
        className={cn(
          'absolute inset-0 overflow-hidden rounded-full bg-muted',
          subdued && 'opacity-60',
        )}
        aria-hidden
      >
        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-muted-foreground/35" />
        <div
          className={cn(
            'absolute inset-y-0 right-1/2 rounded-l-full motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out motion-reduce:transition-none',
            fillColor,
          )}
          style={{ width: fillPct }}
        />
        <div
          className={cn(
            'absolute inset-y-0 left-1/2 rounded-r-full motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out motion-reduce:transition-none',
            fillColor,
          )}
          style={{ width: fillPct }}
        />
      </div>
    </div>
  );
}
