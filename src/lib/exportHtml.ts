import { EXERCISES } from '@/config/exercises';
import { strings } from '@/config/strings';
import { formatPeriodLabel } from '@/lib/trendPeriods';
import { symmetryPlainLabel } from '@/lib/summaryMetrics';
import type { ExportSummaryDocument } from '@/types/export';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function affectedSideLabel(side: ExportSummaryDocument['profile']['affectedSide']): string {
  switch (side) {
    case 'left':
      return strings.export.html.affectedSideLeft;
    case 'right':
      return strings.export.html.affectedSideRight;
    default:
      return strings.export.html.affectedSideUnknown;
  }
}

/** Printable one-page A4 HTML summary — same content as JSON export. */
export function renderExportHtml(doc: ExportSummaryDocument): string {
  const exerciseNames = doc.profile.assignedExercises
    .map((id) => EXERCISES[id].displayName)
    .join(', ');

  const trendSections = doc.trends
    .map((trend) => {
      const name = EXERCISES[trend.exerciseId].displayName;
      if (trend.points.length === 0) {
        return `<p><strong>${escapeHtml(name)}</strong>: ${escapeHtml(strings.export.html.noTrendPoints)}</p>`;
      }
      const rows = trend.points
        .map((point) => {
          const label = formatPeriodLabel(point.periodStart, trend.granularity);
          const symmetry = symmetryPlainLabel(point.meanSymmetryIndex);
          const steady = point.aboveNoiseFloor
            ? ''
            : ` (${escapeHtml(strings.trends.steadyPill)})`;
          return `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(symmetry)}${steady}</td><td>${point.sampleCount}</td></tr>`;
        })
        .join('');
      return `
        <section class="block">
          <h2>${escapeHtml(name)}</h2>
          <table>
            <thead><tr><th>${escapeHtml(strings.export.html.period)}</th><th>${escapeHtml(strings.export.html.symmetry)}</th><th>${escapeHtml(strings.export.html.sessions)}</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`;
    })
    .join('');

  const sessionRows = doc.sessions
    .slice(0, 12)
    .map((session) => {
      const resultCells = session.results
        .map((result) => {
          const name = EXERCISES[result.exerciseId].displayName;
          return `${escapeHtml(name)}: ${result.repsCompleted} ${escapeHtml(strings.export.html.reps)}, ${escapeHtml(symmetryPlainLabel(result.meanSymmetryIndex))}, ${escapeHtml(strings.export.html.easeOff(result.easeOffCount))}, ${escapeHtml(strings.export.html.measurementQuality(formatPercent(result.lowQualityFramePct)))}`;
        })
        .join('<br/>');
      return `<tr><td>${escapeHtml(formatDate(session.startedAt))}</td><td>${escapeHtml(session.endReason.replaceAll('_', ' '))}</td><td>${resultCells}</td></tr>`;
    })
    .join('');

  const moreSessions =
    doc.sessions.length > 12
      ? `<p class="muted">${escapeHtml(strings.export.html.moreSessions(doc.sessions.length - 12))}</p>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(strings.export.title)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; font-size: 11pt; line-height: 1.45; color: #111; margin: 0; }
    h1 { font-size: 16pt; margin: 0 0 8px; }
    h2 { font-size: 12pt; margin: 12px 0 6px; }
    .notice { border: 1px solid #ccc; padding: 10px; margin-bottom: 12px; background: #f8f8f8; font-size: 10pt; }
    .meta { color: #444; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; font-size: 10pt; }
    th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; vertical-align: top; }
    th { background: #f3f3f3; }
    .block { margin-bottom: 10px; }
    .muted { color: #555; font-size: 10pt; }
    @media print { body { print-color-adjust: exact; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(strings.export.title)}</h1>
    <p class="notice">${escapeHtml(doc.nonDiagnosticNotice)}</p>
    <p class="meta">${escapeHtml(strings.export.html.generated(formatDate(doc.generatedAt)))}<br/>
    ${escapeHtml(strings.export.html.range(doc.range.from, doc.range.to))}<br/>
    ${escapeHtml(strings.export.html.profile(affectedSideLabel(doc.profile.affectedSide), exerciseNames))}</p>
  </header>

  <section class="block">
    <h2>${escapeHtml(strings.export.html.adherenceHeading)}</h2>
    <p>${escapeHtml(strings.export.html.completionRate(formatPercent(doc.adherence.completionRate)))}</p>
    <p>${escapeHtml(strings.export.html.sessionsPerWeek(doc.adherence.sessionsPerWeek.join(', ') || '0'))}</p>
  </section>

  <section class="block">
    <h2>${escapeHtml(strings.export.html.trendsHeading)}</h2>
    ${trendSections}
  </section>

  <section class="block">
    <h2>${escapeHtml(strings.export.html.sessionsHeading(doc.sessions.length))}</h2>
    <table>
      <thead><tr><th>${escapeHtml(strings.export.html.date)}</th><th>${escapeHtml(strings.export.html.endReason)}</th><th>${escapeHtml(strings.export.html.details)}</th></tr></thead>
      <tbody>${sessionRows}</tbody>
    </table>
    ${moreSessions}
  </section>

  <footer class="muted">
    <p>${escapeHtml(strings.export.advisory)}</p>
  </footer>
</body>
</html>`;
}
