// src/metrics/reps.ts — rep state machine over MetricSample streams (docs/BACKEND.md §1.5).
// Contracts: docs/API.md §9. Canonical math: docs/ARCHITECTURE.md §7. Pure, stateful per
// exercise instance — SessionController calls reset() on every exercise transition.
//
// easeOffTriggered note: MetricSample (API.md §8) carries only {symmetryIndex, effortIndex,
// timestampMs} — no ease-off flag. RepDetector already receives smoothed effortIndex +
// timestampMs for every frame of the active rep, so it independently applies the same
// sustained-threshold rule ARCHITECTURE §7 defines for MetricEngine.isEaseOffActive()
// (effortIndex > easeOffThreshold sustained >= easeOffSustainMs) to flag the rep, rather than
// widening the MetricSample contract for a per-rep summary bit.
//
// DOCS-CHANGE (Task 8, 2026-07-10): API.md §9 amended to add getState(). ARCHITECTURE §12's
// canonical DebugHud CSV columns include repState, and feed()/reset() alone give no way to
// observe whether a rep is currently in progress. 'idle' | 'active' isn't defined anywhere in
// the docs — it's the simplest honest exposure of the internal `active` flag already tracked
// above, named to match the isReady()/isRunning()/isDemoMode() query-method convention.
//
// DOCS-CHANGE (Task B4): gap > metrics.gapResetMs while active aborts the rep without emitting
// a RepEvent (repIndex not consumed); ease-off tracking for that rep is cleared.
import type { MetricSample } from './metrics.ts';
import { thresholds } from '../config/thresholds.ts';

export interface RepEvent {
  repIndex: number;
  peakSymmetryIndex: number | null;
  peakEffortIndex: number;
  durationMs: number;
  easeOffTriggered: boolean;
}

export type RepState = 'idle' | 'active';

const { startThreshold, endThreshold, minDurationMs } = thresholds.reps;
const { easeOffThreshold, easeOffSustainMs, gapResetMs } = thresholds.metrics;

let repIndex = 0;
let active = false;
let startTimestampMs = 0;
let peakSymmetryIndex: number | null = null;
let peakEffortIndex = 0;
let easeOffSustainStartMs: number | null = null;
let easeOffFired = false;
let lastTimestampMs: number | null = null;

function clearActiveRepState(): void {
  active = false;
  startTimestampMs = 0;
  peakSymmetryIndex = null;
  peakEffortIndex = 0;
  easeOffSustainStartMs = null;
  easeOffFired = false;
}

function reset(): void {
  repIndex = 0;
  clearActiveRepState();
  lastTimestampMs = null;
}

function feed(sample: MetricSample): RepEvent | null {
  // Gap rule: while active, a sample gap > gapResetMs aborts without emitting a RepEvent.
  if (active && lastTimestampMs !== null && sample.timestampMs - lastTimestampMs > gapResetMs) {
    clearActiveRepState();
  }
  lastTimestampMs = sample.timestampMs;

  if (!active) {
    if (sample.effortIndex > startThreshold) {
      active = true;
      startTimestampMs = sample.timestampMs;
      peakSymmetryIndex = sample.symmetryIndex;
      peakEffortIndex = sample.effortIndex;
      easeOffSustainStartMs = sample.effortIndex > easeOffThreshold ? sample.timestampMs : null;
      easeOffFired = false;
    }
    return null;
  }

  if (sample.symmetryIndex !== null && (peakSymmetryIndex === null || sample.symmetryIndex > peakSymmetryIndex)) {
    peakSymmetryIndex = sample.symmetryIndex;
  }
  if (sample.effortIndex > peakEffortIndex) {
    peakEffortIndex = sample.effortIndex;
  }

  if (sample.effortIndex > easeOffThreshold) {
    if (easeOffSustainStartMs === null) {
      easeOffSustainStartMs = sample.timestampMs;
    } else if (sample.timestampMs - easeOffSustainStartMs >= easeOffSustainMs) {
      easeOffFired = true;
    }
  } else {
    easeOffSustainStartMs = null;
  }

  if (sample.effortIndex < endThreshold) {
    const durationMs = sample.timestampMs - startTimestampMs;
    const event: RepEvent = {
      repIndex,
      peakSymmetryIndex,
      peakEffortIndex,
      durationMs,
      easeOffTriggered: easeOffFired,
    };

    clearActiveRepState();

    if (durationMs < minDurationMs) {
      return null;
    }
    repIndex += 1;
    return event;
  }

  return null;
}

function getState(): RepState {
  return active ? 'active' : 'idle';
}

export const RepDetector = { feed, getState, reset };
