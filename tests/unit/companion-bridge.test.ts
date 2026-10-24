// SPIKE tests for src/companion/companionBridge.ts (branch spike/companion-sample).
import { describe, expect, it } from 'vitest';
import { attachCompanion, type CompanionTransport } from '@/companion/companionBridge';
import { Emitter } from '@/session/emitter';
import type { SessionEventMap } from '@/types/session';
import type { SessionRecordFull } from '@/data/storage';

function rig(overrides: { enabled?: boolean; isDemo?: boolean; failing?: boolean } = {}) {
  const emitter = new Emitter<SessionEventMap & Record<string, unknown>>();
  const calls: Array<{ path: string; body: unknown }> = [];
  const transport: CompanionTransport = {
    post: async (path, body) => {
      calls.push({ path, body });
      if (overrides.failing) throw new Error('offline');
    },
  };
  let n = 0;
  const handle = attachCompanion({
    on: (e, cb) => emitter.on(e, cb),
    transport,
    enabled: overrides.enabled ?? true,
    isDemo: overrides.isDemo ?? false,
    newId: () => `cs-${++n}`,
    nowMs: () => 1_000,
  });
  return { emitter, calls, handle };
}

const record: SessionRecordFull = {
  sessionId: 'local-1',
  profileId: 'profile-secret',
  baselineId: 'baseline-secret',
  startedAt: '2026-10-21T00:00:00.000Z',
  endedAt: '2026-10-21T00:05:00.000Z',
  endReason: 'completed',
  results: [
    {
      resultId: 'r1',
      sessionId: 'local-1',
      exerciseId: 'EX_SMILE',
      repsCompleted: 5,
      meanSymmetryIndex: 0.82,
      meanEffortIndex: 0.6,
      easeOffCount: 1,
      lowQualityFramePct: 0.05,
      reps: [
        { repId: 'p1', resultId: 'r1', repIndex: 0, peakSymmetryIndex: 0.8, peakEffortIndex: 0.7, durationMs: 1500, easeOffTriggered: 0 },
      ],
    },
  ],
};

describe('companion bridge (spike)', () => {
  it('is inert when disabled at build time', () => {
    const { emitter, calls } = rig({ enabled: false });
    emitter.emit('stateChanged', { exerciseId: 'EX_SMILE', state: 'DEMO' });
    emitter.emit('sessionEnded', { record });
    expect(calls).toEqual([]);
  });

  it('is inert for demo sessions', () => {
    const { emitter, calls } = rig({ isDemo: true });
    emitter.emit('stateChanged', { exerciseId: 'EX_SMILE', state: 'DEMO' });
    expect(calls).toEqual([]);
  });

  it('opens a companion session on the first event and forwards rep/ease-off events in order', () => {
    const { emitter, calls } = rig();
    emitter.emit('stateChanged', { exerciseId: 'EX_SMILE', state: 'REPS' });
    emitter.emit('repCompleted', {
      event: { repIndex: 0, peakSymmetryIndex: 0.8, peakEffortIndex: 0.7, durationMs: 1499.6, easeOffTriggered: false },
    });
    emitter.emit('easeOff', { active: true });
    expect(calls.map((c) => c.path)).toEqual([
      '/api/companion/sessions',
      '/api/companion/sessions/cs-1/events',
      '/api/companion/sessions/cs-1/events',
      '/api/companion/sessions/cs-1/events',
    ]);
    expect(calls[2]!.body).toEqual({ type: 'rep', seq: 2, atMs: 1_000, repIndex: 0, peakEffortIndex: 0.7, durationMs: 1500 });
    expect(calls[3]!.body).toEqual({ type: 'ease_off', seq: 3, atMs: 1_000, active: true });
  });

  it('never forwards per-frame metric or quality events', () => {
    const { emitter, calls } = rig();
    emitter.emit('metricUpdate', {
      sample: { timestampMs: 1, exerciseId: 'EX_SMILE', symmetryIndex: 0.5, effortIndex: 0.5 } as never,
    });
    emitter.emit('qualityUpdate', { state: 'FACE_LOST' } as never);
    expect(calls).toEqual([]);
  });

  it('uploads only whitelisted summary fields at session end (no ids, no per-rep rows)', () => {
    const { emitter, calls } = rig();
    emitter.emit('sessionEnded', { record });
    const end = calls.find((c) => c.path.endsWith('/end'))!;
    const json = JSON.stringify(end.body);
    expect(json).not.toContain('profile-secret');
    expect(json).not.toContain('baseline-secret');
    expect(json).not.toContain('repId');
    expect(end.body).toEqual({
      localSessionId: 'local-1',
      endReason: 'completed',
      endedAtMs: 1_000,
      exercises: [
        { exerciseId: 'EX_SMILE', repsCompleted: 5, meanSymmetryIndex: 0.82, meanEffortIndex: 0.6, easeOffCount: 1, lowQualityFramePct: 0.05 },
      ],
    });
  });

  it('swallows transport failures so a session is never broken by the companion', async () => {
    const { emitter, handle } = rig({ failing: true });
    expect(() => emitter.emit('stateChanged', { exerciseId: 'EX_SMILE', state: 'REPS' })).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(handle.failures).toBe(2);
  });

  it('stops forwarding after detach', () => {
    const { emitter, calls, handle } = rig();
    handle.detach();
    emitter.emit('stateChanged', { exerciseId: 'EX_SMILE', state: 'REPS' });
    expect(calls).toEqual([]);
  });
});
