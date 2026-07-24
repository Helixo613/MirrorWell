import { describe, expect, it } from 'vitest';
import { thresholds } from '../../src/config/thresholds';

// Task 1 acceptance: thresholds.ts exports every named tunable (API.md §15).
// A numeric literal used elsewhere without coming from this file is a review-blocking defect.
describe('thresholds', () => {
  it('exports the full key list from API.md §15', () => {
    expect(Object.keys(thresholds).sort()).toEqual(
      [
        'blendshapes', 'calibration', 'feedback', 'landmarker', 'liveDemo', 'metrics',
        'profile', 'qualityGates', 'reps', 'session', 'v1Protocol',
        // UI presentation tunables (frontend salvage, Gate 0)
        'home', 'summary', 'trends', 'export', 'settings',
        // V3 Task 4: caregiver-authored text limit
        'caregiver',
      ].sort(),
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

  it('blendshapes exposes activationFloor 0.05 (blendshape-si-v1)', () => {
    expect(Object.keys(thresholds.blendshapes)).toEqual(['activationFloor']);
    expect(thresholds.blendshapes.activationFloor).toBe(0.05);
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

  it('session exposes the quality-problem stop-offer and metric-throttle tunables', () => {
    expect(Object.keys(thresholds.session).sort()).toEqual(
      ['holdCountdownTickMs', 'metricEventMinIntervalMs', 'qualityProblemOfferStopMs', 'restExtendSeconds'].sort(),
    );
  });

  it('feedback exposes the VoiceCoach minimum gap', () => {
    expect(Object.keys(thresholds.feedback)).toEqual(['voiceMinGapMs']);
    expect(thresholds.feedback.voiceMinGapMs).toBe(2500);
  });

  it('profile exposes local-only text limits', () => {
    expect(Object.keys(thresholds.profile)).toEqual([
      'nicknameMaxLength',
      'motivationMaxLength',
    ]);
    expect(thresholds.profile.nicknameMaxLength).toBe(30);
    expect(thresholds.profile.motivationMaxLength).toBe(120);
  });

  it('caregiver exposes the encouragement-note length limit', () => {
    expect(Object.keys(thresholds.caregiver)).toEqual(['noteMaxLength']);
    expect(thresholds.caregiver.noteMaxLength).toBe(200);
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

  it('liveDemo exposes the dev-only demo readout band', () => {
    expect(Object.keys(thresholds.liveDemo)).toEqual(['symmetryBoundary']);
    expect(thresholds.liveDemo.symmetryBoundary).toBe(0.85);
  });

  it('exposes the UI presentation namespaces (frontend salvage; API.md §15)', () => {
    expect(Object.keys(thresholds.home)).toEqual([
      'sessionLookbackDays',
      'afternoonStartHour',
      'eveningStartHour',
      'gardenWeeks',
      'gardenBloomSessions',
      'daysPerWeek',
      'sessions10',
      'sessions25',
      'practiceWeeks4Days',
      'gentleReps100',
    ]);
    expect(Object.keys(thresholds.summary).sort()).toEqual(
      ['symmetryFairlyEvenMin', 'symmetryMostlyEvenMin', 'symmetrySomeDifferenceMin'].sort(),
    );
    expect(Object.keys(thresholds.trends)).toEqual(['minPeriodsForChart']);
    expect(Object.keys(thresholds.export)).toEqual(['defaultRangeWeeks']);
    expect(Object.keys(thresholds.settings).sort()).toEqual(
      ['saveFeedbackDismissMs', 'textScaleMax', 'textScaleMin', 'textScaleStep'].sort(),
    );
  });

  it('is frozen (cannot be mutated at runtime)', () => {
    expect(Object.isFrozen(thresholds)).toBe(true);
  });
});
