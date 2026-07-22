import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface StaggerFadeInProps {
  children: ReactNode;
  className?: string;
  /** Milliseconds before fade starts; motion-reduce ignores delay */
  delayMs?: number;
  animationKey?: string | number;
}

export function StaggerFadeIn({
  children,
  className,
  delayMs = 0,
  animationKey,
}: StaggerFadeInProps) {
  return (
    <div
      key={animationKey}
      className={cn(
        'motion-safe:animate-fade-in motion-safe:opacity-0 motion-reduce:opacity-100',
        className,
      )}
      style={
        delayMs > 0
          ? { animationDelay: `${delayMs}ms`, animationFillMode: 'both' }
          : { animationFillMode: 'both' }
      }
    >
      {children}
    </div>
  );
}
