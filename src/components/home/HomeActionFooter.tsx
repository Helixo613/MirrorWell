import type { ReactNode } from 'react';
import { StickyScreenFooter } from '@/components/layout/StickyScreenFooter';

export interface HomeActionFooterProps {
  primaryAction: ReactNode;
  navigation?: ReactNode;
  className?: string;
}

export function HomeActionFooter({
  primaryAction,
  navigation,
  className,
}: HomeActionFooterProps) {
  return (
    <StickyScreenFooter className={className}>
      <div className="space-y-6">
        {primaryAction}
        {navigation}
      </div>
    </StickyScreenFooter>
  );
}
