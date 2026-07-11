/** API.md §15 — every tunable; comments name owning doc section. */
export const thresholds = Object.freeze({
  /** FaceLandmarker option thresholds — API.md §5 */
  landmarker: {
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  },
  /** BACKEND §1.3 / ARCHITECTURE §7 quality gates */
  qualityGates: {
    lumaMin: 60,
    interOcularMinPx: 60,
    poseMaxDeg: 15,
    jitterMaxPct: 0.005,
  },
  /** ARCHITECTURE §7 metric math */
  metrics: {
    movementFloorPct: 0.008,
    effortTargetZone: [0.3, 0.5] as const,
    easeOffThreshold: 0.6,
    easeOffSustainMs: 300,
    smoothingWindow: 5,
  },
  /** ARCHITECTURE §7 rep detection */
  reps: {
    startThreshold: 0.15,
    endThreshold: 0.1,
    minDurationMs: 800,
    minQualityFramePct: 0.6,
  },
  /** ARCHITECTURE §4 calibration protocol */
  calibration: {
    minQualityScore: 0.7,
    neutralCaptures: 3,
    captureSeconds: 3,
    comfortableMaxReps: 3,
    driftMaxPct: 0.08,
    staleDays: 14,
  },
  /** SessionController quality offer-stop — API.md §15 */
  session: {
    qualityProblemOfferStopMs: 30_000,
    restExtendSeconds: 30,
    metricEmitHz: 15,
    guideRepDurationMs: 2_000,
    repHapticMs: 30,
  },
  /** FRONTEND §2.3 — last-session lookback on HomeScreen */
  home: {
    sessionLookbackDays: 7,
  },
  /** FRONTEND §2.5 — plain-language symmetry buckets (no numeric grades) */
  summary: {
    symmetryMostlyEvenMin: 0.85,
    symmetryFairlyEvenMin: 0.7,
    symmetrySomeDifferenceMin: 0.55,
  },
  /** FRONTEND §2.6 — minimum periods before showing a trend chart */
  trends: {
    minPeriodsForChart: 2,
  },
  /** FRONTEND §2.8 — default export date window */
  export: {
    defaultRangeWeeks: 8,
  },
  /** FRONTEND §2.9 / §4 — text size control bounds */
  settings: {
    textScaleMin: 1.0,
    textScaleMax: 2.0,
    textScaleStep: 0.1,
    saveFeedbackDismissMs: 2500,
  },
});
