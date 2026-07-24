// src/data/export.ts, ExportService (docs/API.md §13, ARCHITECTURE.md §13, SAFETY §8).
// Assembles a printable/exportable summary from TrendsService + StorageService only; no
// Dexie import here. ATTESTED-gated AND demo-blocked: an already-attested user can call
// enterDemoMode(), so both SafetyGate.isDemoMode() and SafetyGate.isAttested() are checked
// (API §17 gate matrix; rationale at the check itself in generateSummary).
import type { EndReason, ExerciseId } from './schema.ts';
import { StorageService } from './storage.ts';
import { TrendsService } from './trends.ts';
import type { Adherence, TrendSeries } from './trends.ts';
import { MirrorWellError } from './errors.ts';
import { SafetyGate } from '../session/safety.ts';
import { strings } from '../config/strings.ts';
import { exercises } from '../config/exercises.ts';
import { exportTrendDirection, exportTrendLatestLabel } from '../lib/exportTrendRow.ts';

const SCHEMA_VERSION = 1 as const;

// Export range is a calendar date (YYYY-MM-DD), not a full timestamp; API.md §13's example
// echoes the input range verbatim in the output ("range": {"from": "2026-05-01", ...}), and
// the frontend contract (tests/schemas/export.schema.json) requires this exact pattern.
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ExportSessionSummary = {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  endReason: EndReason;
  results: Array<{
    resultId: string;
    exerciseId: ExerciseId;
    repsCompleted: number;
    meanSymmetryIndex: number | null;
    meanEffortIndex: number | null;
    easeOffCount: number;
    lowQualityFramePct: number;
  }>;
};

export type ExportSummary = {
  schemaVersion: 1;
  generatedAt: string;
  nonDiagnosticNotice: string;
  range: { from: string; to: string };
  profile: { affectedSide: 'left' | 'right' | 'unknown'; assignedExercises: ExerciseId[] };
  noiseFloorSymmetry: number;
  adherence: Adherence;
  trends: TrendSeries[];
  sessions: ExportSessionSummary[];
};

function assertValidRange(range: { from: string; to: string }): void {
  const fromValid = YMD_RE.test(range.from) && !Number.isNaN(Date.parse(range.from));
  const toValid = YMD_RE.test(range.to) && !Number.isNaN(Date.parse(range.to));
  if (!fromValid || !toValid) {
    throw new MirrorWellError('VALIDATION_FAILED', 'export range dates must be a valid YYYY-MM-DD calendar date');
  }
  if (range.from > range.to) {
    throw new MirrorWellError('VALIDATION_FAILED', 'range.from must be <= range.to');
  }
}

// Export range is a calendar date, but StorageService.getSessions / TrendsService.getAdherence
// require full UTC ISO 8601 timestamps (isValidIsoUtc in storage.ts), widen to the full day,
// in UTC: `${from}T00:00:00.000Z` … `${to}T23:59:59.999Z`.
//
// This IS a local-timezone boundary, unlike the comment this replaces claimed: ARCHITECTURE
// §13 mandates local-time trend periods (calendar months / Monday-start ISO weeks), and
// TrendsService buckets every session it sees in the reader's local time (src/data/trends.ts
// bucketStart, deliberately not touched by this file). Because the range here is widened in
// UTC, not local time, a session near midnight UTC can be included by a UTC day boundary yet
// bucket into a different local day/week than that UTC day would suggest, e.g. a session at
// 23:50 UTC on a UTC Sunday can be past local midnight already, landing in the following
// Monday-start week's bucket. That is a real mismatch between "which day the range widening
// thinks a session belongs to" and "which local bucket TrendsService puts it in."
//
// Accepted as-is, not changed here: `range.from`/`range.to` are plain YYYY-MM-DD calendar
// dates with no timezone of their own (API.md §13's example echoes them back verbatim), so
// there is no local offset available at this layer to widen by instead, inventing one would
// mean guessing the reader's timezone for a value that must stay a portable calendar string.
// UTC widening is therefore the only unambiguous choice for turning a bare date into a range
// boundary; the residual mismatch is an inherent property of "export by UTC calendar date,
// trend by local calendar period," not a bug in this function. A reader exporting near
// midnight in their own timezone should expect the trend bucket to follow their local clock,
// not the UTC date printed in `range`.
function toStorageRange(range: { from: string; to: string }): { from: string; to: string } {
  return { from: `${range.from}T00:00:00.000Z`, to: `${range.to}T23:59:59.999Z` };
}

function mapSessions(sessions: Awaited<ReturnType<typeof StorageService.getSessions>>): ExportSessionSummary[] {
  return sessions.map((session) => ({
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    endReason: session.endReason,
    results: session.results.map((result) => ({
      resultId: result.resultId,
      exerciseId: result.exerciseId,
      repsCompleted: result.repsCompleted,
      meanSymmetryIndex: result.meanSymmetryIndex,
      meanEffortIndex: result.meanEffortIndex,
      easeOffCount: result.easeOffCount,
      lowQualityFramePct: result.lowQualityFramePct,
    })),
  }));
}

