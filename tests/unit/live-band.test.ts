import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import {
  bandCardActive,
  liveView,
  pollSummary,
  startPolling,
  type LiveSnapshot,
  type SummaryView,
} from '@/companion/liveBand';
import { strings } from '@/config/strings';

const fx = (n: string) =>
  JSON.parse(fs.readFileSync(`calm-band/sim/fixtures/${n}.json`, 'utf-8')) as LiveSnapshot;
const b = strings.bandCard;

describe('liveView mapping', () => {
  it('null snapshot gives offline and nothing else', () => {
    const v = liveView(null);
    expect(v.offline).toBe(true);
    expect(v.beatIntervalMs).toBeNull();
    expect(v.reason).toBeNull();
  });

  it('usable fixture: beating heart, 3 bars, steady, no reason, no hint, no cue', () => {
    expect(liveView(fx('live-usable'))).toMatchObject({
      offline: false,
      beatIntervalMs: 719,
      signal: 3,
      steadinessLabel: b.steady,
      settlingLabel: b.settlingSteady,
      reason: null,
      duringCueHint: null,
      cueAtMs: null,
    });
  });

  it('vibration fixture: heart still, reason as given, cue time set', () => {
    const v = liveView(fx('live-vibration'));
    expect(v.beatIntervalMs).toBeNull();
    expect(v.reason).toBe('Pulse paused while the band buzzes.');
    expect(v.cueAtMs).toBe(1794813715020);
  });

  it('the paused reason from the backend is shown verbatim', () => {
    expect(
      liveView({ state: 'vibration_overlap', signal: 3, reason: 'Paused while the band buzzes' }).reason,
    ).toBe('Paused while the band buzzes');
  });

  it.each(['live-collecting', 'live-contact-required', 'live-poor-quality-moving', 'live-stale'])(
    '%s: heart still and reason copied exactly',
    (name) => {
      const f = fx(name);
      const v = liveView(f);
      expect(v.beatIntervalMs).toBeNull();
      expect(v.reason).toBe(f.reason);
      expect(v.signal).toBe(f.signal);
    },
  );

  it('moving, steady and null steadiness', () => {
    expect(liveView({ steadiness: 'moving' }).steadinessLabel).toBe(b.holdStill);
    expect(liveView({ steadiness: 'steady' }).steadinessLabel).toBe(b.steady);
    expect(liveView({ steadiness: null }).steadinessLabel).toBeNull();
    expect(liveView({}).steadinessLabel).toBeNull();
  });

  it('every settling state and null', () => {
    expect(liveView({ settling: 'settling' }).settlingLabel).toBe(b.settling);
    expect(liveView({ settling: 'steady' }).settlingLabel).toBe(b.settlingSteady);
    expect(liveView({ settling: 'rising' }).settlingLabel).toBe(b.rising);
    expect(liveView({ settling: null }).settlingLabel).toBeNull();
  });

  it('signal bars are clamped 0 to 3', () => {
    expect([0, 1, 2, 3, 9, -1].map((s) => liveView({ signal: s }).signal)).toEqual([0, 1, 2, 3, 3, 0]);
    expect(liveView({}).signal).toBe(0);
  });

  it('the during-cue hint shows for either flag or both, otherwise not', () => {
    expect(liveView({ heart: { duringCue: true } }).duringCueHint).toBe(b.duringCues);
    expect(liveView({ settlingDuringCue: true }).duringCueHint).toBe(b.duringCues);
    expect(
      liveView({ heart: { duringCue: true }, settlingDuringCue: true }).duringCueHint,
    ).toBe(b.duringCues);
    expect(
      liveView({ heart: { duringCue: false }, settlingDuringCue: false }).duringCueHint,
    ).toBeNull();
    expect(liveView({ heart: { beatIntervalMs: 700 } }).duringCueHint).toBeNull();
  });

  it('the view has no pulse number and no calm index', () => {
    const v = liveView(fx('live-usable'));
    expect(JSON.stringify(v)).not.toMatch(/calm|bpm/i);
    expect(Object.keys(v).sort()).toEqual([
      'beatIntervalMs',
      'cueAtMs',
      'duringCueHint',
      'offline',
      'reason',
      'settlingLabel',
      'signal',
      'steadinessLabel',
    ]);
  });
});

describe('gating and polling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('flag off, demo, or not active: card inactive, no request made', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(bandCardActive({ enabled: false, isDemo: false, phase: 'active' })).toBe(false);
    expect(bandCardActive({ enabled: true, isDemo: true, phase: 'active' })).toBe(false);
    expect(bandCardActive({ enabled: true, isDemo: false, phase: 'paused' })).toBe(false);
    expect(bandCardActive({ enabled: true, isDemo: false, phase: 'active' })).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('polls every 2 s, stops on stop(), errors never throw', async () => {
    const fetchOnce = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue({ a: 1 });
    const onValue = vi.fn();
    const onError = vi.fn();
    const p = startPolling({ fetchOnce, onValue, onError });
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(onValue).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchOnce).toHaveBeenCalledTimes(3);
    p.stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchOnce).toHaveBeenCalledTimes(3);
  });
});

describe('summary polling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const settled = {
    pulse: { trend: 'settled' },
    plainWords: ['You completed 10 reps.', 'Your pulse settled as the session went on.'],
  };
  const insufficient = {
    pulse: { trend: 'insufficient' },
    plainWords: ['You completed 5 reps.', 'The band could not get a clear enough pulse reading this time.'],
  };

  it('waits, re-fetches every 5 s, stops once the trend is known', async () => {
    const fetchOnce = vi
      .fn()
      .mockResolvedValueOnce(insufficient)
      .mockResolvedValueOnce(insufficient)
      .mockResolvedValue(settled);
    const views: SummaryView[] = [];
    pollSummary({ fetchOnce, onView: (v) => views.push(v) });
    await vi.advanceTimersByTimeAsync(0);
    expect(views).toEqual([{ status: 'waiting' }]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchOnce).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(views.at(-1)).toEqual({ status: 'ready', lines: settled.plainWords });
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchOnce).toHaveBeenCalledTimes(3);
  });

  it('times out at 90 s and shows what is there, exactly as given', async () => {
    const fetchOnce = vi.fn().mockResolvedValue(insufficient);
    const views: SummaryView[] = [];
    pollSummary({ fetchOnce, onView: (v) => views.push(v) });
    await vi.advanceTimersByTimeAsync(89000);
    expect(views.at(-1)).toEqual({ status: 'waiting' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(views.at(-1)).toEqual({ status: 'ready', lines: insufficient.plainWords });
    const calls = fetchOnce.mock.calls.length;
    expect(calls).toBe(19);
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetchOnce).toHaveBeenCalledTimes(calls);
  });

  it('never available (404 or errors) gives none after 90 s', async () => {
    const fetchOnce = vi.fn().mockRejectedValue(new Error('companion 404'));
    const views: SummaryView[] = [];
    pollSummary({ fetchOnce, onView: (v) => views.push(v) });
    await vi.advanceTimersByTimeAsync(95000);
    expect(views.at(-1)).toEqual({ status: 'none' });
  });

  it('stop() cancels further fetches and views', async () => {
    const fetchOnce = vi.fn().mockResolvedValue(insufficient);
    const onView = vi.fn();
    const p = pollSummary({ fetchOnce, onView });
    await vi.advanceTimersByTimeAsync(0);
    p.stop();
    await vi.advanceTimersByTimeAsync(100000);
    expect(fetchOnce).toHaveBeenCalledTimes(1);
    expect(onView).toHaveBeenCalledTimes(1);
  });
});
