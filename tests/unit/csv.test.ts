import { describe, expect, it } from 'vitest';
import { DEBUG_HUD_CSV_COLUMNS, toCsv, type DebugHudRow } from '../../src/dev/csv.ts';

describe('DebugHud CSV export', () => {
  it('the column header matches the canonical set (docs/ARCHITECTURE.md §12) verbatim, in order', () => {
    expect(DEBUG_HUD_CSV_COLUMNS).toEqual([
      'timestampMs',
      'exerciseId',
      'qualityState',
      'symmetryIndexRaw',
      'symmetryIndexSmoothed',
      'effortIndexRaw',
      'effortIndexSmoothed',
      'repState',
      'fps',
    ]);
  });

  it('renders the header as the first line even for zero rows', () => {
    expect(toCsv([])).toBe(DEBUG_HUD_CSV_COLUMNS.join(','));
  });

  it('renders null metric values as empty cells, not the string "null"', () => {
    const row: DebugHudRow = {
      timestampMs: 1000,
      exerciseId: 'EX_SMILE',
      qualityState: 'LOW_LIGHT',
      symmetryIndexRaw: null,
      symmetryIndexSmoothed: null,
      effortIndexRaw: null,
      effortIndexSmoothed: null,
      repState: 'idle',
      fps: 28,
    };
    const csv = toCsv([row]);
    expect(csv).toBe(
      [DEBUG_HUD_CSV_COLUMNS.join(','), '1000,EX_SMILE,LOW_LIGHT,,,,,idle,28'].join('\n'),
    );
  });

  it('renders numeric metric values and joins multiple rows with newlines', () => {
    const rows: DebugHudRow[] = [
      {
        timestampMs: 0,
        exerciseId: 'EX_SMILE',
        qualityState: 'QUALITY_OK',
        symmetryIndexRaw: 0.68,
        symmetryIndexSmoothed: 0.7,
        effortIndexRaw: 0.44,
        effortIndexSmoothed: 0.4,
        repState: 'active',
        fps: 30,
      },
      {
        timestampMs: 33,
        exerciseId: 'EX_SMILE',
        qualityState: 'QUALITY_OK',
        symmetryIndexRaw: 0.7,
        symmetryIndexSmoothed: 0.71,
        effortIndexRaw: 0.46,
        effortIndexSmoothed: 0.41,
        repState: 'active',
        fps: 30,
      },
    ];
    const csv = toCsv(rows);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]).toBe('0,EX_SMILE,QUALITY_OK,0.68,0.7,0.44,0.4,active,30');
    expect(lines[2]).toBe('33,EX_SMILE,QUALITY_OK,0.7,0.71,0.46,0.41,active,30');
  });
});
