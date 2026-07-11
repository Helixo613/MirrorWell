export const strings = {
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
    steps: {
      intendedUse: {
        title: 'Exercise support for facial retraining',
        goodToKnowTitle: 'Good to know',
        body: [
          'MirrorWell helps you practice facial exercises your clinician assigned. It shows movement symmetry and effort in real time while you move at your own pace.',
          'It does not diagnose, grade, treat, or predict any medical condition. It is not a medical device.',
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
    },
    errors: {
      notAttested: 'Please complete onboarding before calibrating.',
    },
  },
  home: {
    title: 'MirrorWell',
    subtitle: 'Your exercises, at your pace.',
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
    demoWatermark: 'DEMO — not for exercise use',
    quickSetup: {
      title: 'Quick setup',
      body: 'Relax your face for a few seconds, then one gentle smile. This stays on your device only.',
      action: 'Start quick setup',
      running: 'Setting up…',
    },
    demo: {
      ready: "I'm ready",
      readyAriaLabel: 'Begin exercise reps',
    },
    repCounter: (done: number, total: number) => `${done} of ${total}`,
    repCounterLabel: 'Rep progress',
    easeOff: 'Ease off — stay gentle',
    rest: {
      title: 'Rest',
      remaining: (seconds: number) => `${seconds} seconds left`,
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
    a11y: {
      repCompleted: (done: number, total: number) =>
        `Rep ${done} of ${total} complete`,
      easeOffActive: 'Ease off — stay gentle',
    },
    errors: {
      noBaseline: 'Please recalibrate before starting a session.',
      notAttested: 'Please complete onboarding first.',
    },
  },
  summary: {
    title: 'Session complete',
    done: 'Done',
    doneAriaLabel: 'Return to home',
    demoDone: 'Back to onboarding',
    repsDone: (count: number) => `${count} reps completed`,
    easeOffLine: (gentle: number, total: number) =>
      `You kept it gentle ${gentle} of ${total} times`,
    encouraging: 'Thank you for practicing today.',
    demoWatermark: 'DEMO — not for exercise use',
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
    backToHome: 'Back to home',
  },
} as const;

export type OnboardingStrings = typeof strings.onboarding;
