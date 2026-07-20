import { strings } from '@/config/strings';
import type { ExportSummaryDocument } from '@/types/export';

const TOP_LEVEL_KEYS = [
  'schemaVersion',
  'generatedAt',
  'nonDiagnosticNotice',
  'range',
  'profile',
  'noiseFloorSymmetry',
  'adherence',
  'trends',
  'sessions',
] as const;

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const valueKeys = Object.keys(value);
  return (
    valueKeys.length === keys.length && keys.every((key) => key in value)
  );
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
): void {
  if (!hasExactKeys(value, keys)) {
    throw new Error(`unexpected keys at ${path}`);
  }
}

/**
 * Structural validator for export JSON — mirrors tests/schemas/export.schema.json
 * without adding a runtime JSON Schema dependency.
 */
export function validateExportDocument(doc: ExportSummaryDocument): void {
  const root = doc as unknown as Record<string, unknown>;
  assertExactKeys(root, TOP_LEVEL_KEYS, 'root');

  if (doc.schemaVersion !== 1) {
    throw new Error('schemaVersion must be 1');
  }
  if (doc.nonDiagnosticNotice !== strings.export.nonDiagnosticNotice) {
    throw new Error('nonDiagnosticNotice must match strings.export');
  }
  if (!Number.isFinite(doc.noiseFloorSymmetry) || doc.noiseFloorSymmetry <= 0) {
    throw new Error('noiseFloorSymmetry must be > 0');
  }

  assertExactKeys(doc.range as unknown as Record<string, unknown>, ['from', 'to'], 'range');
  assertExactKeys(doc.profile as unknown as Record<string, unknown>, ['affectedSide', 'assignedExercises'], 'profile');
  assertExactKeys(
    doc.adherence as unknown as Record<string, unknown>,
    ['sessionsPerWeek', 'completionRate'],
    'adherence',
  );

  if (
    doc.adherence.completionRate < 0 ||
    doc.adherence.completionRate > 1
  ) {
    throw new Error('completionRate out of range');
  }

  for (const trend of doc.trends) {
    assertExactKeys(
      trend as unknown as Record<string, unknown>,
      ['exerciseId', 'granularity', 'baselineId', 'points'],
      'trends[]',
    );
    for (const point of trend.points) {
      assertExactKeys(
        point as unknown as Record<string, unknown>,
        ['periodStart', 'meanSymmetryIndex', 'sampleCount', 'aboveNoiseFloor'],
        'trends[].points[]',
      );
    }
  }

  for (const session of doc.sessions) {
    assertExactKeys(
      session as unknown as Record<string, unknown>,
      ['sessionId', 'startedAt', 'endedAt', 'endReason', 'results'],
      'sessions[]',
    );
    for (const result of session.results) {
      assertExactKeys(
        result as unknown as Record<string, unknown>,
        [
          'resultId',
          'exerciseId',
          'repsCompleted',
          'meanSymmetryIndex',
          'meanEffortIndex',
          'easeOffCount',
          'lowQualityFramePct',
        ],
        'sessions[].results[]',
      );
    }
  }
}
