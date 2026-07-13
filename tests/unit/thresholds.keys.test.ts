import { describe, expect, it } from 'vitest';
import { thresholds } from '../../src/config/thresholds';

// Task 1 acceptance: thresholds.ts exports every named tunable (API.md §15).
// A numeric literal used elsewhere without coming from this file is a review-blocking defect.
describe('thresholds', () => {
  it('exports the full key list from API.md §15', () => {
    expect(Object.keys(thresholds).sort()).toEqual(
      ['calibration', 'landmarker', 'metrics', 'qualityGates', 'reps', 'session', 'v1Protocol'].sort(),
    );
  });

  it('landmarker exposes the three FaceLandmarker confidence options (no `confidence` field)', () => {
    expect(Object.keys(thresholds.landmarker).sort()).toEqual(
      ['minFaceDetectionConfidence', 'minFacePresenceConfidence', 'minTrackingConfidence'].sort(),
    );
  });

  it('qualityGates exposes all four gate tunables (interOcularMinFrac, not MinPx)', () => {
    expect(Object.keys(thresholds.qualityGates).sort()).toEqual(
      ['interOcularMinFrac', 'jitterMaxPct', 'lumaMin', 'poseMaxDeg'].sort(),
    );
    expect(thresholds.qualityGates.interOcularMinFrac).toBe(0.09);
  });

  it('metrics exposes all six metric tunables (incl. gapResetMs)', () => {
    expect(Object.keys(thresholds.metrics).sort()).toEqual(
      [
        'easeOffSustainMs',
        'easeOffThreshold',
        'effortTargetZone',
        'gapResetMs',
        'movementFloorPct',
        'smoothingWindow',
      ].sort(),
    );
    expect(thresholds.metrics.gapResetMs).toBe(250);
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

  it('v1Protocol exposes MODEL_AND_DATA §7 capture tunables', () => {
    expect(Object.keys(thresholds.v1Protocol).sort()).toEqual(
      [
        'minOkFramePct',
        'neutralMs',
        'prepMs',
        'qualityOkRecentMs',
        'smileHoldMs',
        'trials',
        'yawTargetMaxDeg',
        'yawTargetMinDeg',
      ].sort(),
    );
    expect(thresholds.v1Protocol.trials).toBe(2);
    expect(thresholds.v1Protocol.yawTargetMinDeg).toBe(7);
    expect(thresholds.v1Protocol.yawTargetMaxDeg).toBe(13);
    expect(thresholds.v1Protocol.minOkFramePct).toBe(0.7);
  });

  it('is frozen (cannot be mutated at runtime)', () => {
    expect(Object.isFrozen(thresholds)).toBe(true);
  });
});
