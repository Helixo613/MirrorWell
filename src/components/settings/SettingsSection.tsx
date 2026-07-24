import type { ReactNode } from 'react';
import { SoftPanel } from '@/components/layout/SoftPanel';
import { cn } from '@/lib/utils';

export interface SettingsSectionProps {
  title: string;
  headingId: string;
  children: ReactNode;
  className?: string;
}

export function SettingsSection({
  title,
  headingId,
  children,
  className,
}: SettingsSectionProps) {
  return (
    <section aria-labelledby={headingId} className={cn('space-y-2', className)}>
      <h2
        id={headingId}
        className="px-1 text-sm font-medium text-muted-foreground"
      >
        {title}
      </h2>
      <SoftPanel className="divide-y divide-border/60 border border-border/50 p-0">
        {children}
      </SoftPanel>
    </section>
  );
}
