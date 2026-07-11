import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface InstructionCardProps {
  title: string;
  body: string;
  subtitle?: string | null;
  meta?: string;
  id?: string;
  className?: string;
  children?: ReactNode;
}

export function InstructionCard({
  title,
  body,
  subtitle,
  meta,
  id,
  className,
  children,
}: InstructionCardProps) {
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
