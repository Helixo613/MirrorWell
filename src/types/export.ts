import type {
  EndReason,
  ExerciseId,
} from '@/data/schema';
import type { Adherence, TrendPoint, TrendSeries } from '@/types/trends';

export const EXPORT_HEADING_ID = 'export-heading';

/** Calendar date range for export (YYYY-MM-DD). */
export interface ExportDateRange {
  from: string;
  to: string;
}

export interface ExportProfileSummary {
  affectedSide: 'left' | 'right' | 'unknown';
  assignedExercises: ExerciseId[];
}

export interface ExportSessionResult {
  resultId: string;
  exerciseId: ExerciseId;
  repsCompleted: number;
  meanSymmetryIndex: number | null;
  meanEffortIndex: number | null;
  easeOffCount: number;
  lowQualityFramePct: number;
}

export interface ExportSessionSummary {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  endReason: EndReason;
  results: ExportSessionResult[];
}

export interface ExportTrendSeries {
  exerciseId: TrendSeries['exerciseId'];
  granularity: TrendSeries['granularity'];
  baselineId: string;
  points: TrendPoint[];
}

/** Canonical export document, must match tests/schemas/export.schema.json. */
export interface ExportSummaryDocument {
  schemaVersion: 1;
  generatedAt: string;
  nonDiagnosticNotice: string;
  range: ExportDateRange;
  profile: ExportProfileSummary;
  noiseFloorSymmetry: number;
  adherence: Adherence;
  trends: ExportTrendSeries[];
  sessions: ExportSessionSummary[];
}

export interface ExportSummaryBlobs {
  json: Blob;
  html: Blob;
}

export interface ExportSummaryPreview {
  sessionCount: number;
  exerciseCount: number;
  completionRate: number;
  range: ExportDateRange;
}

export interface ExportGenerationResult {
  blobs: ExportSummaryBlobs;
  preview: ExportSummaryPreview;
}

export type ExportScreenStatus =
  | 'loading'
  | 'ready'
  | 'generating'
  | 'empty'
  | 'success'
  | 'error';
