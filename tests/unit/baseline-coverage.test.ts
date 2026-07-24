import { describe, expect, it } from 'vitest';
import {
  baselineCoversExercises,
  missingComfortableMaxExercises,
} from '../../src/lib/baselineCoverage';

describe('baselineCoverage', () => {
  it('reports missing and non-positive comfortableMax entries', () => {
    expect(
      missingComfortableMaxExercises({ EX_SMILE: 0.5 }, ['EX_SMILE', 'EX_BROW_RAISE']),
    ).toEqual(['EX_BROW_RAISE']);
    expect(missingComfortableMaxExercises({ EX_SMILE: 0 }, ['EX_SMILE'])).toEqual(['EX_SMILE']);
    expect(missingComfortableMaxExercises(undefined, ['EX_SMILE'])).toEqual(['EX_SMILE']);
  });

  it('requires every listed exercise to be covered', () => {
    expect(baselineCoversExercises({ EX_SMILE: 0.5, EX_BROW_RAISE: 0.4 }, ['EX_SMILE'])).toBe(true);
    expect(
      baselineCoversExercises({ EX_SMILE: 0.5 }, ['EX_SMILE', 'EX_BROW_RAISE']),
    ).toBe(false);
  });
});
