import type { ReactNode } from 'react';
import { StickyScreenFooter } from '@/components/layout/StickyScreenFooter';
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
    <StickyScreenFooter className={cn('border-border pt-sm', className)}>
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
    </StickyScreenFooter>
  );
}
