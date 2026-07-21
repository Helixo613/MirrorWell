/**
 * Every tunable in MirrorWell. Per docs/API.md §15: a numeric literal used by any
 * service that does not come from this file is a review-blocking defect.
 */
export const thresholds = Object.freeze({
  // FaceLandmarker option thresholds — the only confidence controls that exist.
  // MediaPipe FaceLandmarkerResult has NO per-frame confidence field (AGENTS.md
  // verified fact #1). Owning section: docs/API.md §15.
  landmarker: Object.freeze({
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  }),

  // QualityMonitor gate boundaries. Owning section: docs/API.md §15 / docs/BACKEND.md §1.3.
  // interOcularMinFrac replaces retired interOcularMinPx — distance is a fraction of video
  // width so the same face scale passes at 640×480 and 1280×720.
  // jitterMaxPct is in RMS second-difference / IOD units (motion-compensated).
  qualityGates: Object.freeze({
    lumaMin: 60,
    interOcularMinFrac: 0.09,
    poseMaxDeg: 15,
    jitterMaxPct: 0.005,
  }),

  // Blendshape SI tunables (candidate blendshape-si-v1) — docs/API.md §15 / MODEL_AND_DATA §7.
  // SI is undefined (null) when max per-side blendshape score < activationFloor.
  blendshapes: Object.freeze({
    activationFloor: 0.05,
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
    metricEventMinIntervalMs: 66,
  }),

  // Live V1 protocol harness (dev-only). Owning section: docs/MODEL_AND_DATA.md §7
  // (B1a/B1b/B2/B3 statistical protocol: 2 trials × 6 phases, ≥70% OK, yaw band [7°,13°]).
  v1Protocol: Object.freeze({
    neutralMs: 10_000,
    smileHoldMs: 8_000,
    prepMs: 3_000,
    yawTargetMinDeg: 7,
    yawTargetMaxDeg: 13,
    trials: 2,
    minOkFramePct: 0.7,
    /** Start-protocol enable window: last QUALITY_OK must be within this many ms. */
    qualityOkRecentMs: 2_000,
  }),

  // Dev-only live demo readout band. symmetryBoundary is the SI at or above which the demo
  // reads "even on both sides": it sits in the gap the demo arc names (a real symmetric smile
  // ≈ 0.98; one side deliberately restrained ≈ 0.4–0.7). Tune on real hardware.
  liveDemo: Object.freeze({
    symmetryBoundary: 0.85,
  }),
});

export type Thresholds = typeof thresholds;
