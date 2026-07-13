// src/dev/liveV1HarnessState.ts — pure state machine for the Live V1 protocol harness.
// Dev-only. Tested without React. Protocol order: MODEL_AND_DATA.md §7.
import { thresholds } from '../config/thresholds.ts';

export type HarnessUiState = 'setup' | 'prepare' | 'recording' | 'review' | 'report';

/** Protocol phases in exact order (MODEL_AND_DATA.md §7). */
export type ProtocolPhase =
  | 'neutral'
  | 'frontal_smile'
  | 'left_yaw'
  | 'right_yaw'
  | 'dim_light'
  | 'distance_2m';

export const PROTOCOL_PHASES: readonly ProtocolPhase[] = Object.freeze([
  'neutral',
  'frontal_smile',
  'left_yaw',
  'right_yaw',
  'dim_light',
  'distance_2m',
]);

export function isYawPhase(phase: ProtocolPhase): boolean {
  return phase === 'left_yaw' || phase === 'right_yaw';
}

export function phaseDurationMs(phase: ProtocolPhase): number {
  return phase === 'neutral' ? thresholds.v1Protocol.neutralMs : thresholds.v1Protocol.smileHoldMs;
}

export interface PhaseValidity {
  ok: boolean;
  reasons: string[];
  okCount: number;
  totalCount: number;
  okPct: number;
  meanAbsYawDeg: number | null;
}

export interface HarnessState {
  ui: HarnessUiState;
  /** 1-based trial counter. */
  trial: number;
  phaseIndex: number;
  /** Phases accepted for the current trial only. */
  acceptedPhases: readonly ProtocolPhase[];
  cameraReady: boolean;
  qualityOkRecently: boolean;
}

export type HarnessAction =
  | { type: 'SET_CAMERA_READY'; ready: boolean }
  | { type: 'SET_QUALITY_OK_RECENTLY'; ok: boolean }
  | { type: 'START_PROTOCOL' }
  | { type: 'BEGIN_RECORDING' }
  | { type: 'FINISH_RECORDING' }
  | { type: 'ACCEPT_PHASE'; validity: PhaseValidity }
  | { type: 'RETRY_PHASE' }
  | { type: 'CONTINUE_NEXT_TRIAL' }
  | { type: 'RESET' };

export function createInitialHarnessState(): HarnessState {
  return {
    ui: 'setup',
    trial: 1,
    phaseIndex: 0,
    acceptedPhases: [],
    cameraReady: false,
    qualityOkRecently: false,
  };
}

/** Start is disabled until camera is ready and quality was OK recently. */
export function canStartProtocol(state: HarnessState): boolean {
  return state.ui === 'setup' && state.cameraReady && state.qualityOkRecently;
}

export function currentPhase(state: HarnessState): ProtocolPhase | null {
  if (state.ui === 'report') return null;
  return PROTOCOL_PHASES[state.phaseIndex] ?? null;
}

export function evaluatePhaseValidity(input: {
  okCount: number;
  totalCount: number;
  meanAbsYawDeg: number | null;
  phase: ProtocolPhase;
}): PhaseValidity {
  const { minOkFramePct, yawTargetMinDeg, yawTargetMaxDeg } = thresholds.v1Protocol;
  const okPct = input.totalCount === 0 ? 0 : input.okCount / input.totalCount;
  const reasons: string[] = [];

  if (okPct < minOkFramePct) {
    reasons.push('low_ok_pct');
  }
  if (isYawPhase(input.phase)) {
    const yaw = input.meanAbsYawDeg;
    if (yaw === null || !Number.isFinite(yaw) || yaw < yawTargetMinDeg || yaw > yawTargetMaxDeg) {
      reasons.push('yaw_band');
    }
  }

  return {
    ok: reasons.length === 0 && input.totalCount > 0,
    reasons,
    okCount: input.okCount,
    totalCount: input.totalCount,
    okPct,
    meanAbsYawDeg: input.meanAbsYawDeg,
  };
}

export function reduceHarness(state: HarnessState, action: HarnessAction): HarnessState {
  switch (action.type) {
    case 'SET_CAMERA_READY':
      return { ...state, cameraReady: action.ready };

    case 'SET_QUALITY_OK_RECENTLY':
      return { ...state, qualityOkRecently: action.ok };

    case 'START_PROTOCOL': {
      if (!canStartProtocol(state)) return state;
      return {
        ...state,
        ui: 'prepare',
        phaseIndex: 0,
        acceptedPhases: [],
      };
    }

    case 'BEGIN_RECORDING': {
      if (state.ui !== 'prepare') return state;
      return { ...state, ui: 'recording' };
    }

    case 'FINISH_RECORDING': {
      if (state.ui !== 'recording') return state;
      return { ...state, ui: 'review' };
    }

    case 'ACCEPT_PHASE': {
      if (state.ui !== 'review' || !action.validity.ok) return state;
      const phase = PROTOCOL_PHASES[state.phaseIndex];
      if (!phase) return state;

      const acceptedPhases = state.acceptedPhases.includes(phase)
        ? state.acceptedPhases
        : [...state.acceptedPhases, phase];

      const nextIndex = state.phaseIndex + 1;
      if (nextIndex < PROTOCOL_PHASES.length) {
        return {
          ...state,
          ui: 'prepare',
          phaseIndex: nextIndex,
          acceptedPhases,
        };
      }

      // All phases accepted for this trial.
      if (state.trial < thresholds.v1Protocol.trials) {
        // Full re-setup between trials (user re-confirms).
        return {
          ...state,
          ui: 'setup',
          trial: state.trial + 1,
          phaseIndex: 0,
          acceptedPhases: [],
          qualityOkRecently: false,
        };
      }

      return {
        ...state,
        ui: 'report',
        acceptedPhases,
        phaseIndex: PROTOCOL_PHASES.length - 1,
      };
    }

    case 'RETRY_PHASE': {
      if (state.ui !== 'review') return state;
      return { ...state, ui: 'prepare' };
    }

    case 'CONTINUE_NEXT_TRIAL': {
      // Explicit ack when landed in setup for trial 2+ (optional; Start protocol also works).
      if (state.ui !== 'setup' || state.trial <= 1) return state;
      if (!canStartProtocol(state)) return state;
      return {
        ...state,
        ui: 'prepare',
        phaseIndex: 0,
        acceptedPhases: [],
      };
    }

    case 'RESET':
      return {
        ...createInitialHarnessState(),
        cameraReady: state.cameraReady,
        qualityOkRecently: false,
      };

    default:
      return state;
  }
}
