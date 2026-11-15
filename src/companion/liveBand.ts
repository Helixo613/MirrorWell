// Pure logic for the Calm Band live card and post-session summary (CONTRACT-UI.md §2, §3).
// No React, no globals except timers, so it is unit-testable. Never exposes BPM or calm index.
import { strings } from '@/config/strings';

// Demo-build tunables. Kept here (not in thresholds.ts) because thresholds.keys.test.ts pins the
// exact top-level key set of thresholds.ts; moving them is a docs-gated change (CLAUDE.md).
export const companionUi = Object.freeze({
  livePollMs: 2000,
  liveTimeoutMs: 1500,
  summaryPollMs: 5000,
  summaryMaxWaitMs: 180000,
});

export interface LiveSnapshot {
  state?: string;
  signal?: number;
  reason?: string | null;
  heart?: { beatIntervalMs?: number | null; duringCue?: boolean } | null;
  settling?: string | null;
  settlingDuringCue?: boolean;
  steadiness?: string | null;
  cue?: { lastAtMs?: number | null } | null;
}

export interface LiveBandView {
  offline: boolean;
  /** null → dimmed, still heart. */
  beatIntervalMs: number | null;
  signal: 0 | 1 | 2 | 3;
  steadinessLabel: string | null;
  settlingLabel: string | null;
  reason: string | null;
  duringCueHint: string | null;
  cueAtMs: number | null;
}

const OFFLINE_VIEW: LiveBandView = Object.freeze({
  offline: true,
  beatIntervalMs: null,
  signal: 0,
  steadinessLabel: null,
  settlingLabel: null,
  reason: null,
  duringCueHint: null,
  cueAtMs: null,
});

export function liveView(snap: LiveSnapshot | null): LiveBandView {
  if (!snap || typeof snap !== 'object') return OFFLINE_VIEW;
  const interval = snap.heart?.beatIntervalMs;
  const sig = Math.round(Number(snap.signal));
  const b = strings.bandCard;
  const settlingLabel =
    snap.settling === 'settling'
      ? b.settling
      : snap.settling === 'steady'
        ? b.settlingSteady
        : snap.settling === 'rising'
          ? b.rising
          : null;
  const steadinessLabel =
    snap.steadiness === 'steady' ? b.steady : snap.steadiness === 'moving' ? b.holdStill : null;
  const cueAt = snap.cue?.lastAtMs;
  return {
    offline: false,
    beatIntervalMs: typeof interval === 'number' && interval > 0 ? interval : null,
    signal: (sig >= 3 ? 3 : sig >= 1 ? sig : 0) as 0 | 1 | 2 | 3,
    steadinessLabel,
    settlingLabel,
    reason: typeof snap.reason === 'string' && snap.reason !== '' ? snap.reason : null,
    duringCueHint:
      snap.heart?.duringCue === true || snap.settlingDuringCue === true ? b.duringCues : null,
    cueAtMs: typeof cueAt === 'number' ? cueAt : null,
  };
}

/** The card (and its polling) exists only for a real, active session in a companion-enabled build. */
export function bandCardActive(o: { enabled: boolean; isDemo: boolean; phase: string }): boolean {
  return o.enabled && !o.isDemo && o.phase === 'active';
}

export interface Poller {
  stop(): void;
}

/** Polls `fetchOnce` every `intervalMs`, never overlapping; errors go to `onError`, never thrown. */
export function startPolling<T>(opts: {
  fetchOnce: () => Promise<T>;
  onValue: (v: T) => void;
  onError: () => void;
  intervalMs?: number;
}): Poller {
  const interval = opts.intervalMs ?? companionUi.livePollMs;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = async () => {
    try {
      const v = await opts.fetchOnce();
      if (!stopped) opts.onValue(v);
    } catch {
      if (!stopped) opts.onError();
    }
    if (!stopped) timer = setTimeout(() => void tick(), interval);
  };
  void tick();
  return {
    stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
    },
  };
}

// ---- Post-session summary -------------------------------------------------------------

export interface SummarySnapshot {
  pulse?: { trend?: string } | null;
  plainWords?: unknown;
}

export type SummaryView =
  | { status: 'waiting' }
  | { status: 'ready'; lines: string[] }
  | { status: 'none' };

function wordsOf(s: SummarySnapshot | null): string[] {
  if (!s || !Array.isArray(s.plainWords)) return [];
  return s.plainWords.filter((w): w is string => typeof w === 'string' && w !== '');
}

/** Re-fetches every summaryPollMs until the pulse trend is known or summaryMaxWaitMs passes. */
export function pollSummary(opts: {
  fetchOnce: () => Promise<SummarySnapshot>;
  onView: (v: SummaryView) => void;
  intervalMs?: number;
  maxWaitMs?: number;
}): Poller {
  const interval = opts.intervalMs ?? companionUi.summaryPollMs;
  const maxWait = opts.maxWaitMs ?? companionUi.summaryMaxWaitMs;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last: SummarySnapshot | null = null;
  let elapsed = 0;
  opts.onView({ status: 'waiting' });
  const finish = () => {
    const lines = wordsOf(last);
    opts.onView(lines.length > 0 ? { status: 'ready', lines } : { status: 'none' });
  };
  const tick = async () => {
    try {
      last = await opts.fetchOnce();
    } catch {
      /* keep the previous value; try again */
    }
    if (stopped) return;
    const trend = last?.pulse?.trend;
    if (trend && trend !== 'insufficient' && wordsOf(last).length > 0) {
      finish();
      return;
    }
    if (elapsed >= maxWait) {
      finish();
      return;
    }
    elapsed += interval;
    timer = setTimeout(() => void tick(), interval);
  };
  void tick();
  return {
    stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
    },
  };
}
