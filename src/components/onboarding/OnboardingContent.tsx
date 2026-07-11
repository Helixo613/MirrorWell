import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { strings } from '@/config/strings';

export interface StepHeadingProps {
  title: string;
  subtitle?: string;
  id?: string;
  className?: string;
}

export function StepHeading({ title, subtitle, id, className }: StepHeadingProps) {
  return (
    <header className={cn('space-y-3', className)}>
      <h1
        id={id}
        tabIndex={-1}
        className="text-2xl font-semibold leading-tight tracking-tight outline-none sm:text-3xl"
      >
        {title}
      </h1>
      {subtitle ? (
        <p className="text-base leading-relaxed text-muted-foreground">{subtitle}</p>
      ) : null}
    </header>
  );
}

export interface ProseBlockProps {
  title: string;
  paragraphs: readonly string[];
  headingId?: string;
  className?: string;
}

export function ProseBlock({
  title,
  paragraphs,
  headingId,
  className,
}: ProseBlockProps) {
  return (
    <article className={cn('space-y-6', className)}>
      <StepHeading title={title} id={headingId} />
      <div className="space-y-4 text-base leading-loose text-muted-foreground">
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </article>
  );
}

export interface SafetyCalloutProps {
  title: string;
  emergency: string;
  paragraphs: readonly string[];
  headingId?: string;
  className?: string;
}

export function SafetyCallout({
  title,
  emergency,
  paragraphs,
  headingId,
  className,
}: SafetyCalloutProps) {
  return (
    <section
      role="region"
      aria-label={strings.onboarding.safetyRegionLabel}
      className={cn(
        'space-y-6 rounded-lg border-l-4 border-safety-border bg-safety p-5 text-safety-foreground sm:p-6',
        className,
      )}
    >
      <StepHeading title={title} id={headingId} />
      <p className="text-base font-semibold leading-loose">{emergency}</p>
      <div className="space-y-4 text-base leading-loose">
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}

export interface BulletListProps {
  items: readonly string[];
  className?: string;
}

export function BulletList({ items, className }: BulletListProps) {
  return (
    <ul
      className={cn(
        'list-disc space-y-3 pl-5 text-base leading-loose text-muted-foreground',
        className,
      )}
    >
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

export interface OnboardingStepFrameProps {
  children: ReactNode;
  className?: string;
}

export function OnboardingStepFrame({
  children,
  className,
}: OnboardingStepFrameProps) {
  return (
    <div className={cn('flex flex-1 flex-col gap-8', className)}>
      {children}
    </div>
  );
}
