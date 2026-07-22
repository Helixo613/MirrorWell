import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FadeInProps {
  children: ReactNode;
  className?: string;
  /** Change to re-trigger enter animation (e.g. step index) */
  animationKey: string | number;
}

export function FadeIn({ children, className, animationKey }: FadeInProps) {
  return (
    <div
      key={animationKey}
      className={cn('motion-safe-animate-fade-in', className)}
    >
      {children}
    </div>
  );
}
