import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { SoftPanel } from '@/components/layout/SoftPanel';
import { strings } from '@/config/strings';
import type { TrendsViewMode } from '@/types/trends';
import { cn } from '@/lib/utils';
import { SteadyPill } from '@/components/trends/SteadyPill';

export interface TrendsChartCardProps {
  caption: string;
  steadyLabels: string[];
  viewMode: TrendsViewMode;
  isRefreshing?: boolean;
  onToggleViewMode: () => void;
  children: ReactNode;
  className?: string;
}

export function TrendsChartCard({
  caption,
  steadyLabels,
  viewMode,
  isRefreshing = false,
  onToggleViewMode,
  children,
  className,
}: TrendsChartCardProps) {
  return (
    <SoftPanel
      labelledBy={!isRefreshing && caption ? 'trends-chart-caption' : undefined}
      ariaLabel={isRefreshing ? strings.trends.refreshing : undefined}
      ariaBusy={isRefreshing}
      className={cn('space-y-4', className)}
    >
      <div
        className={cn(
          'transition-opacity motion-reduce:transition-none',
          isRefreshing && 'pointer-events-none opacity-60',
        )}
      >
        {children}
      </div>

      {!isRefreshing && caption ? (
        <p
          id="trends-chart-caption"
          className="text-base leading-relaxed text-foreground"
        >
          {caption}
        </p>
      ) : null}

      {!isRefreshing && steadyLabels.length > 0 ? (
        <div
          className="flex flex-wrap gap-2"
          aria-label={strings.trends.a11y.steadyPeriodsLabel}
        >
          {steadyLabels.map((label) => (
            <SteadyPill key={label} label={label} />
          ))}
        </div>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        aria-label={
          viewMode === 'chart'
            ? strings.trends.table.toggleShowAriaLabel
            : strings.trends.table.toggleHideAriaLabel
        }
        onClick={onToggleViewMode}
      >
        {viewMode === 'chart'
          ? strings.trends.table.toggleShow
          : strings.trends.table.toggleHide}
      </Button>
    </SoftPanel>
  );
}
