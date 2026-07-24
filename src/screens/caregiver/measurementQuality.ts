import type { SessionRecordFull } from '@/data/storage';

/**
 * Average fraction of clearly-captured frames across every exercise result in `sessions`
 * (0..1), or null when there are no results to average. `lowQualityFramePct` is the fraction
 * of frames the QualityMonitor rejected, so the clearly-captured fraction is its complement.
 * Presentation-only (CaregiverScreen "measurement quality" line, FRONTEND §2.7); never a score.
 */
export function clearlyCapturedFraction(
  sessions: SessionRecordFull[],
): number | null {
  const pcts: number[] = [];
  for (const session of sessions) {
    for (const result of session.results) {
      pcts.push(result.lowQualityFramePct);
    }
  }
  if (pcts.length === 0) {
    return null;
  }
  const avgLowQuality = pcts.reduce((sum, p) => sum + p, 0) / pcts.length;
  return 1 - avgLowQuality;
}
