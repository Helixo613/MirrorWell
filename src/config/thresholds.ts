/**
 * Every tunable in MirrorWell. Per docs/API.md §15: a numeric literal used by any
 * service that does not come from this file is a review-blocking defect.
 */
export const thresholds = Object.freeze({
  // FaceLandmarker option thresholds — the only confidence controls that exist.
  // MediaPipe FaceLandmarkerResult has NO per-frame confidence field (docs/AGENTS.md
  // verified fact #1). Owning section: docs/API.md §15.
  landmarker: Object.freeze({
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  }),

  // QualityMonitor gate boundaries. Owning section: docs/API.md §15 / docs/BACKEND.md §1.3.
  qualityGates: Object.freeze({
    lumaMin: 60,
    interOcularMinPx: 60,
    poseMaxDeg: 15,
    jitterMaxPct: 0.005,
  }),

  // MetricEngine tunables (movement floor, effort zone, ease-off, gap). Owning section:
  // docs/API.md §15 / docs/BACKEND.md (MetricEngine).
  metrics: Object.freeze({
    movementFloorPct: 0.008,
    effortTargetZone: Object.freeze([0.3, 0.5] as const),
    easeOffThreshold: 0.6,
    easeOffSustainMs: 300,
    smoothingWindow: 5,
    gapResetMs: 250,
  }),

  // RepDetector tunables. Owning section: docs/API.md §15 / docs/BACKEND.md (RepDetector).
  reps: Object.freeze({
    startThreshold: 0.15,
    endThreshold: 0.1,
    minDurationMs: 800,
    minQualityFramePct: 0.6,
  }),

  // CalibrationFlow tunables. Owning section: docs/API.md §15 / docs/BACKEND.md (CalibrationFlow).
  calibration: Object.freeze({
    minQualityScore: 0.7,
    neutralCaptures: 3,
    captureSeconds: 3,
    driftMaxPct: 0.08,
    staleDays: 14,
  }),

  // SessionController tunables. Owning section: docs/API.md §15 / docs/BACKEND.md (SessionController).
  session: Object.freeze({
    qualityProblemOfferStopMs: 30000,
  }),
});

export type Thresholds = typeof thresholds;