function renderHtml(summary: ExportSummary): string {
  // Printable one-page A4 summary (API.md §13). Values are enums, UUIDs, ISO dates, numbers,
  // and config-owned exercise display names / approved copy; no untrusted free-text, so
  // nothing here needs HTML-escaping. Enriched trend rows (the under-informative-export
  // follow-up): each exercise's latest plain-language value + recent direction, so the printed
  // page says something a clinician can read at a glance, not just a bare point count.
  const trendRows = summary.trends
    .map(
      (t) =>
        `<tr><td>${exercises[t.exerciseId].displayName}</td><td>${t.granularity}</td><td>${t.points.length}</td><td>${exportTrendLatestLabel(t.points)}</td><td>${exportTrendDirection(t.points)}</td></tr>`,
    )
    .join('');
  const sessionRows = summary.sessions
    .map((s) => `<tr><td>${s.startedAt}</td><td>${s.endedAt}</td><td>${s.endReason}</td></tr>`)
    .join('');

  const copy = strings.exportSummary;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${copy.htmlTitle}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: sans-serif; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
</style>
</head>
<body>
<h1>${copy.htmlTitle}</h1>
<p>${summary.nonDiagnosticNotice}</p>
<p>${copy.rangeLabel} ${summary.range.from} to ${summary.range.to}</p>
<p>${copy.affectedSideLabel} ${summary.profile.affectedSide}</p>
<p>${copy.noiseFloorLabel} ${summary.noiseFloorSymmetry}</p>
<p>${copy.completionRateLabel} ${summary.adherence.completionRate}</p>
<h2>${copy.trendsHeading}</h2>
<table><thead><tr><th>${copy.exerciseColumn}</th><th>${copy.granularityColumn}</th><th>${copy.pointsColumn}</th><th>${copy.latestColumn}</th><th>${copy.directionColumn}</th></tr></thead><tbody>${trendRows}</tbody></table>
<h2>${copy.sessionsHeading}</h2>
<table><thead><tr><th>${copy.startedColumn}</th><th>${copy.endedColumn}</th><th>${copy.endReasonColumn}</th></tr></thead><tbody>${sessionRows}</tbody></table>
</body>
</html>`;
}

async function generateSummary(range: { from: string; to: string }): Promise<{ json: Blob; html: Blob }> {
  // Gate quick-reference matrix (API.md §17): ExportService is ❌ in DEMO, regardless of
  // attestation history; an already-attested user can enterDemoMode() (ARCHITECTURE §11:
  // "enterDemoMode" is ✅ from both UNATTESTED and ATTESTED), so isAttested() alone is not
  // sufficient; demo is checked first so it can never fall through on a persisted profile.
  if (SafetyGate.isDemoMode() || !(await SafetyGate.isAttested())) {
    throw new MirrorWellError('NOT_ATTESTED', 'export requires attestation (demo mode is not an export path)');
  }

  assertValidRange(range);

  const profile = await StorageService.getProfile();
  if (!profile) {
    throw new MirrorWellError('VALIDATION_FAILED', 'no profile available for export');
  }
  const activeBaseline = await StorageService.getActiveBaseline();
  if (!activeBaseline) {
    // NO_BASELINE, not VALIDATION_FAILED: reachable by an attested user who has not yet
    // calibrated (§17 gates ExportScreen on attestation alone), and it is the canonical code
    // for this exact state elsewhere (SessionController.start, NormalizationLayer.setBaseline).
    throw new MirrorWellError('NO_BASELINE', 'no active calibration baseline available for export');
  }

  const storageRange = toStorageRange(range);

  const [adherence, sessions] = await Promise.all([
    TrendsService.getAdherence(storageRange),
    StorageService.getSessions(storageRange),
  ]);

  // Fixed 'monthly' granularity (matches API.md §13's full example and AppSettings' default)
  // deliberately not read from SettingsService, which the brief's data-source list omits.
  const trends = await Promise.all(
    profile.assignedExercises.map((exerciseId) => TrendsService.getTrend(exerciseId, 'monthly')),
  );

  const summary: ExportSummary = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    nonDiagnosticNotice: strings.exportSummary.nonDiagnosticNotice,
    range: { from: range.from, to: range.to },
    profile: { affectedSide: profile.affectedSide, assignedExercises: profile.assignedExercises },
    noiseFloorSymmetry: activeBaseline.noiseFloorSymmetry,
    adherence,
    trends,
    sessions: mapSessions(sessions),
  };

  // Download only; no Web Share API, no clipboard auto-copy, no network (API.md §13 Rules).
  const json = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
  const html = new Blob([renderHtml(summary)], { type: 'text/html' });

  return { json, html };
}

export const ExportService = { generateSummary };
