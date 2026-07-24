import { describe, expect, it } from 'vitest';
import {
  formatPeriodLabel,
  parsePeriodStart,
  periodStartForDate,
} from '@/lib/trendPeriods';

// These helpers compute LOCAL-time calendar periods (ARCHITECTURE §13). The assertions below
// pin that: a period key is derived from the local Y/M/D, and a period label is parsed at local
// noon so a timezone offset can never roll it onto the previous calendar day.

describe('periodStartForDate', () => {
  it('buckets monthly to the first of the local calendar month', () => {
    // Local-time constructor: 2026-06-15, mid-month.
    expect(periodStartForDate(new Date(2026, 5, 15), 'monthly')).toBe('2026-06-01');
  });

  it('buckets weekly to the Monday of the local week', () => {
    // 2026-06-17 is a Wednesday; its Monday is 2026-06-15.
    const key = periodStartForDate(new Date(2026, 5, 17), 'weekly');
    expect(key).toBe('2026-06-15');
    // The key must itself be a Monday (getDay === 1) read in local time.
    expect(parsePeriodStart(key).getDay()).toBe(1);
  });

  it('maps a Sunday back to the preceding Monday, not forward', () => {
    // 2026-06-21 is a Sunday; Monday-start week began 2026-06-15.
    expect(periodStartForDate(new Date(2026, 5, 21), 'weekly')).toBe('2026-06-15');
  });
});

describe('formatPeriodLabel', () => {
  it('labels a monthly period with the full month and year', () => {
    const label = formatPeriodLabel('2026-06-01', 'monthly');
    expect(label).toContain('2026');
    // Month name, not a bare number; locale-tolerant check that it is not just the year.
    expect(label.length).toBeGreaterThan('2026'.length);
  });

  it('labels a weekly period with a day, without the year', () => {
    const label = formatPeriodLabel('2026-06-15', 'weekly');
    expect(label).toContain('15');
    expect(label).not.toContain('2026');
  });
});

describe('parsePeriodStart', () => {
  it('parses at local noon so a tz offset never shifts the calendar day', () => {
    const d = parsePeriodStart('2026-06-01');
    expect(d.getHours()).toBe(12);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(1);
  });
});
