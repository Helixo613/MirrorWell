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
        'sticky bottom-0 z-10 -mx-xs mt-auto border-t border-border/60 bg-background/95 px-xs pb-[max(1rem,env(safe-area-inset-bottom))] pt-md backdrop-blur-sm sm:-mx-sm sm:px-sm',
        className,
      )}
    >
      {children}
    </footer>
  );
}
