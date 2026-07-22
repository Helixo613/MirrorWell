import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface HomeEmptyStateProps {
  title: string;
  body: string;
  className?: string;
  children?: ReactNode;
}

export function HomeEmptyState({
  title,
  body,
  className,
  children,
}: HomeEmptyStateProps) {
  return (
    <section
      aria-labelledby="home-empty-title"
      className={cn(
        'space-y-3 rounded-lg bg-secondary/40 p-6 sm:p-8',
        className,
      )}
    >
      <h2
        id="home-empty-title"
        className="text-lg font-medium text-foreground"
      >
        {title}
      </h2>
      <p className="text-base leading-relaxed text-muted-foreground">{body}</p>
      {children}
    </section>
  );
}
