import { describe, expect, it } from 'vitest';
import { assignableExercises } from '../../src/config/exercises.ts';
import { strings } from '../../src/config/strings.ts';
import { thresholds } from '../../src/config/thresholds.ts';
import { MirrorWellError } from '../../src/data/errors.ts';
import type { ExerciseId } from '../../src/data/schema.ts';
import {
  CAPTURE_WINDOW_MS,
  calibrationExercises,
  captureTotal,
  classifyError,
  helperText,
  nextStep,
  phaseCopy,
  primaryLabel,
  windowsElapsed,
} from '../../src/screens/calibration/machine.ts';
import {
  COMFORTABLE_REP_TOTAL,
  NEUTRAL_CAPTURE_TOTAL,
} from '../../src/screens/calibration/types.ts';

describe('classifyError', () => {
  it('routes QUALITY_TOO_LOW to coaching, never to a blocking dead end', () => {
    expect(classifyError(new MirrorWellError('QUALITY_TOO_LOW', 'dev text'))).toEqual({
      kind: 'coaching',
    });
  });

  it('routes NOT_ATTESTED back to onboarding', () => {
    expect(classifyError(new MirrorWellError('NOT_ATTESTED', 'dev text'))).toEqual({
      kind: 'redirect',
      to: '/onboarding',
    });
  });

  it.each(['MODEL_LOAD_FAILED', 'CAMERA_DENIED', 'CAMERA_UNAVAILABLE', 'DB_UNAVAILABLE', 'NO_BASELINE'] as const)(
    'blocks on %s with its own copy',
    (code) => {
      expect(classifyError(new MirrorWellError(code, 'dev text'))).toEqual({
        kind: 'blocking',
        code,
      });
      expect(strings.errors[code].title).toBeTruthy();
    },
  );

  it('falls back to VALIDATION_FAILED for unmapped codes and non-MirrorWell errors', () => {
    expect(classifyError(new MirrorWellError('INFERENCE_FAILED', 'dev text'))).toEqual({
      kind: 'blocking',
      code: 'VALIDATION_FAILED',
    });
    expect(classifyError(new Error('boom'))).toEqual({
      kind: 'blocking',
      code: 'VALIDATION_FAILED',
    });
    expect(classifyError('boom')).toEqual({ kind: 'blocking', code: 'VALIDATION_FAILED' });
  });

  it('never surfaces the developer-facing message', () => {
    const action = classifyError(new MirrorWellError('CAMERA_DENIED', 'NotAllowedError: nope'));
    expect(JSON.stringify(action)).not.toContain('NotAllowedError');
  });
});

describe('calibrationExercises', () => {
  it('drops assigned exercises captureComfortableMax cannot measure', () => {
    const assigned = ['EX_SMILE', 'EX_PUCKER', 'EX_BROW_RAISE'] as ExerciseId[];
    expect(calibrationExercises(assigned).map((e) => e.exerciseId)).toEqual([
      'EX_SMILE',
      'EX_BROW_RAISE',
    ]);
    expect(assignableExercises).not.toContain('EX_PUCKER');
  });

  it('preserves the assigned order and tolerates a missing profile', () => {
    expect(calibrationExercises(undefined)).toEqual([]);
    const ordered = calibrationExercises(['EX_BROW_RAISE', 'EX_SMILE'] as ExerciseId[]);
    expect(ordered.map((e) => e.exerciseId)).toEqual(['EX_BROW_RAISE', 'EX_SMILE']);
    expect(ordered[0]!.displayName).toBe('Gentle brow raise');
  });
});

describe('nextStep', () => {
  it('runs neutral, then every exercise, then the noise floor', () => {
    let step = nextStep({ phase: 'neutral', exerciseIndex: 0 }, 2);
    expect(step).toEqual({ phase: 'comfortableMax', exerciseIndex: 0 });
    step = nextStep(step, 2);
    expect(step).toEqual({ phase: 'comfortableMax', exerciseIndex: 1 });
    step = nextStep(step, 2);
    expect(step).toEqual({ phase: 'noiseFloor', exerciseIndex: 1 });
    expect(nextStep(step, 2)).toEqual({ phase: 'complete', exerciseIndex: 1 });
  });

  it('never transitions back to neutral (captureNeutral resets comfortableMax)', () => {
    const phases = (['neutral', 'comfortableMax', 'noiseFloor', 'saving', 'complete'] as const).map(
      (phase) => nextStep({ phase, exerciseIndex: 0 }, 1).phase,
    );
    expect(phases).not.toContain('neutral');
  });

  it('is terminal at complete', () => {
    const step = { phase: 'complete', exerciseIndex: 3 } as const;
    expect(nextStep(step, 2)).toEqual(step);
  });
});

