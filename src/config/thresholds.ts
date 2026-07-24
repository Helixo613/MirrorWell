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
    // Seconds added per "+30 s" rest extension (FRONTEND §2.4/§4 — extend only, never shorten;
    // the caller of SessionController.extendRest supplies this amount). DOCS-CHANGE (S1 Task 11):
    // API §15 amended to add session.restExtendSeconds — the pre-remediation frontend read this
    // from thresholds and remediation dropped it, leaving SessionScreen with a bare literal.
    restExtendSeconds: 30,
  }),

  // VoiceCoach pacing. Owning section: docs/FRONTEND.md §2.4.
  feedback: Object.freeze({
    voiceMinGapMs: 2500,
  }),

  // Optional local-only profile text. Owning section: docs/DATABASE.md §3.
  profile: Object.freeze({
    nicknameMaxLength: 30,
    motivationMaxLength: 120,
  }),

  // Caregiver-authored text (SAFETY §5 narrow carve-out). Owning section: docs/DATABASE.md §3.
  caregiver: Object.freeze({
    noteMaxLength: 200,
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

  // --- UI presentation tunables (frontend salvage, Gate 0). API §15 documentation is a
  // Reconvergence task; these are display-only and never touch the metric pipeline. ---
  /** FRONTEND §2.3 — how far back HomeScreen looks for the "last session" line. */
  home: Object.freeze({
    sessionLookbackDays: 7,
    afternoonStartHour: 12,
    eveningStartHour: 18,
    gardenWeeks: 8,
    gardenBloomSessions: 3,
    daysPerWeek: 7,
    sessions10: 10,
    sessions25: 25,
    practiceWeeks4Days: 28,
    gentleReps100: 100,
  }),
  /** FRONTEND §2.5 — plain-language symmetry buckets (no numeric grades). */
  summary: Object.freeze({
    symmetryMostlyEvenMin: 0.85,
    symmetryFairlyEvenMin: 0.7,
    symmetrySomeDifferenceMin: 0.55,
  }),
  /** FRONTEND §2.6 — minimum periods before showing a trend chart. */
  trends: Object.freeze({
    minPeriodsForChart: 2,
  }),
  /** FRONTEND §2.8 — default export date window. */
  export: Object.freeze({
    defaultRangeWeeks: 8,
  }),
  /** FRONTEND §2.9 / §4 — text size control bounds. */
  settings: Object.freeze({
    textScaleMin: 1.0,
    textScaleMax: 2.0,
    textScaleStep: 0.1,
    saveFeedbackDismissMs: 2500,
  }),
});

export type Thresholds = typeof thresholds;
