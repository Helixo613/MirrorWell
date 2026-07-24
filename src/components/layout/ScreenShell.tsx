import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ScreenShellProps {
  children: ReactNode;
  className?: string;
  /** 1.0–2.0 from AppSettings.textScale */
  textScale?: number;
  /** id of the primary heading for aria-labelledby */
  ariaLabelledBy?: string;
  style?: React.CSSProperties;
  /**
   * `reading` (default): centered, capped at a comfortable prose measure —
   * onboarding text/steps, the only screen where a narrow column is correct.
   * `wide`: NO max-width — fills AppShell's fluid flex-1 main beside the
   * sidebar. Hub/data/session screens. Content spread at that width is
   * `.fluid-grid`'s job (auto-fit columns), not a container cap — re-capping
   * every screen here is exactly the "phone app stretched onto desktop" bug
   * (owner feedback 2026-07-24).
   */
  variant?: 'reading' | 'wide';
}

export function ScreenShell({
  children,
  className,
  textScale = 1,
  ariaLabelledBy,
  style,
  variant = 'reading',
}: ScreenShellProps) {
  return (
    <main
      aria-labelledby={ariaLabelledBy}
      className={cn(
        'flex min-h-dvh w-full flex-col px-xs py-sm sm:px-sm sm:py-md',
        variant === 'reading' && 'mx-auto max-w-shell',
        className,
      )}
      style={
        {
          ...style,
          '--mw-text-scale': String(textScale),
          fontSize: 'calc(1rem * var(--mw-text-scale, 1))',
        } as React.CSSProperties
      }
    >
      {children}
    </main>
  );
}
