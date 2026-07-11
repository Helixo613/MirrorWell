import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CollapsibleDetailsProps {
  title: string;
  children: ReactNode;
  className?: string;
  /** id for aria-labelledby on external sections */
  headingId?: string;
}

export function CollapsibleDetails({
  title,
  children,
  className,
  headingId,
}: CollapsibleDetailsProps) {
  return (
    <details
      className={cn(
        'group rounded-lg border border-border/60 bg-secondary/20',
        className,
      )}
    >
      <summary className="min-h-touch cursor-pointer list-none px-5 py-4 text-base font-medium leading-snug text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          <span id={headingId}>{title}</span>
          <span
            aria-hidden
            className="text-muted-foreground transition-transform motion-reduce:transition-none group-open:rotate-180"
          >
            ▾
          </span>
        </span>
      </summary>
      <div className="border-t border-border/60 px-5 pb-5 pt-2 text-base leading-relaxed text-foreground">
        {children}
      </div>
    </details>
  );
}
