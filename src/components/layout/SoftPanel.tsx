import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SoftPanelProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  labelledBy?: string;
  ariaLabel?: string;
  ariaBusy?: boolean;
}

/** Calm secondary surface — shared by summary, trends, and export cards. */
export function SoftPanel({
  children,
  className,
  as: Component = 'section',
  labelledBy,
  ariaLabel,
  ariaBusy,
}: SoftPanelProps) {
  return (
    <Component
      aria-labelledby={labelledBy}
      aria-label={ariaLabel}
      aria-busy={ariaBusy}
      className={cn(
        'rounded-lg bg-secondary/30 p-5 sm:p-6',
        className,
      )}
    >
      {children}
    </Component>
  );
}
