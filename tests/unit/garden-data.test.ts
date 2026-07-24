import { describe, expect, it } from 'vitest';
import { gardenWeeks } from '@/screens/home/gardenData';

describe('gardenWeeks', () => {
  it('returns eight seed stages for empty history', () => {
    expect(gardenWeeks([], '2026-07-24')).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('maps three sessions in one week to bloom', () => {
    expect(
      gardenWeeks(
        ['2026-07-20', '2026-07-22', '2026-07-24'],
        '2026-07-24',
      ),
    ).toEqual([0, 0, 0, 0, 0, 0, 0, 3]);
  });

  it('buckets sessions on Monday boundaries', () => {
    expect(gardenWeeks(['2026-07-19', '2026-07-20'], '2026-07-24')).toEqual([
      0, 0, 0, 0, 0, 0, 1, 1,
    ]);
  });

  it('ignores future dates', () => {
    expect(gardenWeeks(['2026-07-25'], '2026-07-24')).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
