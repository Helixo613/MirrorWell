import { describe, expect, it } from 'vitest';
import { thresholds } from '../../src/config/thresholds';

// Task 1 acceptance: thresholds.ts exports every named tunable (API.md §15).
// A numeric literal used elsewhere without coming from this file is a review-blocking defect.
describe('thresholds', () => {
  it('exports the full key list from API.md §15', () => {
    expect(Object.keys(thresholds).sort()).toEqual(
      ['calibration', 'landmarker', 'metrics', 'qualityGates', 'reps', 'session'].sort(),
    );
  });

  it('landmarker exposes the three FaceLandmarker confidence options (no `confidence` field)', () => {
    expect(Object.keys(thresholds.landmarker).sort()).toEqual(
      ['minFaceDetectionConfidence', 'minFacePresenceConfidence', 'minTrackingConfidence'].sort(),
    );
  });

  it('qualityGates exposes all four gate tunables', () => {
    expect(Object.keys(thresholds.qualityGates).sort()).toEqual(
      ['interOcularMinPx', 'jitterMaxPct', 'lumaMin', 'poseMaxDeg'].sort(),
    );
  });

  it('metrics exposes all five metric tunables', () => {
    expect(Object.keys(thresholds.metrics).sort()).toEqual(
      ['easeOffSustainMs', 'easeOffThreshold', 'effortTargetZone', 'movementFloorPct', 'smoothingWindow'].sort(),
    );
  });

  it('reps exposes all four rep-detection tunables', () => {
    expect(Object.keys(thresholds.reps).sort()).toEqual(
      ['endThreshold', 'minDurationMs', 'minQualityFramePct', 'startThreshold'].sort(),
    );
  });

  it('calibration exposes all five calibration tunables', () => {
    expect(Object.keys(thresholds.calibration).sort()).toEqual(
      ['captureSeconds', 'driftMaxPct', 'minQualityScore', 'neutralCaptures', 'staleDays'].sort(),
    );
  });

  it('session exposes the quality-problem stop-offer tunable', () => {
    expect(Object.keys(thresholds.session).sort()).toEqual(['qualityProblemOfferStopMs'].sort());
  });

  it('is frozen (cannot be mutated at runtime)', () => {
    expect(Object.isFrozen(thresholds)).toBe(true);
  });
});
