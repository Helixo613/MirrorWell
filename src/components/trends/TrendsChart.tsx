import { useEffect, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { strings } from '@/config/strings';
import { formatPeriodLabel } from '@/lib/trendPeriods';
import { symmetryPlainLabel } from '@/lib/summaryMetrics';
import type { TrendGranularity, TrendPoint } from '@/types/trends';
import { cn } from '@/lib/utils';

export interface TrendsChartProps {
  exerciseName: string;
  points: TrendPoint[];
  granularity: TrendGranularity;
  highContrast: boolean;
  className?: string;
}

interface ChartRow {
  periodStart: string;
  label: string;
  symmetry: number;
  plainSymmetry: string;
  steady: boolean;
}

function toChartRows(
  points: TrendPoint[],
  granularity: TrendGranularity,
): ChartRow[] {
  return points
    .filter((point) => point.meanSymmetryIndex !== null)
    .map((point, index) => ({
      periodStart: point.periodStart,
      label: formatPeriodLabel(point.periodStart, granularity),
      symmetry: point.meanSymmetryIndex ?? 0,
      plainSymmetry: symmetryPlainLabel(point.meanSymmetryIndex),
      steady: index > 0 && !point.aboveNoiseFloor,
    }));
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
}) {
  if (!active || !payload?.[0]) {
    return null;
  }
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm">
      <p className="font-medium text-foreground">{row.label}</p>
      <p className="text-muted-foreground">{row.plainSymmetry}</p>
      {row.steady ? (
        <p className="text-muted-foreground">{strings.trends.steadyPill}</p>
      ) : null}
    </div>
  );
}

export function TrendsChart({
  exerciseName,
  points,
  granularity,
  highContrast,
  className,
}: TrendsChartProps) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const rows = toChartRows(points, granularity);

  if (rows.length === 0) {
    return null;
  }

  const stroke = highContrast ? 'hsl(var(--foreground))' : 'hsl(var(--primary))';
  const fill = highContrast ? 'hsl(var(--foreground))' : 'hsl(var(--primary))';

  return (
    <div
      className={cn('h-56 w-full sm:h-64', className)}
      role="img"
      aria-label={strings.trends.chart.ariaLabel(exerciseName)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={rows}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            stroke="hsl(var(--border))"
            strokeDasharray="4 4"
            vertical={false}
            strokeOpacity={0.6}
          />
          <XAxis
            dataKey="label"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            axisLine={{ stroke: 'hsl(var(--border))' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis domain={[0, 1]} hide aria-hidden />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="symmetry"
            fill={fill}
            fillOpacity={highContrast ? 0.12 : 0.15}
            stroke="none"
            isAnimationActive={!reduceMotion}
            animationDuration={400}
          />
          <Line
            type="monotone"
            dataKey="symmetry"
            stroke={stroke}
            strokeWidth={2}
            dot={{ r: 4, fill: stroke, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={!reduceMotion}
            animationDuration={400}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