describe('capture progress derivation', () => {
  it('uses the real capture window length, not a literal', () => {
    expect(CAPTURE_WINDOW_MS).toBe(thresholds.calibration.captureSeconds * 1000);
    expect(NEUTRAL_CAPTURE_TOTAL).toBe(thresholds.calibration.neutralCaptures);
    expect(COMFORTABLE_REP_TOTAL).toBe(thresholds.calibration.neutralCaptures);
  });

  it('advances one dot per elapsed window and clamps at the total', () => {
    expect(windowsElapsed(0, 3)).toBe(0);
    expect(windowsElapsed(CAPTURE_WINDOW_MS - 1, 3)).toBe(0);
    expect(windowsElapsed(CAPTURE_WINDOW_MS, 3)).toBe(1);
    expect(windowsElapsed(CAPTURE_WINDOW_MS * 2.5, 3)).toBe(2);
    expect(windowsElapsed(CAPTURE_WINDOW_MS * 99, 3)).toBe(3);
    expect(windowsElapsed(-1, 3)).toBe(0);
    expect(windowsElapsed(Number.NaN, 3)).toBe(0);
  });

  it('sizes each phase from its backend capture count', () => {
    expect(captureTotal('neutral')).toBe(thresholds.calibration.neutralCaptures);
    expect(captureTotal('comfortableMax')).toBe(thresholds.calibration.neutralCaptures);
    expect(captureTotal('noiseFloor')).toBe(1);
  });
});

describe('phase copy', () => {
  const exercise = {
    exerciseId: 'EX_SMILE' as ExerciseId,
    displayName: 'Gentle smile',
    instruction: 'Let a small, slow smile come — about half of what feels possible. Gentle is the goal.',
  };

  it('keeps the comfortable-max copy gentle (API §11 rule, SAFETY §8)', () => {
    const copy = phaseCopy('comfortableMax', exercise, 0);
    expect(`${copy.title} ${copy.body} ${copy.subtitle}`.toLowerCase()).toContain('gentle');
    expect(copy.body).toBe(strings.calibration.comfortableMax.instruction);
  });

  it('numbers the progress label from 1 and clamps at the total', () => {
    expect(phaseCopy('neutral', null, 0).progressLabel).toBe(
      strings.calibration.neutral.captureProgress(1, NEUTRAL_CAPTURE_TOTAL),
    );
    expect(phaseCopy('neutral', null, NEUTRAL_CAPTURE_TOTAL).progressLabel).toBe(
      strings.calibration.neutral.captureProgress(
        NEUTRAL_CAPTURE_TOTAL,
        NEUTRAL_CAPTURE_TOTAL,
      ),
    );
  });

  it('falls back to neutral copy when comfortableMax has no exercise', () => {
    expect(phaseCopy('comfortableMax', null, 0).title).toBe(strings.calibration.neutral.title);
  });

  it('uses the quiet-moment copy for the noise floor', () => {
    expect(phaseCopy('noiseFloor', null, 0).title).toBe(strings.calibration.noiseFloor.title);
  });
});

describe('action affordances', () => {
  it('switches the primary label to redo after a failed capture, per phase', () => {
    expect(primaryLabel('neutral', false)).toBe(strings.calibration.neutral.captureLabel);
    expect(primaryLabel('neutral', true)).toBe(strings.calibration.neutral.redoLabel);
    expect(primaryLabel('comfortableMax', false)).toBe(
      strings.calibration.comfortableMax.captureLabel,
    );
    expect(primaryLabel('comfortableMax', true)).toBe(
      strings.calibration.comfortableMax.redoLabel,
    );
  });

  it('offers quality guidance as advice only — capture is never gated on it', () => {
    expect(helperText(false, false)).toBe(strings.calibration.helpers.qualityNotReady);
    expect(helperText(false, true)).toBeNull();
    expect(helperText(true, false)).toBe(strings.calibration.helpers.capturing);
    expect(helperText(true, true)).toBe(strings.calibration.helpers.capturing);
  });
});
