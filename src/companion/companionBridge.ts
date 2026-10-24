// src/companion/companionBridge.ts — SPIKE (branch spike/companion-sample, not for merge as-is).
//
// Opt-in "companion mode" for the Calm Band. It listens to the SessionController's existing
// event surface (API §10) and forwards a small, explicitly whitelisted set of NUMERIC session
// facts to a SAME-ORIGIN backend (`/api/companion/...`). The backend links them to the band's
// pulse/motion windows and decides which haptic cue the band should play.
//
// What never leaves the browser: camera frames, landmarks, blendshapes, per-frame metric
// samples (`metricUpdate`), quality states, profile text, nickname/motivation, caregiver note.
//
// Real implementation would need (repo deviation protocol): ARCHITECTURE §12 glossary entries,
// a SAFETY_AND_COMPLIANCE amendment for the opt-in upload, a strings.ts/thresholds.ts move for
// the literals below, and a TESTS.md row. This spike keeps them local to make the shape visible.
import type { EndReason, ExerciseId } from '@/data/schema';
import type { SessionRecordFull } from '@/data/storage';
import type { SessionEventMap } from '@/types/session';

// Only the four events the companion consumes. (SessionEventMap also lists 'repDiscarded', which
// the controller's own Events type does not emit — typing against the narrow set keeps
// SessionController.on assignable.)
type UsedEvents = Pick<SessionEventMap, 'stateChanged' | 'repCompleted' | 'easeOff' | 'sessionEnded'>;
type On = <E extends keyof UsedEvents>(
  event: E,
  callback: (value: UsedEvents[E]) => void,
) => () => void;

export interface CompanionTransport {
  post(path: string, body: unknown): Promise<void>;
}

export interface CompanionOptions {
  on: On;
  transport: CompanionTransport;
  enabled: boolean;
  isDemo: boolean;
  newId?: () => string;
  nowMs?: () => number;
}

export interface CompanionHandle {
  readonly companionSessionId: string | null;
  readonly failures: number;
  detach(): void;
}

// Upload payloads — the complete list of fields that may cross the network. Anything not
// named here cannot be sent, because builders copy fields one by one (no object spreads).
export type CompanionEvent =
  | { type: 'exercise_state'; seq: number; atMs: number; exerciseId: ExerciseId; state: 'DEMO' | 'REPS' | 'REST' }
  | { type: 'rep'; seq: number; atMs: number; repIndex: number; peakEffortIndex: number; durationMs: number }
  | { type: 'ease_off'; seq: number; atMs: number; active: boolean };

export interface CompanionSessionEnd {
  localSessionId: string;
  endReason: EndReason;
  endedAtMs: number;
  exercises: Array<{
    exerciseId: ExerciseId;
    repsCompleted: number;
    meanSymmetryIndex: number | null;
    meanEffortIndex: number | null;
    easeOffCount: number;
    lowQualityFramePct: number;
  }>;
}

const BASE = '/api/companion';

export function summariseRecord(record: SessionRecordFull, endedAtMs: number): CompanionSessionEnd {
  return {
    localSessionId: record.sessionId,
    endReason: record.endReason,
    endedAtMs,
    exercises: record.results.map((r) => ({
      exerciseId: r.exerciseId,
      repsCompleted: r.repsCompleted,
      meanSymmetryIndex: r.meanSymmetryIndex,
      meanEffortIndex: r.meanEffortIndex,
      easeOffCount: r.easeOffCount,
      lowQualityFramePct: r.lowQualityFramePct,
    })),
  };
}

export function attachCompanion(opts: CompanionOptions): CompanionHandle {
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const nowMs = opts.nowMs ?? (() => Date.now());
  let companionSessionId: string | null = null;
  let failures = 0;
  let seq = 0;

  // Disabled or demo → a no-op handle. Demo sessions are placeholders, never real data.
  if (!opts.enabled || opts.isDemo) {
    return { companionSessionId: null, failures: 0, detach: () => {} };
  }

  // Fire-and-forget: the companion must never block, slow or break a facial-exercise session.
  const send = (path: string, body: unknown) => {
    void opts.transport.post(`${BASE}${path}`, body).catch(() => {
      failures += 1;
    });
  };

  const ensureStarted = () => {
    if (companionSessionId) return companionSessionId;
    companionSessionId = newId();
    send('/sessions', { companionSessionId, startedAtMs: nowMs() });
    return companionSessionId;
  };

  const sendEvent = (event: CompanionEvent) => send(`/sessions/${ensureStarted()}/events`, event);

  const unsubs = [
    opts.on('stateChanged', ({ exerciseId, state }) => {
      sendEvent({ type: 'exercise_state', seq: ++seq, atMs: nowMs(), exerciseId, state });
    }),
    opts.on('repCompleted', ({ event }) => {
      sendEvent({
        type: 'rep',
        seq: ++seq,
        atMs: nowMs(),
        repIndex: event.repIndex,
        peakEffortIndex: event.peakEffortIndex,
        durationMs: Math.round(event.durationMs),
      });
    }),
    opts.on('easeOff', ({ active }) => {
      sendEvent({ type: 'ease_off', seq: ++seq, atMs: nowMs(), active });
    }),
    opts.on('sessionEnded', ({ record }) => {
      const id = ensureStarted();
      send(`/sessions/${id}/end`, summariseRecord(record, nowMs()));
    }),
  ];

  return {
    get companionSessionId() {
      return companionSessionId;
    },
    get failures() {
      return failures;
    },
    detach() {
      for (const u of unsubs) u();
    },
  };
}

// Same-origin JSON transport. Relative URLs only: an absolute URL here would be an
// off-origin request and must fail the no-network gate.
export const sameOriginTransport: CompanionTransport = {
  async post(path, body) {
    if (!path.startsWith('/')) throw new Error('companion transport accepts same-origin paths only');
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
    if (!res.ok) throw new Error(`companion ${res.status}`);
  },
};

// Build-time switch. The ordinary (Vercel) build leaves it unset → companion code is inert.
export const companionEnabledAtBuild = import.meta.env.VITE_COMPANION_ENABLED === 'true';
