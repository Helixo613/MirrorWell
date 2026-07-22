import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface StickyScreenFooterProps {
  children: ReactNode;
  className?: string;
}

/** Shared sticky bottom zone for primary actions (onboarding, home, calibration). */
export function StickyScreenFooter({
  children,
  className,
}: StickyScreenFooterProps) {
  return (
    <footer
      className={cn(
        'sticky bottom-0 z-10 -mx-4 mt-auto border-t border-border/60 bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 backdrop-blur-sm sm:-mx-6 sm:px-6',
        className,
      )}
    >
      {children}
    </footer>
  );
}
