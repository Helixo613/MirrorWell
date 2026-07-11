import { strings } from '@/config/strings';
import { thresholds } from '@/config/thresholds';
import { MirrorWellError } from '@/data/errors';
import { SettingsService } from '@/data/settings';
import { StorageService } from '@/data/storage';
import { TrendsService } from '@/data/trends';
import type { SessionRecordFull } from '@/data/schema';
import {
  compareYmd,
  defaultDateRange,
  isValidYmd,
  toSessionQueryRange,
} from '@/lib/dateRange';
import { renderExportHtml } from '@/lib/exportHtml';
import { validateExportDocument } from '@/lib/validateExport';
import type {
  ExportDateRange,
  ExportGenerationResult,
  ExportSessionSummary,
  ExportSummaryDocument,
} from '@/types/export';

function validateExportRange(range: ExportDateRange): void {
  if (!isValidYmd(range.from) || !isValidYmd(range.to)) {
    throw new MirrorWellError(
      'VALIDATION_FAILED',
      'export range dates must be YYYY-MM-DD',
      true,
    );
  }
  if (compareYmd(range.from, range.to) > 0) {
    throw new MirrorWellError(
      'VALIDATION_FAILED',
      'export range from must be on or before to',
      true,
    );
  }
}

function mapSessions(sessions: SessionRecordFull[]): ExportSessionSummary[] {
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

export const ExportService = {
  async generateSummary(range: ExportDateRange): Promise<ExportGenerationResult> {
    validateExportRange(range);

    const profile = await StorageService.getProfile();
    if (!profile) {
      throw new MirrorWellError(
        'VALIDATION_FAILED',
        'no profile for export',
        true,
      );
    }

    const settings = await SettingsService.get();
    const sessionRange = toSessionQueryRange(range);
    const sessions = await StorageService.getSessions(sessionRange);

    if (sessions.length === 0) {
      throw new MirrorWellError(
        'VALIDATION_FAILED',
        'no sessions in export range',
        true,
      );
    }

    const [adherence, ...trendSeries] = await Promise.all([
      TrendsService.getAdherence(sessionRange),
      ...profile.assignedExercises.map((exerciseId) =>
        TrendsService.getTrend(exerciseId, settings.trendGranularity),
      ),
    ]);

    const document: ExportSummaryDocument = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      nonDiagnosticNotice: strings.export.nonDiagnosticNotice,
      range,
      profile: {
        affectedSide: profile.affectedSide,
        assignedExercises: profile.assignedExercises,
      },
      noiseFloorSymmetry: settings.noiseFloorSymmetry,
      adherence,
      trends: trendSeries.map((series) => ({
        exerciseId: series.exerciseId,
        granularity: series.granularity,
        baselineId: series.baselineId,
        points: series.points,
      })),
      sessions: mapSessions(sessions),
    };

    validateExportDocument(document);

    const json = new Blob([JSON.stringify(document, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const html = new Blob([renderExportHtml(document)], {
      type: 'text/html;charset=utf-8',
    });

    return {
      blobs: { json, html },
      preview: {
        sessionCount: document.sessions.length,
        exerciseCount: document.profile.assignedExercises.length,
        completionRate: document.adherence.completionRate,
        range: document.range,
      },
    };
  },

  defaultRange(): ExportDateRange {
    return defaultDateRange(thresholds.export.defaultRangeWeeks);
  },
};
