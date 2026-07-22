import { strings } from '@/config/strings';
import { symmetryPlainLabel } from '@/lib/summaryMetrics';
import type { TrendSeries } from '@/types/trends';

type TrendPoints = TrendSeries['points'];

/**
 * Recent direction for one exercise's trend series, for the printable export's enriched rows.
 * Sub-noise-floor change (or too few points) reads "Steady" — never up/down (API §12 semantics:
 * the last point's `aboveNoiseFloor` already encodes whether the most recent period-over-period
 * change cleared the baseline noise floor). Otherwise the sign of that change decides more/less
 * even (a higher meanSymmetryIndex is more even).
 */
export function exportTrendDirection(points: TrendPoints): string {
  if (points.length < 2) {
    return strings.trends.direction.steady;
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  // Trend buckets always carry a non-null mean, but the shared TrendPoint type allows null;
  // with no comparable value there is no direction to report, so read Steady.
  if (
    !last.aboveNoiseFloor ||
    last.meanSymmetryIndex === null ||
    prev.meanSymmetryIndex === null
  ) {
    return strings.trends.direction.steady;
  }
  return last.meanSymmetryIndex >= prev.meanSymmetryIndex
    ? strings.trends.direction.moreEven
    : strings.trends.direction.lessEven;
}

/**
 * Latest value for one exercise's series as a plain-language symmetry label (no numeric grade),
 * reusing the helper the summary/trends surfaces use. An em-dash when there is no data.
 */
export function exportTrendLatestLabel(points: TrendPoints): string {
  if (points.length === 0) {
    return '—';
  }
  return symmetryPlainLabel(points[points.length - 1].meanSymmetryIndex);
}
