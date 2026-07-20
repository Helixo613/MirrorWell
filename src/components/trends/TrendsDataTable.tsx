import { strings } from '@/config/strings';
import { formatPeriodLabel } from '@/lib/trendPeriods';
import { symmetryPlainLabel } from '@/lib/summaryMetrics';
import type { TrendGranularity, TrendPoint } from '@/types/trends';
import { cn } from '@/lib/utils';

export interface TrendsDataTableProps {
  points: TrendPoint[];
  granularity: TrendGranularity;
  className?: string;
}

export function TrendsDataTable({
  points,
  granularity,
  className,
}: TrendsDataTableProps) {
  return (
    <div className={cn('overflow-x-auto rounded-md border border-border/60', className)}>
      <table className="w-full min-w-[20rem] text-left text-sm">
        <caption className="sr-only">{strings.trends.table.caption}</caption>
        <thead className="bg-secondary/40">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              {strings.trends.table.period}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {strings.trends.table.symmetry}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {strings.trends.table.sessions}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {strings.trends.table.change}
            </th>
          </tr>
        </thead>
        <tbody>
          {points.map((point, index) => (
            <tr key={point.periodStart} className="border-t border-border">
              <td className="px-4 py-3">
                {formatPeriodLabel(point.periodStart, granularity)}
              </td>
              <td className="px-4 py-3">
                {symmetryPlainLabel(point.meanSymmetryIndex)}
              </td>
              <td className="px-4 py-3 tabular-nums">{point.sampleCount}</td>
              <td className="px-4 py-3">
                {index === 0
                  ? '—'
                  : point.aboveNoiseFloor
                    ? strings.trends.table.noticeable
                    : strings.trends.table.steady}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
