import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface InstructionCardProps {
  title: string;
  body: string;
  subtitle?: string | null;
  meta?: string;
  id?: string;
  /** `inline` — compact copy under the preview; `card` — bordered panel (default). */
  variant?: 'card' | 'inline';
  className?: string;
  children?: ReactNode;
}

export function InstructionCard({
  title,
  body,
  subtitle,
  meta,
  id,
  variant = 'card',
  className,
  children,
}: InstructionCardProps) {
  if (variant === 'inline') {
    return (
      <section className={cn('space-y-2 text-center', className)}>
        <h1
          id={id}
          tabIndex={-1}
          className="text-lg font-semibold leading-tight outline-none sm:text-xl"
        >
          {title}
        </h1>
        {meta ? (
          <p className="text-sm font-medium text-primary">{meta}</p>
        ) : null}
        <p className="text-base leading-relaxed text-muted-foreground">{body}</p>
        {subtitle ? (
          <p className="text-base leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
        {children}
      </section>
    );
  }

  return (
    <section
      className={cn(
        'space-y-4 rounded-lg border border-border bg-card p-5 sm:p-6',
        className,
      )}
    >
      <header className="space-y-4">
        <h1
          id={id}
          tabIndex={-1}
          className="text-xl font-semibold leading-tight outline-none sm:text-2xl"
        >
          {title}
        </h1>
        {meta ? (
          <p className="text-sm font-medium text-primary">{meta}</p>
        ) : null}
        <p className="text-base leading-loose text-muted-foreground">{body}</p>
        {subtitle ? (
          <p className="text-base leading-loose text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}
