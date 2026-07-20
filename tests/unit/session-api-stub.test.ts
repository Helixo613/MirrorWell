import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionApiStub } from '../../src/dev/sessionApiStub.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('SessionApi stub', () => {
  it('emits the deterministic demo script and clears timers when stopped', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T00:00:00.000Z'));

    const api = createSessionApiStub();
    const states: string[] = [];
    const samples: number[] = [];
    const reps: number[] = [];
    const easeOff: boolean[] = [];
    const offers: boolean[] = [];

    api.on('stateChanged', ({ state }) => states.push(state));
    api.on('metricUpdate', ({ sample }) => samples.push(sample.symmetryIndex ?? -1));
    api.on('repCompleted', ({ event }) => reps.push(event.repIndex));
    api.on('easeOff', ({ active }) => easeOff.push(active));
    api.on('qualityOfferStop', ({ visible }) => offers.push(visible));

    await api.start(['EX_SMILE']);
    await vi.runAllTimersAsync();

    expect(states).toEqual(['DEMO']);
    expect(samples).toEqual([0.95, 0.6, 0.95]);
    expect(reps).toEqual([0]);
    expect(easeOff).toEqual([true, false]);
    expect(offers).toEqual([true, false]);

    const record = await api.stop('user_stopped');

    expect(record).toMatchObject({
      endReason: 'user_stopped',
      results: [{ exerciseId: 'EX_SMILE', repsCompleted: 1 }],
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears pending work when stopped', async () => {
    vi.useFakeTimers();

    const api = createSessionApiStub();
    const samples: number[] = [];
    api.on('metricUpdate', ({ sample }) => samples.push(sample.timestampMs));

    await api.start(['EX_SMILE']);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    await api.stop('user_stopped');
    expect(vi.getTimerCount()).toBe(0);
    await vi.runAllTimersAsync();
    expect(samples).toEqual([]);
  });

  it('returns deterministic non-zero neutral vectors', async () => {
    const result = await createSessionApiStub().captureNeutral();

    expect(result).toEqual({
      neutralStats: {
        REGION_BROW: { left: { u: 0.01, v: 0.02 }, right: { u: 0.03, v: 0.04 } },
        REGION_EYELID: { left: { u: 0.05, v: 0.06 }, right: { u: 0.07, v: 0.08 } },
        REGION_MOUTH_CORNER: { left: { u: 0.09, v: 0.1 }, right: { u: 0.11, v: 0.12 } },
        REGION_LIP: { left: { u: 0.13, v: 0.14 }, right: { u: 0.15, v: 0.16 } },
      },
      qualityScore: 0.9,
    });
  });
});
