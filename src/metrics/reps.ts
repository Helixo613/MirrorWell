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
import type { MetricSample } from './metrics.ts';
import { thresholds } from '../config/thresholds.ts';

export interface RepEvent {
  repIndex: number;
  peakSymmetryIndex: number | null;
  peakEffortIndex: number;
  durationMs: number;
  easeOffTriggered: boolean;
}

const { startThreshold, endThreshold, minDurationMs } = thresholds.reps;
const { easeOffThreshold, easeOffSustainMs } = thresholds.metrics;

let repIndex = 0;
let active = false;
let startTimestampMs = 0;
let peakSymmetryIndex: number | null = null;
let peakEffortIndex = 0;
let easeOffSustainStartMs: number | null = null;
let easeOffFired = false;

function reset(): void {
  repIndex = 0;
  active = false;
  startTimestampMs = 0;
  peakSymmetryIndex = null;
  peakEffortIndex = 0;
  easeOffSustainStartMs = null;
  easeOffFired = false;
}

function feed(sample: MetricSample): RepEvent | null {
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

    active = false;
    startTimestampMs = 0;
    peakSymmetryIndex = null;
    peakEffortIndex = 0;
    easeOffSustainStartMs = null;
    easeOffFired = false;

    if (durationMs < minDurationMs) {
      return null;
    }
    repIndex += 1;
    return event;
  }

  return null;
}

export const RepDetector = { feed, reset };
