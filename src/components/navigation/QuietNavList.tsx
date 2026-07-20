import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface QuietNavListProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function QuietNavList({ label, children, className }: QuietNavListProps) {
  return (
    <nav aria-label={label} className={cn('mt-auto pt-2', className)}>
      <ul className="flex flex-col gap-2">{children}</ul>
    </nav>
  );
}

export interface QuietNavItemProps {
  children: ReactNode;
}

export function QuietNavItem({ children }: QuietNavItemProps) {
  return <li>{children}</li>;
}
