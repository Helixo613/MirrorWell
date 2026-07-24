import { describe, expect, it } from 'vitest';
import { msUntilNext, Reminders } from '../../src/lib/reminders.ts';

/**
 * Local practice reminders (no-network: see the header of src/lib/reminders.ts).
 *
 * msUntilNext holds the only real logic in the module, and its edges are the ones that make a
 * daily reminder fire at the wrong hour: the midnight rollover and the daylight-saving boundary.
 */
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe('msUntilNext', () => {
  it('returns the gap to later today when the time has not passed', () => {
    const now = new Date(2026, 2, 10, 8, 0, 0);
    expect(msUntilNext(now, '09:30')).toBe(90 * MINUTE);
  });

  it('rolls over to tomorrow when the time has already passed', () => {
    const now = new Date(2026, 2, 10, 10, 0, 0);
    expect(msUntilNext(now, '09:00')).toBe(23 * HOUR);
  });

  it('treats the exact current minute as passed, so it never fires twice in one day', () => {
    const now = new Date(2026, 2, 10, 9, 0, 0, 0);
    expect(msUntilNext(now, '09:00')).toBe(24 * HOUR);
  });

  it('handles midnight', () => {
    const now = new Date(2026, 2, 10, 23, 30, 0);
    expect(msUntilNext(now, '00:00')).toBe(30 * MINUTE);
  });

  it('keeps the chosen wall-clock time across a spring-forward boundary', () => {
    // US DST 2026 begins Sun 8 Mar. Local 09:00 Sat to local 09:00 Sun is 23 real hours, not 24;
    // adding a fixed day of milliseconds would drift the reminder to 10:00.
    const now = new Date(2026, 2, 7, 9, 0, 0);
    const ms = msUntilNext(now, '09:00');
    const fired = new Date(now.getTime() + ms!);
    expect(fired.getHours()).toBe(9);
    expect(fired.getDate()).toBe(8);
  });

  it('keeps the chosen wall-clock time across a fall-back boundary', () => {
    // US DST 2026 ends Sun 1 Nov: that local day is 25 real hours long.
    const now = new Date(2026, 9, 31, 9, 0, 0);
    const ms = msUntilNext(now, '09:00');
    const fired = new Date(now.getTime() + ms!);
    expect(fired.getHours()).toBe(9);
    expect(fired.getDate()).toBe(1);
  });

  it('rejects malformed times rather than guessing an hour', () => {
    for (const bad of ['9:00', '24:00', '09:60', '', 'morning', '09-00']) {
      expect(msUntilNext(new Date(2026, 2, 10, 8, 0, 0), bad)).toBeNull();
    }
  });
});

describe('Reminders.schedule', () => {
  it('is inert without notification support, so no timer leaks in a bare environment', () => {
    // jsdom/node here has no Notification API, which is exactly the unsupported path.
    expect(Reminders.support()).toBe('unsupported');
    expect(() => Reminders.schedule(true, '09:00')).not.toThrow();
    expect(() => Reminders.cancel()).not.toThrow();
  });
});
