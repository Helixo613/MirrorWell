// src/data/export.ts — ExportService (docs/API.md §13, ARCHITECTURE.md §13, SAFETY §8).
// Assembles a printable/exportable summary from TrendsService + StorageService only — no
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

const SCHEMA_VERSION = 1 as const;

// Export range is a calendar date (YYYY-MM-DD), not a full timestamp — API.md §13's example
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
// require full UTC ISO 8601 timestamps (isValidIsoUtc in storage.ts) — widen to the full day,
// in UTC (no local-timezone dependency, since none is documented for export ranges).
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
  // Printable one-page A4 summary (API.md §13). No untrusted free-text anywhere in this
  // payload (enums, UUIDs, ISO dates, numbers only) — nothing here needs HTML-escaping.
  const trendRows = summary.trends
    .map(
      (t) =>
        `<tr><td>${t.exerciseId}</td><td>${t.granularity}</td><td>${t.points.length}</td></tr>`,
    )
    .join('');
  const sessionRows = summary.sessions
    .map((s) => `<tr><td>${s.startedAt}</td><td>${s.endedAt}</td><td>${s.endReason}</td></tr>`)
    .join('');

  const t = strings.exportSummary;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${t.htmlTitle}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: sans-serif; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
</style>
</head>
<body>
<h1>${t.htmlTitle}</h1>
<p>${summary.nonDiagnosticNotice}</p>
<p>${t.rangeLabel} ${summary.range.from} to ${summary.range.to}</p>
<p>${t.affectedSideLabel} ${summary.profile.affectedSide}</p>
<p>${t.noiseFloorLabel} ${summary.noiseFloorSymmetry}</p>
<p>${t.completionRateLabel} ${summary.adherence.completionRate}</p>
<h2>${t.trendsHeading}</h2>
<table><thead><tr><th>${t.exerciseColumn}</th><th>${t.granularityColumn}</th><th>${t.pointsColumn}</th></tr></thead><tbody>${trendRows}</tbody></table>
<h2>${t.sessionsHeading}</h2>
<table><thead><tr><th>${t.startedColumn}</th><th>${t.endedColumn}</th><th>${t.endReasonColumn}</th></tr></thead><tbody>${sessionRows}</tbody></table>
</body>
</html>`;
}

async function generateSummary(range: { from: string; to: string }): Promise<{ json: Blob; html: Blob }> {
  // Gate quick-reference matrix (API.md §17): ExportService is ❌ in DEMO, regardless of
  // attestation history — an already-attested user can enterDemoMode() (ARCHITECTURE §11:
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

  // Fixed 'monthly' granularity (matches API.md §13's full example and AppSettings' default) —
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

  // Download only — no Web Share API, no clipboard auto-copy, no network (API.md §13 Rules).
  const json = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
  const html = new Blob([renderHtml(summary)], { type: 'text/html' });

  return { json, html };
}

export const ExportService = { generateSummary };
