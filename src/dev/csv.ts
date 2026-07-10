// src/dev/csv.ts — DebugHud CSV export (docs/IMPLEMENTATION.md Task 8). Pure formatting, no
// DOM — the column set is canonical: docs/ARCHITECTURE.md §12 ("DebugHud CSV columns").
export const DEBUG_HUD_CSV_COLUMNS = [
  'timestampMs',
  'exerciseId',
  'qualityState',
  'symmetryIndexRaw',
  'symmetryIndexSmoothed',
  'effortIndexRaw',
  'effortIndexSmoothed',
  'repState',
  'fps',
] as const;

export interface DebugHudRow {
  timestampMs: number;
  exerciseId: string;
  qualityState: string;
  symmetryIndexRaw: number | null;
  symmetryIndexSmoothed: number | null;
  effortIndexRaw: number | null;
  effortIndexSmoothed: number | null;
  repState: string;
  fps: number;
}

function cell(value: DebugHudRow[(typeof DEBUG_HUD_CSV_COLUMNS)[number]]): string {
  return value === null ? '' : String(value);
}

export function toCsv(rows: DebugHudRow[]): string {
  const header = DEBUG_HUD_CSV_COLUMNS.join(',');
  const lines = rows.map((row) => DEBUG_HUD_CSV_COLUMNS.map((col) => cell(row[col])).join(','));
  return [header, ...lines].join('\n');
}
