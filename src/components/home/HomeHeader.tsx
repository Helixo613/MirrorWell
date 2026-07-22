import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const HOME_HEADING_ID = 'home-heading';

export interface HomeHeaderProps {
  title: string;
  subtitle?: string | null;
  headingId?: string;
  className?: string;
  children?: ReactNode;
}

export function HomeHeader({
  title,
  subtitle,
  headingId = HOME_HEADING_ID,
  className,
  children,
}: HomeHeaderProps) {
  return (
    <header className={cn('space-y-3 pt-2', className)}>
      <h1
        id={headingId}
        tabIndex={-1}
        className="text-2xl font-semibold tracking-tight text-foreground outline-none sm:text-3xl"
      >
        {title}
      </h1>
      {subtitle ? (
        <p className="text-base leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
      ) : null}
      {children}
    </header>
  );
}
