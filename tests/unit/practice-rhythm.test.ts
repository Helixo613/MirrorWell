import { describe, expect, it } from 'vitest';
import { thresholds } from '../../src/config/thresholds.ts';
import { strings } from '../../src/config/strings.ts';
import {
  practiceRhythmFrom,
  showsRhythmCount,
} from '../../src/screens/home/practiceRhythm.ts';

/**
 * Derived daily-practice encouragement (SAFETY §8 practice-rhythm carve-out).
 *
 * The counting tests are ordinary; the ones that matter are at the bottom, which pin the carve-out
 * conditions themselves. Those exist because the difference between this feature and the streak
 * that §8 forbids is entirely in what is NOT rendered, and that is exactly the kind of property a
 * later well-meaning change ("show them they're back to zero so they know") silently removes.
 */
describe('practiceRhythmFrom', () => {
  it('counts consecutive days ending today', () => {
    const rhythm = practiceRhythmFrom(
      ['2026-03-10', '2026-03-11', '2026-03-12'],
      '2026-03-12',
    );
    expect(rhythm).toEqual({ days: 3, practicedToday: true });
  });

  it('keeps the run anchored to yesterday when today has no session yet', () => {
    // Steady across the day rather than blanking until practice, so resuming never reads as
    // "you got it back".
    const rhythm = practiceRhythmFrom(['2026-03-10', '2026-03-11'], '2026-03-12');
    expect(rhythm).toEqual({ days: 2, practicedToday: false });
  });

  it('stops at the first day without practice rather than counting total days', () => {
    const rhythm = practiceRhythmFrom(
      ['2026-03-01', '2026-03-02', '2026-03-11', '2026-03-12'],
      '2026-03-12',
    );
    expect(rhythm.days).toBe(2);
  });

  it('collapses several sessions on one day into that single day', () => {
    const rhythm = practiceRhythmFrom(
      ['2026-03-12', '2026-03-12', '2026-03-11'],
      '2026-03-12',
    );
    expect(rhythm.days).toBe(2);
  });

  it('accepts full ISO timestamps, not just date-only strings', () => {
    const rhythm = practiceRhythmFrom(
      ['2026-03-11T09:30:00.000Z', '2026-03-12T21:05:00.000Z'],
      '2026-03-12',
    );
    expect(rhythm.days).toBe(2);
  });

  it('ignores dates after today so clock skew cannot inflate the count', () => {
    const rhythm = practiceRhythmFrom(['2026-03-12', '2026-03-13'], '2026-03-12');
    expect(rhythm.days).toBe(1);
  });

  it('returns an empty run for no sessions and for a malformed today', () => {
    expect(practiceRhythmFrom([], '2026-03-12')).toEqual({ days: 0, practicedToday: false });
    expect(practiceRhythmFrom(['2026-03-12'], 'not-a-date')).toEqual({
      days: 0,
      practicedToday: false,
    });
  });

  it('drops a run that ended before yesterday back to zero', () => {
    expect(practiceRhythmFrom(['2026-03-01', '2026-03-02'], '2026-03-12').days).toBe(0);
  });
});

describe('practice-rhythm carve-out conditions (SAFETY §8)', () => {
  it('never reports a negative count, so no zero or deficit can be rendered', () => {
    for (const today of ['2026-03-12', '2026-02-28', 'not-a-date']) {
      expect(practiceRhythmFrom(['2026-03-11'], today).days).toBeGreaterThanOrEqual(0);
    }
  });

  it('suppresses the badge below the minimum, so a bare "1" is never drawn', () => {
    expect(showsRhythmCount({ days: 0, practicedToday: false })).toBe(false);
    expect(showsRhythmCount({ days: 1, practicedToday: true })).toBe(false);
    expect(showsRhythmCount({ days: thresholds.home.rhythmMinDays, practicedToday: true })).toBe(
      true,
    );
  });

  it('exposes no string for a zero count or for a run ending', () => {
    // The carve-out holds because there is no copy to render in those states. If someone adds a
    // "back to zero" or "you lost it" string, this fails and sends them to SAFETY §8 first.
    expect(Object.keys(strings.home.rhythm).sort()).toEqual(
      ['count', 'countAriaLabel', 'label', 'openInvitation', 'practicedToday'].sort(),
    );
  });

  it('uses no forbidden vocabulary in any rhythm string', () => {
    const rendered = [
      strings.home.rhythm.label,
      strings.home.rhythm.practicedToday,
      strings.home.rhythm.openInvitation,
      strings.home.rhythm.count(4),
      strings.home.rhythm.countAriaLabel(4),
    ].join(' ').toLowerCase();

    for (const forbidden of ['streak', 'missed', 'in a row', 'break', 'lose', 'lost', 'keep it up', 'don']) {
      expect(rendered).not.toContain(forbidden);
    }
  });
});
