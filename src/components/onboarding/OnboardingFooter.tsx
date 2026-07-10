import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface OnboardingFooterProps {
  children?: ReactNode;
  helperText?: string | null;
  helperId?: string;
  className?: string;
}

export function OnboardingFooter({
  children,
  helperText,
  helperId = 'onboarding-primary-helper',
  className,
}: OnboardingFooterProps) {
  return (
    <footer
      className={cn(
        'sticky bottom-0 z-10 -mx-4 mt-auto border-t border-border bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-sm sm:-mx-6 sm:px-6',
        className,
      )}
    >
      {helperText ? (
        <p
          id={helperId}
          className="mb-3 text-center text-sm text-muted-foreground"
          aria-live="polite"
        >
          {helperText}
        </p>
      ) : null}
      {children}
    </footer>
  );
}
