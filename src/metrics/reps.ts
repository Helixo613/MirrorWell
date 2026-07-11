import { thresholds } from '@/config/thresholds';
import type { MetricSample } from '@/types/sensing';
import type { RepEvent } from '@/types/session';

type RepPhase = 'idle' | 'active';

interface ActiveRep {
  startedAtMs: number;
  peakSymmetryIndex: number | null;
  peakEffortIndex: number;
  easeOffTriggered: boolean;
  okFrames: number;
  totalFrames: number;
}

let repIndex = 0;
let phase: RepPhase = 'idle';
let activeRep: ActiveRep | null = null;

function resetActiveRep(startedAtMs: number): ActiveRep {
  return {
    startedAtMs,
    peakSymmetryIndex: null,
    peakEffortIndex: 0,
    easeOffTriggered: false,
    okFrames: 0,
    totalFrames: 0,
  };
}

function finalizeRep(rep: ActiveRep): RepEvent | null {
  const durationMs = Math.round(performance.now() - rep.startedAtMs);
  if (durationMs < thresholds.reps.minDurationMs) {
    return null;
  }

  const qualityPct =
    rep.totalFrames > 0 ? rep.okFrames / rep.totalFrames : 0;
  if (qualityPct < thresholds.reps.minQualityFramePct) {
    return null;
  }

  return {
    repIndex,
    peakSymmetryIndex: rep.peakSymmetryIndex,
    peakEffortIndex: rep.peakEffortIndex,
    durationMs,
    easeOffTriggered: rep.easeOffTriggered,
  };
}

export const RepDetector = {
  feed(sample: MetricSample, qualityOk: boolean): RepEvent | null {
    const effort = sample.effortIndex;
    const { startThreshold, endThreshold } = thresholds.reps;

    if (phase === 'idle') {
      if (effort >= startThreshold) {
        phase = 'active';
        activeRep = resetActiveRep(sample.timestampMs);
      }
      return null;
    }

    if (!activeRep) {
      phase = 'idle';
      return null;
    }

    activeRep.totalFrames += 1;
    if (qualityOk) {
      activeRep.okFrames += 1;
    }

    if (
      sample.symmetryIndex !== null &&
      (activeRep.peakSymmetryIndex === null ||
        sample.symmetryIndex > activeRep.peakSymmetryIndex)
    ) {
      activeRep.peakSymmetryIndex = sample.symmetryIndex;
    }
    if (effort > activeRep.peakEffortIndex) {
      activeRep.peakEffortIndex = effort;
    }

    if (effort <= endThreshold) {
      const completed = finalizeRep(activeRep);
      phase = 'idle';
      activeRep = null;
      if (completed) {
        repIndex += 1;
        return completed;
      }
    }

    return null;
  },

  markEaseOff(): void {
    if (activeRep) {
      activeRep.easeOffTriggered = true;
    }
  },

  reset(): void {
    repIndex = 0;
    phase = 'idle';
    activeRep = null;
  },

  getRepIndex(): number {
    return repIndex;
  },

  isActive(): boolean {
    return phase === 'active';
  },
};
