import { thresholds } from '@/config/thresholds';
import type { MetricSample } from '@/types/sensing';

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export class SampleSmoother {
  private readonly window: number;
  private symmetryWindow: number[] = [];
  private effortWindow: number[] = [];

  constructor(window = thresholds.metrics.smoothingWindow) {
    this.window = window;
  }

  push(sample: MetricSample): MetricSample {
    this.effortWindow.push(sample.effortIndex);
    if (this.effortWindow.length > this.window) {
      this.effortWindow.shift();
    }

    if (sample.symmetryIndex !== null) {
      this.symmetryWindow.push(sample.symmetryIndex);
      if (this.symmetryWindow.length > this.window) {
        this.symmetryWindow.shift();
      }
    }

    return {
      symmetryIndex:
        this.symmetryWindow.length > 0
          ? median(this.symmetryWindow)
          : sample.symmetryIndex,
      effortIndex: median(this.effortWindow),
      timestampMs: sample.timestampMs,
    };
  }

  reset(): void {
    this.symmetryWindow = [];
    this.effortWindow = [];
  }
}
