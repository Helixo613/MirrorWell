import { describe, expect, it } from 'vitest';
import { strings } from '@/config/strings';
import { thresholds } from '@/config/thresholds';
import type { RepMetric } from '@/data/schema';
import type { SessionRecordFull } from '@/data/storage';
import {
  gentlenessStat,
  symmetryBarFill,
  symmetryPlainLabel,
} from '@/lib/summaryMetrics';

// Pure helpers behind SummaryScreen (FRONTEND §2.5). Bucket boundaries are read from
// thresholds.summary; the tunable is the source of truth, so retuning a threshold moves
// these cases with it (CLAUDE.md: every tunable lives in src/config/thresholds.ts). The
// expected COPY is asserted verbatim: SAFETY §8 wording is a release blocker.

const { symmetryMostlyEvenMin, symmetryFairlyEvenMin, symmetrySomeDifferenceMin } =
  thresholds.summary;

const EPS = 1e-6;

function rep(repIndex: number, easeOffTriggered: 0 | 1): RepMetric {
  return {
    repId: `77777777-7777-4777-8777-77777777770${repIndex}`,
    resultId: '44444444-4444-4444-8444-444444444444',
    repIndex,
    peakSymmetryIndex: 0.8,
    peakEffortIndex: 0.4,
    durationMs: 1800,
    easeOffTriggered,
  };
}

function results(reps: RepMetric[]): SessionRecordFull['results'] {
  return [
    {
      resultId: '44444444-4444-4444-8444-444444444444',
      sessionId: '33333333-3333-4333-8333-333333333333',
      exerciseId: 'EX_SMILE',
      repsCompleted: reps.length,
      meanSymmetryIndex: 0.8,
      meanEffortIndex: 0.4,
      easeOffCount: reps.filter((item) => item.easeOffTriggered === 1).length,
      lowQualityFramePct: 0,
      reps,
    },
  ];
}

describe('symmetryPlainLabel', () => {
  it('reports minimal movement for a null symmetry index', () => {
    expect(symmetryPlainLabel(null)).toBe('Minimal movement recorded');
    expect(symmetryPlainLabel(null)).toBe(strings.summary.symmetry.noMovement);
  });

  it('is inclusive at every bucket floor', () => {
    expect(symmetryPlainLabel(symmetryMostlyEvenMin)).toBe('Mostly even');
    expect(symmetryPlainLabel(symmetryFairlyEvenMin)).toBe('Fairly even');
    expect(symmetryPlainLabel(symmetrySomeDifferenceMin)).toBe(
      'Some difference between sides',
    );
  });

  it('drops to the next bucket just below each floor', () => {
    expect(symmetryPlainLabel(symmetryMostlyEvenMin - EPS)).toBe('Fairly even');
    expect(symmetryPlainLabel(symmetryFairlyEvenMin - EPS)).toBe(
      'Some difference between sides',
    );
    expect(symmetryPlainLabel(symmetrySomeDifferenceMin - EPS)).toBe(
      'More movement on one side',
    );
  });

  it('covers the ends of the unit range', () => {
    expect(symmetryPlainLabel(1)).toBe('Mostly even');
    expect(symmetryPlainLabel(0)).toBe('More movement on one side');
  });

  it('never returns a numeric grade or a comparison', () => {
    const labels = [null, 0, 0.6, 0.75, 0.9, 1].map(symmetryPlainLabel);
    for (const label of labels) {
      expect(label).not.toMatch(/\d/);
      expect(label.toLowerCase()).not.toMatch(/better|worse|improv|than last|streak/);
    }
  });
});

describe('symmetryBarFill', () => {
  it('centres the bar when there is nothing to show', () => {
    expect(symmetryBarFill(null)).toBe(0.5);
  });

  it('passes through in-range values and clamps out-of-range ones', () => {
    expect(symmetryBarFill(0.42)).toBe(0.42);
    expect(symmetryBarFill(-1)).toBe(0);
    expect(symmetryBarFill(2)).toBe(1);
  });
});

describe('gentlenessStat', () => {
  it('handles a session with no reps', () => {
    expect(gentlenessStat(results([]))).toEqual({ gentle: 0, total: 0 });
  });

  it('counts a mixed session across exercises', () => {
    expect(gentlenessStat(results([rep(0, 0), rep(1, 1), rep(2, 0)]))).toEqual({
      gentle: 2,
      total: 3,
    });
  });

  it('counts every all-gentle rep', () => {
    expect(gentlenessStat(results([rep(0, 0), rep(1, 0)]))).toEqual({
      gentle: 2,
      total: 2,
    });
  });
});
