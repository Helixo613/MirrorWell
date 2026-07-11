import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CalibrationActionBarProps {
  children: ReactNode;
  secondary?: ReactNode;
  helperText?: string | null;
  helperId?: string;
  className?: string;
}

export function CalibrationActionBar({
  children,
  secondary,
  helperText,
  helperId = 'calibration-action-helper',
  className,
}: CalibrationActionBarProps) {
  return (
    <footer
      className={cn(
        'sticky bottom-0 z-10 -mx-4 mt-auto flex flex-col gap-3 border-t border-border bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-sm sm:-mx-6 sm:px-6',
        className,
      )}
    >
      {helperText ? (
        <p
          id={helperId}
          className="text-center text-sm text-muted-foreground"
          aria-live="polite"
        >
          {helperText}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {secondary ? (
          <div className="order-2 sm:order-1 sm:flex-1">{secondary}</div>
        ) : null}
        <div className="order-1 w-full sm:order-2 sm:flex-[2]">{children}</div>
      </div>
    </footer>
  );
}
