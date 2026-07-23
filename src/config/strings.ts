/**
 * Every user-facing string in MirrorWell lives here (English-only; audited per
 * docs/SAFETY_AND_COMPLIANCE.md §8). Populated task by task — never inline UI copy.
 */
export const strings = Object.freeze({
  // ExportService (docs/API.md §13). Exact wording verified against SAFETY_AND_COMPLIANCE.md
  // §8 (approved register only: symmetry/movement/calibration; no diagnosis, severity grade,
  // or recovery prediction) — copied verbatim from API.md §13's full example payload.
  exportSummary: Object.freeze({
    nonDiagnosticNotice:
      "MirrorWell is an exercise-support tool. This summary describes exercise activity and movement symmetry relative to the user's own calibration. It is not a clinical assessment, score, or measure of recovery.",
    // Printable HTML export copy (export.ts renderHtml) — relocated verbatim, §8-audited.
    htmlTitle: 'MirrorWell summary',
    rangeLabel: 'Range:',
    affectedSideLabel: 'Affected side:',
    noiseFloorLabel: 'Noise floor (symmetry):',
    completionRateLabel: 'Completion rate:',
    trendsHeading: 'Trends',
    exerciseColumn: 'Exercise',
    granularityColumn: 'Granularity',
    pointsColumn: 'Points',
    latestColumn: 'Latest',
    directionColumn: 'Direction',
    sessionsHeading: 'Sessions',
    startedColumn: 'Started',
    endedColumn: 'Ended',
    endReasonColumn: 'End reason',
  }),
  v1Harness: Object.freeze({
    title: 'Live V1 protocol harness',
    intro:
      'Two trials of six phases. Hold one gentle half-smile across smile, yaw, dim light, and distance. Neutral is relaxed only. Quality must stay OK; yaw target is about 10° (measured 7–13°).',
    startCamera: 'Start camera',
    stopCamera: 'Stop camera',
    startProtocol: 'Start protocol',
    startDisabledHint: 'Start is available after quality is OK',
    beginRecording: 'Begin recording',
    acceptPhase: 'Accept phase',
    retryPhase: 'Retry phase',
    nextTrial: 'Continue to next trial',
    downloadJson: 'Download JSON',
    downloadCsv: 'Download CSV',
    resetProtocol: 'Reset protocol',
    diagnosticsToggle: 'Diagnostics (raw decimals)',
    cameraNotReady: 'Camera not started',
    qualityLabel: 'Quality',
    fpsLabel: 'fps',
    trialLabel: 'Trial',
    phaseLabel: 'Phase',
    statusLabel: 'Status',
    secondsLeftLabel: 'Seconds left',
    validFramesLabel: 'Valid frames',
    okPercentLabel: 'OK percent',
    yawLabel: 'Yaw',
    pitchLabel: 'Pitch',
    rollLabel: 'Roll',
    yawBandLabel: 'Yaw target band',
    movementLabel: 'Movement',
    movementDetected: 'detected',
    movementNotDetected: 'not detected',
    siLabel: 'SI',
    displacementLabel: 'Mouth max |Δ|',
    livePoseLabel: 'Live pose (deg)',
    phaseStatusSetup: 'Setup — confirm camera and quality, then start the protocol',
    phaseStatusPrepare: 'Prepare — read the instruction, then begin recording',
    phaseStatusRecording: 'Recording samples for this phase',
    phaseStatusReview: 'Review — accept this phase or retry it',
    phaseStatusReport: 'Report — protocol complete; export results',
    captureValid: 'Capture valid',
    captureInvalid: 'Capture invalid — retry this phase',
    invalidLowOkPct: 'Too few QUALITY_OK frames (need ≥70%)',
    invalidYawBand: 'Measured mean |yaw| outside 7–13° band',
    measurementFail: 'Measurement bar failed (see report)',
    acceptedPhasesLabel: 'Accepted this trial',
    noneAccepted: 'none yet',
    reportTitle: 'Protocol report',
    reportTrialHeading: 'Trial summary',
    exportStarted: 'Export download started.',
    clipAutoSaveNote:
      'Accepting downloads this phase’s master clip — move it into tests/fixtures/masters/.',
    clipUnavailable:
      'Video recording is unavailable in this browser — record master clips externally.',
    errorPrefix: 'Error',
    qualityFixLowLight: 'Add light',
    qualityFixTooFar: 'Come closer',
    qualityFixPose: 'Face the camera more straight (within pose gate)',
    qualityFixFaceLost: 'Center your face',
    qualityFixLowConfidence: 'Hold still',
    qualityOk: 'OK',
    phaseNeutralTitle: '1 — Neutral',
    phaseNeutralInstruction:
      'Face the camera. Relax completely. Good light. About arm’s length. Hold still.',
    phaseFrontalSmileTitle: '2 — Frontal gentle smile',
    phaseFrontalSmileInstruction:
      'Make a small half-smile and freeze it. Same light and distance as neutral. Do not talk.',
    phaseLeftYawTitle: '3 — Smile, left yaw ~10°',
    phaseLeftYawInstruction:
      'Keep the same frozen half-smile. Turn head left about 10° (not more). Stay QUALITY_OK.',
    phaseRightYawTitle: '4 — Smile, right yaw ~10°',
    phaseRightYawInstruction:
      'Keep the same frozen half-smile. Turn head right about 10° (not more). Stay QUALITY_OK.',
    phaseDimLightTitle: '5 — Same smile, dim light',
    phaseDimLightInstruction:
      'Keep the exact same half-smile frozen. Dim the room carefully so quality can stay OK.',
    phaseDistance2mTitle: '6 — Same smile, ~2 m',
    phaseDistance2mInstruction:
      'Restore light. Step back about 2 m. Keep the same frozen half-smile, face the camera.',
    durationLabel: 'Duration',
    prepWindowLabel: 'Prep window',
    secondsUnit: 's',
    yawInBand: 'in band',
    yawOutOfBand: 'out of band',
    trial1Short: 'T1',
    trial2Short: 'T2',
    floorLabel: 'floor',
  }),
  // Dev-only live demo view (src/dev/LiveDemoView.tsx). §8-audited: symmetry/movement/gentle
  // register only; no diagnosis, severity, normal/abnormal, prediction, or pressure language.
  liveDemo: Object.freeze({
    title: 'Live symmetry demo',
    intro:
      'A live readout of movement symmetry for the gentle smile. Nothing is recorded or saved. Quick setup measures your own neutral and one gentle hold first.',
    startCamera: 'Start camera',
    stopCamera: 'Stop camera',
    captureNeutral: 'Step 1 — capture neutral',
    captureHold: 'Step 2 — capture gentle hold',
    restartSetup: 'Redo quick setup',
    neutralInstruction: 'Face the camera and relax completely. Hold still.',
    holdInstruction: 'Let a small, gentle smile come and hold it steady.',
    capturing: 'Capturing…',
    setupReadyLabel: 'Quick setup',
    setupReady: 'ready',
    setupPending: 'not done yet',
    setupTooShort: 'The hold was too short or too still to measure. Redo the quick setup.',
    noNeutralFrames: 'No clear frames in the neutral capture. Adjust light or framing and retry.',
    symmetryLabel: 'Symmetry index',
    leftLabel: 'Left activation',
    rightLabel: 'Right activation',
    qualityLabel: 'Quality',
    noiseFloorLabel: 'Measured noise floor',
    stateLabel: 'State',
    stateSymmetric: 'Even on both sides',
    stateAsymmetric: 'Uneven between sides',
    stateNoReading: 'No reading',
    glyphSymmetric: '=',
    glyphAsymmetric: '≠',
    glyphNoReading: '—',
    noReading: 'no reading',
    errorPrefix: 'Error',
  }),
  app: {
    name: 'MirrorWell',
    loading: 'Loading…',
  },
  onboarding: {
    stepIndicator: (current: number, total: number) =>
      `Step ${current} of ${total}`,
    progressLabel: 'Onboarding progress',
    safetyRegionLabel: 'Important safety information',
    actions: {
      continue: 'Continue',
      back: 'Back',
      backAriaLabel: 'Go to previous step',
      startCalibration: 'Start calibration',
      tryDemo: 'Try a demo',
      saving: 'Saving…',
    },
    helpers: {
      attestationIncomplete:
        'Check all four boxes above to continue.',
      exercisesRequired: 'Select at least one assigned exercise to continue.',
    },
    nickname: {
      label: '1. What should we call you?',
      placeholder: 'Your first name or nickname',
      hint: 'Optional. Shown in your greeting on Home. Stays on this device.',
    },
    motivation: {
      label: '2. What makes this worth it for you?',
      placeholder: 'e.g. Feeling more like myself again',
      hint: 'Optional. Your “why” — shown on Home and between exercises. Never exported.',
    },
    steps: {
      aboutYou: {
        title: 'A little about you',
        subtitle:
          'Two optional questions — scroll if you need to. Skip anytime with Continue.',
      },
      intendedUse: {
        title: 'Exercise support for facial retraining',
        goodToKnowTitle: 'Good to know',
        body: [
          'MirrorWell helps you practice facial exercises your clinician assigned. It shows movement symmetry and effort in real time while you move at your own pace.',
          'It does not diagnose, grade, treat, or predict any medical condition. Its regulatory status is not determined, and it is not cleared or approved by any regulator.',
          'If the app and your clinician ever disagree, your clinician wins.',
        ],
        limitations: [
          'Camera measurement is approximate — lighting, distance, and glasses affect it.',
          'It measures visible movement only, relative to your own calibration.',
          'It may say it cannot measure right now rather than guess.',
        ],
      },
      redFlag: {
        title: 'Know when to seek care',
        emergency:
          'New or sudden facial droop can be a sign of a stroke or other emergency. If it is new, call your local emergency number immediately — do not use this app to check it.',
        body: [
          'Stop and contact your clinician if you have new or worsening weakness, pain, twitching, or spasms.',
          'Do not use this app for undiagnosed facial weakness — see a doctor first.',
        ],
        continueLabel: 'I understand',
      },
      localProcessing: {
        title: 'Your face stays on this device',
        body: [
          'While you use MirrorWell, your camera images are processed in memory on this device only. They are never stored or sent anywhere.',
          'Only derived numbers about movement are saved locally, on this device only.',
          'Nothing is uploaded, shared, or sold — there is no server.',
        ],
      },
      attestation: {
        title: 'Before you begin',
        subtitle: 'Please confirm all of the following:',
        items: {
          diagnosed:
            'A clinician has diagnosed my facial condition.',
          clinicianAssigned:
            'A clinician has assigned me facial exercises and said home practice is appropriate.',
          age18Plus: 'I am 18 or older.',
          understandsScope:
            'I understand MirrorWell does not diagnose, grade, or treat anything.',
        },
      },
      exercises: {
        title: 'Your assigned exercises',
        subtitle:
          'Select only the exercises your therapist assigned. You can change this later in settings.',
      },
    },
    demo: {
      enabled: import.meta.env.VITE_DEMO_MODE_ENABLED !== 'false',
    },
  },
  errors: {
    DB_UNAVAILABLE: {
      title: 'Cannot save progress here',
      body: 'This browser mode cannot store your exercise data. You can still try a demo, or use a normal browser window with storage enabled.',
    },
    VALIDATION_FAILED: {
      title: 'Something went wrong',
      body: 'Please go back and try again. If this keeps happening, restart the app.',
    },
    MODEL_LOAD_FAILED: {
      title: 'Camera setup could not start',
      body: 'The face-tracking model did not load. Make sure model files are in place, then tap Try again.',
    },
    CAMERA_DENIED: {
      title: 'Camera access is needed',
      body: 'MirrorWell needs your camera to measure movement. Allow camera access in your browser settings, then tap Try again.',
    },
    CAMERA_UNAVAILABLE: {
      title: 'Camera is not available',
      body: 'No camera was found, or another app may be using it. Close other camera apps and tap Try again.',
    },
    QUALITY_TOO_LOW: {
      title: 'That capture did not meet quality',
      body: 'Try again with more light, a steady position, and your face centered. There is no rush.',
    },
    // API §16: NO_BASELINE and RECALIBRATION_REQUIRED both route to CalibrationScreen. Without
    // their own copy they fell back to the VALIDATION_FAILED "something went wrong" text, which
    // tells an attested-but-uncalibrated user nothing about what to do (S3-REQ-4).
    NO_BASELINE: {
      title: 'Calibration comes first',
      body: 'MirrorWell measures movement against your own calibration, so we need to capture that before this can work. It takes about a minute.',
    },
    RECALIBRATION_REQUIRED: {
      title: 'Time to calibrate again',
      body: 'Your camera setup has shifted since last time. A fresh calibration keeps your measurements comparable.',
    },
  },
  quality: {
    QUALITY_OK: '',
    LOW_LIGHT: 'More light needed',
    FACE_LOST: "I can't see you — adjust the camera",
    TOO_FAR: 'Come a little closer',
    POSE_OUT_OF_RANGE: 'Face the camera straight on',
    LOW_CONFIDENCE: 'Hold steady for a moment',
  },
  calibration: {
    loading: 'Warming up the camera — about 3 seconds',
    journey: {
      progressLabel: 'Calibration progress',
      labels: ['Relax your face', 'Gentle movements', 'Quiet moment'] as const,
    },
    phaseAnnouncement: {
      neutral: (current: number, total: number) =>
        `Relax your face. Neutral capture ${current} of ${total}.`,
      comfortableMax: (exercise: string, current: number, total: number) =>
        `${exercise}. Gentle rep ${current} of ${total}.`,
      noiseFloor: 'One more quiet moment. Relax your face.',
      complete: 'Calibration complete.',
      saving: 'Saving your calibration.',
    },
    helpers: {
      captureRemaining: (seconds: number) =>
        `${seconds} seconds remaining — hold still`,
      qualityNotReady: 'Adjust your position until the banner clears, then tap Capture.',
      capturing: 'Capturing…',
    },
    neutral: {
      title: 'Relax your face',
      instruction:
        'Sit comfortably and relax your face, like you are daydreaming. Tap Capture when you are ready.',
      captureLabel: 'Capture',
      redoLabel: 'Redo this capture',
      captureProgress: (current: number, total: number) =>
        `Neutral capture ${current} of ${total}`,
    },
    comfortableMax: {
      instruction:
        'Gentle — do not strain. Make a small, slow movement, then relax.',
      captureLabel: 'Capture rep',
      redoLabel: 'Redo this rep',
      repProgress: (current: number, total: number) =>
        `Gentle rep ${current} of ${total}`,
    },
    noiseFloor: {
      title: 'One more quiet moment',
      instruction:
        'Relax your face again for a few seconds. This helps us tell real change from small natural wobble.',
    },
    saving: 'Saving your calibration…',
    complete: 'Calibration complete',
    actions: {
      tryAgain: 'Try again',
      continue: 'Continue to home',
      skipUnavailable: 'Go back',
      notNow: 'Not now',
      notNowAriaLabel: 'Leave calibration and return home',
    },
    errors: {
      notAttested: 'Please complete onboarding before calibrating.',
    },
  },
  home: {
    title: 'MirrorWell',
    subtitle: 'Your exercises, at your pace.',
    greeting: {
      morning: 'Good morning',
      afternoon: 'Good afternoon',
      evening: 'Good evening',
    },
    startExercises: 'Start my exercises',
    startExercisesAriaLabel: 'Start your assigned exercises',
    loading: 'Loading your home screen…',
    empty: {
      title: 'Ready when you are',
      body: 'Whenever you feel up to it, tap below to begin. There is no schedule, no rush, and nothing to catch up on.',
    },
    lastSession: {
      label: 'Last session',
      allExercisesDone: (weekday: string) =>
        `${weekday} — all exercises done`,
      sessionCompleted: (weekday: string) => `${weekday} — session completed`,
      stoppedEarly: (weekday: string) =>
        `${weekday} — you stopped when you needed to`,
      stoppedForSafety: (weekday: string) =>
        `${weekday} — session ended for your safety`,
      qualityEnded: (weekday: string) =>
        `${weekday} — session paused when conditions were difficult`,
    },
    recalibration: {
      title: 'Time for a quick refresh',
      body: 'It has been a couple of weeks since your last calibration. A fresh baseline helps measurements stay accurate.',
      action: 'Recalibrate',
      actionAriaLabel: 'Go to calibration to refresh your baseline',
    },
    nav: {
      label: 'More options',
      trends: 'Trends',
      trendsAriaLabel: 'View exercise trends over time',
      export: 'Export',
      exportAriaLabel: 'Export a summary for your care team',
      settings: 'Settings',
      settingsAriaLabel: 'Open settings',
      caregiver: 'Caregiver view',
      caregiverAriaLabel: 'Open read-only caregiver view',
    },
  },
  session: {
    loading: 'Warming up the camera — about 3 seconds',
    screenTitle: 'Exercise session',
    demoWatermark: 'DEMO — not for exercise use',
    quickSetup: {
      title: 'Quick setup',
      body: 'Relax your face for a few seconds, then one gentle smile. This stays on your device only.',
      action: 'Start quick setup',
      running: 'Setting up…',
      // Live phase prompts shown WHILE capturing (preview stays visible) — the user cannot time
      // the gentle rep without being told when the second window starts (FRONTEND §2.4).
      phaseNeutral: 'Relax your face and look at the camera…',
      phaseGentle: 'Now — one gentle smile, about half of what feels possible.',
    },
    // Arrival moment (real sessions only, FRONTEND §2.4): shown once start() resolves and before
    // the first exercise, camera already live behind it — never auto-dismisses (FRONTEND §4 no
    // time pressure), user taps Begin when ready.
    arrival: {
      message: "Take a slow breath… we'll begin when you're ready.",
      begin: 'Begin',
      beginAriaLabel: 'Begin the exercise session',
      stop: 'Stop',
      stopAriaLabel: 'Stop and leave this session',
    },
    demo: {
      ready: "I'm ready",
      readyAriaLabel: 'Begin exercise reps',
    },
    repCounter: (done: number, total: number) => `${done} of ${total}`,
    repCounterLabel: 'Rep progress',
    easeOff: 'Ease off — stay gentle',
    // Live coaching line over the preview, driven by the SAME smoothed effortIndex the rep
    // counter runs on (sessionHelpers.coachPhaseFor) — the meter shows where you are, this
    // says what to do. Suppressed while quality/ease-off messages own the screen (FRONTEND §2.4).
    coach: {
      raise: 'Raise gently into the green band',
      hold: 'Lovely — hold it gently',
      easeBack: 'A little less — settle back toward the band',
      legend: 'The green band is your gentle target: rise into it, hold, then relax to count a rep.',
    },
    rest: {
      title: 'Rest',
      remaining: (seconds: number) => `${seconds} seconds left`,
      motivation: (motivation: string) => `Remember your why: ${motivation}`,
      extend: '+30 s',
      extendAriaLabel: 'Add thirty seconds of rest',
      skip: 'Continue',
      skipAriaLabel: 'Continue to next exercise',
    },
    stop: {
      label: 'Stop',
      ariaLabel: 'Stop session',
      dialogTitle: 'Stop for now?',
      dialogBody: 'Was anything wrong during this session?',
      justStop: 'I just needed to stop',
      justStopAriaLabel: 'Stop session without reporting a problem',
      feltWrong: 'I felt pain or something felt wrong',
      feltWrongAriaLabel: 'Stop session and view safety guidance',
      cancel: 'Keep going',
      cancelAriaLabel: 'Return to session',
    },
    redFlag: {
      title: 'Pause and check in',
      body: [
        'Stop your exercises for now and contact your clinician to describe what happened.',
        'If you have severe or sudden symptoms — including new facial droop — seek urgent care.',
      ],
      done: 'Done',
      doneAriaLabel: 'Return to home',
    },
    qualityOffer: {
      title: 'Conditions are not great right now',
      body: 'You can keep going or end this session and try again later.',
      continue: 'Keep going',
      end: 'End session',
    },
    repDiscarded: "That one didn't count — the light dipped. No worries.",
    paused: {
      title: 'Paused',
      body: 'Ready to continue when you are.',
      resume: 'Continue',
      resumeAriaLabel: 'Resume the session',
      resuming: 'Starting the camera…',
    },
    errorBack: 'Back to home',
    errorBackAriaLabel: 'Leave the session and return to home',
    errorCalibrate: 'Go to calibration',
    errorCalibrateAriaLabel: 'Leave the session and start calibration',
    a11y: {
      repCompleted: (done: number, total: number) =>
        `Rep ${done} of ${total} complete`,
      easeOffActive: 'Ease off — stay gentle',
    },
    errors: {
      // noBaseline removed: strings.errors.NO_BASELINE (added with the shared error copy) is what
      // applyStartError now renders, so this key was unreachable.
      notAttested: 'Please complete onboarding first.',
    },
  },
  summary: {
    title: 'Session complete',
    done: 'Done',
    doneAriaLabel: 'Return to home',
    demoDone: 'Back to onboarding',
    demoDoneAriaLabel: 'Return to onboarding',
    repsDone: (count: number) => `${count} reps completed`,
    celebration: {
      label: 'Gentle practice',
      allGentle: 'Every single rep gentle. Perfect restraint.',
      someGentle: (gentle: number, total: number) =>
        `You kept it gentle ${gentle} of ${total} times — that's exactly the skill.`,
    },
    qualityNote: 'This is a single-session snapshot of movement.',
    demoWatermark: 'DEMO — not for exercise use',
    symmetry: {
      label: 'Movement symmetry',
      noMovement: 'Minimal movement recorded',
      mostlyEven: 'Mostly even',
      fairlyEven: 'Fairly even',
      someDifference: 'Some difference between sides',
      moreOnOneSide: 'More movement on one side',
      barAriaLabel: (plain: string) => `Movement symmetry: ${plain}`,
    },
    exerciseListLabel: 'Exercises from this session',
    emptyResults: 'This session ended early, so there is nothing to show.',
    a11y: {
      announcement: 'Session complete.',
      exerciseLine: (name: string, reps: number, symmetry: string) =>
        `${name}: ${reps} reps, ${symmetry}.`,
    },
  },
  trends: {
    title: 'Trends',
    subtitle: 'Your practice over time',
    loading: 'Loading trends…',
    empty: {
      title: 'Not enough practice yet',
      body: 'Trends appear after a couple of weeks of practice.',
    },
    exerciseSelectorLabel: 'Exercise',
    granularity: {
      label: 'Time range',
      weekly: 'Weekly',
      monthly: 'Monthly',
      weeklyAriaLabel: 'Show weekly trends',
      monthlyAriaLabel: 'Show monthly trends',
    },
    steadyPill: 'Steady',
    steadyPillForPeriod: (period: string) => `${period}: steady`,
    // Recent-direction words for the printable export's enriched trend rows (export.ts
    // renderHtml). Rendered conditionally, so — unlike the exportSummary column headers — they
    // need not appear in every export; sub-noise-floor reads "Steady" (never up/down).
    direction: {
      steady: 'Steady',
      moreEven: 'More even',
      lessEven: 'Less even',
    },
    caption: {
      holdingSteady: (exercise: string) =>
        `Your ${exercise} has been holding steady.`,
      gettingMoreEven: (exercise: string, rangeLabel: string) =>
        `Your ${exercise} has been getting more even over ${rangeLabel}.`,
      stillCollecting: (exercise: string) =>
        `Your ${exercise} practice is still building — check back after a few more sessions.`,
    },
    rangeLabel: {
      twoMonths: 'the last two months',
      fewWeeks: 'the last few weeks',
    },
    chart: {
      ariaLabel: (exercise: string) => `Symmetry trend for ${exercise}`,
    },
    table: {
      toggleShow: 'View as table',
      toggleHide: 'View as chart',
      toggleShowAriaLabel: 'Show trend data as a table for screen readers',
      toggleHideAriaLabel: 'Show trend data as a chart',
      caption: 'Symmetry trend data',
      period: 'Period',
      symmetry: 'Average symmetry',
      sessions: 'Sessions',
      change: 'Change',
      steady: 'Steady',
      noticeable: 'Noticeable change',
    },
    nav: {
      back: 'Back to home',
      backAriaLabel: 'Return to home',
    },
    refreshing: 'Updating trends…',
    a11y: {
      announcement: (exercise: string, caption: string) =>
        `Trends for ${exercise}. ${caption}`,
      steadyPeriodsLabel: 'Periods within measurement noise',
      viewModeChart: 'Showing trend as chart',
      viewModeTable: 'Showing trend data as table',
    },
  },
  export: {
    title: 'Export',
    subtitle: 'Share a summary with your care team',
    loading: 'Loading export…',
    generating: 'Preparing your summary…',
    scopeNoticeHeading: 'About this summary',
    nonDiagnosticNotice:
      "MirrorWell is an exercise-support tool. This summary describes exercise activity and movement symmetry relative to the user's own calibration. It is not a clinical assessment, score, or measure of recovery.",
    dateRange: {
      label: 'Date range',
      from: 'From',
      to: 'To',
      fromAriaLabel: 'Export start date',
      toAriaLabel: 'Export end date',
    },
    included: {
      heading: "What's in this file",
      items: [
        'Practice sessions in your chosen date range',
        'Symmetry trends for each assigned exercise',
        'How often you practiced and session completion',
        'Measurement quality indicators your clinician can review',
      ] as const,
    },
    generate: 'Generate summary',
    generateAriaLabel: 'Generate clinician summary for the selected date range',
    empty: {
      title: 'Nothing to export for these dates',
      body: 'Try a wider date range, or finish a few practice sessions first.',
    },
    success: {
      heading: 'Your summary is ready',
      previewAriaLabel: 'Summary preview',
      previewSessions: (count: number) =>
        count === 1 ? '1 practice session' : `${count} practice sessions`,
      previewRange: (from: string, to: string) => `${from} to ${to}`,
      previewCompletion: (pct: number) => `${pct}% of sessions completed`,
      previewExercises: (count: number) =>
        count === 1 ? '1 exercise tracked' : `${count} exercises tracked`,
      announcement: (
        sessionCount: number,
        from: string,
        to: string,
        completionPct: number,
      ) =>
        `Summary ready. ${sessionCount} practice sessions from ${from} to ${to}. ${completionPct} percent completed.`,
      jsonTitle: 'Detailed data file',
      jsonDescription: 'For clinical records systems that accept structured data',
      jsonDownload: 'Download data file',
      jsonDownloadAriaLabel: 'Download detailed data file for your care team',
      htmlTitle: 'Printable summary',
      htmlDescription: 'A one-page overview you can print or save as PDF',
      htmlDownload: 'Download printable summary',
      htmlDownloadAriaLabel: 'Download printable summary for your care team',
    },
    advisory: 'Share this file only with your care team.',
    filename: (dateYmd: string) => `mirrorwell-summary-${dateYmd}`,
    nav: {
      back: 'Back to home',
      backAriaLabel: 'Return to home',
    },
  },
  caregiver: {
    title: 'Your practice summary',
    subtitle: 'A read-only view for someone who supports your practice',
    banner: 'Read-only view — your practice stays on this device',
    loading: 'Gathering your practice summary…',
    empty: {
      title: 'Your practice will appear here',
      body: 'After a few sessions, you’ll see your practice gathered here.',
    },
    adherence: {
      heading: 'Your steady practice',
      completionRate: (_pct: number) => 'Sessions completed with care',
      sessionsPerWeek: (counts: string) => `Sessions across recent weeks: ${counts}`,
    },
    trendsHeading: 'Your practice over time',
    lastSessionHeading: 'Your latest session',
    measurementQuality: {
      heading: 'Clear practice moments',
      value: (_pct: number) => 'Clear moments were captured across recent sessions.',
      unavailable: 'Clear moments will appear after a few sessions.',
    },
    exportLink: 'Open the full summary',
    exportLinkAriaLabel: 'Open the full summary to share with your care team',
    nav: {
      back: 'Back to home',
      backAriaLabel: 'Return to home',
    },
    a11y: {
      announcement: 'Your practice summary is ready.',
    },
  },
  settings: {
    title: 'Settings',
    subtitle: 'Choose what feels comfortable',
    loading: 'Loading settings…',
    saving: 'Saving…',
    saved: (label: string) => `Saved · ${label}`,
    savedAnnouncement: (label: string) => `${label} updated`,
    sections: {
      profile: 'Your profile',
      display: 'Display',
      cues: 'Cues',
      displayAndCues: 'Display & cues',
      trends: 'Trends',
      sharing: 'Sharing',
      trendsAndSharing: 'Trends & sharing',
      calibration: 'Calibration',
      danger: 'Danger zone',
    },
    profile: {
      nicknameLabel: 'What should we call you? (optional)',
      nicknameHint: 'Shown on Home. Stays on this device; never exported.',
      motivationLabel: 'What makes this worth it for you? (optional)',
      motivationHint: 'Shown on Home and between exercises. Stays on this device; never exported.',
      save: 'Save profile',
      saved: 'Profile saved',
    },
    display: {
      highContrast: {
        label: 'High contrast',
        description: 'Stronger colors for the symmetry bar and charts',
      },
      textScale: {
        label: 'Text size',
        value: (pct: number) => `${pct}%`,
        decrease: 'Smaller text',
        decreaseAriaLabel: 'Decrease text size by ten percent',
        increase: 'Larger text',
        increaseAriaLabel: 'Increase text size by ten percent',
        sliderAriaLabel: 'Text size',
      },
      reducedFacePreview: {
        label: 'Show me less of my face',
        description: 'Dims the camera preview during exercises',
      },
      showAffectedSideMarker: {
        label: 'Focus side marker',
        description: 'Shows which side to pay attention to during exercises',
      },
    },
    cues: {
      haptics: {
        label: 'Vibration cues',
        description: 'Gentle pulses on rep completion (Android only)',
      },
      audio: {
        label: 'Sound cues',
        description: 'Soft tones for reps and quality reminders',
      },
    },
    trends: {
      granularityLabel: 'Trend time range',
      weekly: 'Weekly',
      monthly: 'Monthly',
      weeklyAriaLabel: 'Show weekly trends by default',
      monthlyAriaLabel: 'Show monthly trends by default',
    },
    sharing: {
      caregiver: {
        label: 'Caregiver view',
        description:
          'Lets a trusted person see practice summaries on this device — read only, nothing is shared online',
      },
    },
    calibration: {
      navLabel: 'Calibration',
      recalibrate: 'Recalibrate now',
      recalibrateAriaLabel: 'Open calibration to capture a new baseline',
      description: 'Update your neutral face reference if lighting or posture has changed',
    },
    delete: {
      trigger: 'Delete everything',
      triggerAriaLabel: 'Delete all data stored on this device',
      dialogTitle: 'Delete all data?',
      dialogBody:
        'This removes all practice history, calibration, and settings from this device. This cannot be undone.',
      confirmLabel: 'Type DELETE to confirm',
      confirmPlaceholder: 'DELETE',
      confirmToken: 'DELETE',
      confirmButton: 'Delete everything',
      confirmButtonAriaLabel: 'Permanently delete all data on this device',
      cancel: 'Cancel',
      cancelAriaLabel: 'Cancel deletion',
      deleting: 'Deleting all data…',
      doneAnnouncement: 'All data deleted.',
    },
    nav: {
      back: 'Back to home',
      backAriaLabel: 'Return to home',
    },
    a11y: {
      updateFailed: 'Could not save that setting. Please try again.',
    },
  },
  placeholders: {
    trends: {
      title: 'Trends',
      body: 'Long-term progress charts are coming next.',
    },
    export: {
      title: 'Export',
      body: 'Clinician summary export is coming next.',
    },
    settings: {
      title: 'Settings',
      body: 'Accessibility and app settings are coming next.',
    },
    caregiver: {
      title: 'Caregiver view',
      body: 'Read-only caregiver summary is coming next.',
    },
    calibration: {
      title: 'Calibration',
      body: 'Guided calibration is coming next.',
    },
    session: {
      title: 'Session',
      body: 'The live exercise session is coming next.',
    },
    backToHome: 'Back to home',
  },
});

export type Strings = typeof strings;
export type OnboardingStrings = typeof strings.onboarding;
