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
}

export function ScreenShell({
  children,
  className,
  textScale = 1,
  ariaLabelledBy,
  style,
}: ScreenShellProps) {
  return (
    <main
      aria-labelledby={ariaLabelledBy}
      className={cn(
        'mx-auto flex min-h-dvh w-full max-w-shell flex-col px-xs py-sm sm:px-sm sm:py-md',
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
