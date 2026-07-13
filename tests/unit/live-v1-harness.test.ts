import { describe, expect, it } from 'vitest';
import { thresholds } from '../../src/config/thresholds.ts';
import {
  canStartProtocol,
  createInitialHarnessState,
  currentPhase,
  evaluatePhaseValidity,
  PROTOCOL_PHASES,
  reduceHarness,
  type HarnessState,
} from '../../src/dev/liveV1HarnessState.ts';

function readySetup(overrides: Partial<HarnessState> = {}): HarnessState {
  return {
    ...createInitialHarnessState(),
    cameraReady: true,
    qualityOkRecently: true,
    ...overrides,
  };
}

describe('Live V1 harness state machine', () => {
  it('disables start until camera ready and quality recently OK', () => {
    let s = createInitialHarnessState();
    expect(canStartProtocol(s)).toBe(false);

    s = reduceHarness(s, { type: 'SET_CAMERA_READY', ready: true });
    expect(canStartProtocol(s)).toBe(false);

    s = reduceHarness(s, { type: 'SET_QUALITY_OK_RECENTLY', ok: true });
    expect(canStartProtocol(s)).toBe(true);

    // START_PROTOCOL ignored when not ready
    const blocked = reduceHarness(createInitialHarnessState(), { type: 'START_PROTOCOL' });
    expect(blocked.ui).toBe('setup');

    s = reduceHarness(s, { type: 'START_PROTOCOL' });
    expect(s.ui).toBe('prepare');
    expect(currentPhase(s)).toBe('neutral');
  });

  it('walks setup → prepare → recording → review and advances on accept', () => {
    let s = readySetup();
    s = reduceHarness(s, { type: 'START_PROTOCOL' });
    expect(s.ui).toBe('prepare');

    s = reduceHarness(s, { type: 'BEGIN_RECORDING' });
    expect(s.ui).toBe('recording');

    s = reduceHarness(s, { type: 'FINISH_RECORDING' });
    expect(s.ui).toBe('review');

    const valid = evaluatePhaseValidity({
      okCount: 80,
      totalCount: 100,
      meanAbsYawDeg: null,
      phase: 'neutral',
    });
    expect(valid.ok).toBe(true);

    s = reduceHarness(s, { type: 'ACCEPT_PHASE', validity: valid });
    expect(s.ui).toBe('prepare');
    expect(s.phaseIndex).toBe(1);
    expect(s.acceptedPhases).toEqual(['neutral']);
    expect(currentPhase(s)).toBe('frontal_smile');
  });

  it('retries the current phase without clearing accepted phases', () => {
    let s = readySetup();
    s = reduceHarness(s, { type: 'START_PROTOCOL' });
    s = reduceHarness(s, { type: 'BEGIN_RECORDING' });
    s = reduceHarness(s, { type: 'FINISH_RECORDING' });
    s = reduceHarness(s, {
      type: 'ACCEPT_PHASE',
      validity: evaluatePhaseValidity({
        okCount: 90,
        totalCount: 100,
        meanAbsYawDeg: null,
        phase: 'neutral',
      }),
    });
    expect(s.acceptedPhases).toEqual(['neutral']);
    expect(currentPhase(s)).toBe('frontal_smile');

    s = reduceHarness(s, { type: 'BEGIN_RECORDING' });
    s = reduceHarness(s, { type: 'FINISH_RECORDING' });
    s = reduceHarness(s, { type: 'RETRY_PHASE' });

    expect(s.ui).toBe('prepare');
    expect(s.phaseIndex).toBe(1);
    expect(s.acceptedPhases).toEqual(['neutral']);
    expect(currentPhase(s)).toBe('frontal_smile');
  });

  it('rejects accept when capture is invalid (low OK percent)', () => {
    let s = readySetup();
    s = reduceHarness(s, { type: 'START_PROTOCOL' });
    s = reduceHarness(s, { type: 'BEGIN_RECORDING' });
    s = reduceHarness(s, { type: 'FINISH_RECORDING' });

    const invalid = evaluatePhaseValidity({
      okCount: 50,
      totalCount: 100,
      meanAbsYawDeg: null,
      phase: 'neutral',
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.reasons).toContain('low_ok_pct');

    const next = reduceHarness(s, { type: 'ACCEPT_PHASE', validity: invalid });
    expect(next.ui).toBe('review');
    expect(next.acceptedPhases).toEqual([]);
  });

  it('requires yaw band for yaw phases', () => {
    const bad = evaluatePhaseValidity({
      okCount: 90,
      totalCount: 100,
      meanAbsYawDeg: 3,
      phase: 'left_yaw',
    });
    expect(bad.ok).toBe(false);
    expect(bad.reasons).toContain('yaw_band');

    const good = evaluatePhaseValidity({
      okCount: 90,
      totalCount: 100,
      meanAbsYawDeg: 10,
      phase: 'right_yaw',
    });
    expect(good.ok).toBe(true);
  });

  it('runs two trials with full re-setup between them, then report', () => {
    expect(PROTOCOL_PHASES).toEqual([
      'neutral',
      'frontal_smile',
      'left_yaw',
      'right_yaw',
      'dim_light',
      'distance_2m',
    ]);
    expect(thresholds.v1Protocol.trials).toBe(2);

    let s = readySetup();
    s = reduceHarness(s, { type: 'START_PROTOCOL' });

    for (let i = 0; i < PROTOCOL_PHASES.length; i++) {
      const phase = PROTOCOL_PHASES[i]!;
      s = reduceHarness(s, { type: 'BEGIN_RECORDING' });
      s = reduceHarness(s, { type: 'FINISH_RECORDING' });
      s = reduceHarness(s, {
        type: 'ACCEPT_PHASE',
        validity: evaluatePhaseValidity({
          okCount: 90,
          totalCount: 100,
          meanAbsYawDeg: phase.includes('yaw') ? 10 : null,
          phase,
        }),
      });
    }

    // After trial 1 completes → setup for trial 2
    expect(s.ui).toBe('setup');
    expect(s.trial).toBe(2);
    expect(s.acceptedPhases).toEqual([]);
    expect(s.qualityOkRecently).toBe(false);
    expect(canStartProtocol(s)).toBe(false);

    s = reduceHarness(s, { type: 'SET_QUALITY_OK_RECENTLY', ok: true });
    s = reduceHarness(s, { type: 'START_PROTOCOL' });

    for (let i = 0; i < PROTOCOL_PHASES.length; i++) {
      const phase = PROTOCOL_PHASES[i]!;
      s = reduceHarness(s, { type: 'BEGIN_RECORDING' });
      s = reduceHarness(s, { type: 'FINISH_RECORDING' });
      s = reduceHarness(s, {
        type: 'ACCEPT_PHASE',
        validity: evaluatePhaseValidity({
          okCount: 90,
          totalCount: 100,
          meanAbsYawDeg: phase.includes('yaw') ? 10 : null,
          phase,
        }),
      });
    }

    expect(s.ui).toBe('report');
    expect(s.trial).toBe(2);
  });

  it('RESET returns to setup without losing camera readiness flag', () => {
    let s = readySetup();
    s = reduceHarness(s, { type: 'START_PROTOCOL' });
    s = reduceHarness(s, { type: 'RESET' });
    expect(s.ui).toBe('setup');
    expect(s.trial).toBe(1);
    expect(s.cameraReady).toBe(true);
    expect(s.qualityOkRecently).toBe(false);
  });
});
