// Pure, framework-free helpers for SessionScreen. Everything here is unit-testable under the
// node-env vitest (no DOM, no React); the screen and renderer keep all DOM/canvas/audio work.
import { MirrorWellError } from '@/data/errors';
import type { AppSettings } from '@/data/schema';

import { thresholds } from '@/config/thresholds';

// The "+30 s" rest extension amount, from the single source of truth (thresholds.session,
// added this task with a DOCS-CHANGE to API §15). The user-facing '+30 s' label is copy in
// strings.session.rest.extend, deliberately not derived from this number: it is display text,
// and coupling a string to a tunable to save one edit is churn, not correctness (ponytail).
export const REST_EXTEND_SECONDS = thresholds.session.restExtendSeconds;

/** Whole seconds left until a deadline, never negative. Display-only (the controller owns the
 *  real REST deadline off frame timestamps; this mirrors it for the countdown text). */
export function restRemainingSeconds(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

/**
 * Per-frame symmetry-bar advance; THE frozen-bar guard (TESTS.md §3.3 / FRONTEND §5 / API §18).
 * On a `frozen` (any non-`QUALITY_OK`) frame the displayed value is held EXACTLY; a bar that moves
 * on a bad frame is a critical defect. On an OK frame it eases toward the target. Extracted here so
 * the guard is unit-verifiable; the OK→bad transition cannot be driven on a faceless e2e device.
 */
export function advanceBar(frozen: boolean, value: number, target: number, ease: number): number {
  return frozen ? value : value + (target - value) * ease;
}

/** Per-frame guide-arc phase advance, wrapping to [0, 1). Held on a frozen frame, like the bar. */
export function advanceArcPhase(frozen: boolean, phase: number, speed: number): number {
  return frozen ? phase : (phase + speed) % 1;
}

/**
 * Live coaching phase from the smoothed effortIndex (the value RepDetector counts on), against
 * the documented effortTargetZone. Pure so the mapping is unit-testable; the screen turns the
 * phase into copy (strings.session.coach) and suppresses it while quality/ease-off messages own
 * the screen. Ease-off itself stays the MetricEngine sustained condition; this is guidance,
 * never the safety cue.
 */
export type CoachPhase = 'raise' | 'hold' | 'easeBack' | 'soften';

/**
 * Strain outranks the effort band. If the jaw and brow are doing the work, "hold it gently" is
 * the wrong thing to say however good the effort number looks: the number is high precisely
 * because of the compensation. Softening the rest of the face is the useful instruction, and it
 * has to come first or the user is coached into the habit the exercise is meant to undo.
 *
 * `strainIndex` is optional so existing callers that only track effort keep working unchanged.
 */
export function coachPhaseFor(effortIndex: number, strainIndex = 0): CoachPhase {
  const [zoneLow, zoneHigh] = thresholds.metrics.effortTargetZone;
  if (strainIndex >= thresholds.reps.strainMax) return 'soften';
  if (effortIndex < zoneLow) return 'raise';
  if (effortIndex <= zoneHigh) return 'hold';
  return 'easeBack';
}

/** Audio cue channel is open only when the user enabled audio cues. */
export function audioCueEnabled(settings: AppSettings | null): boolean {
  return settings?.audioCuesEnabled === true;
}

/** Haptic cue channel is open only when the user enabled haptics AND the device supports the
 *  Vibration API (Android, per `isHapticsAvailable`). Colour is never the sole ease-off channel,
 *  but neither audio nor haptic is guaranteed; the amber chip + aria-live text always render. */
export function hapticCueEnabled(settings: AppSettings | null, available: boolean): boolean {
  return settings?.hapticsEnabled === true && available;
}

/**
 * The demo baseline invariant (ARCHITECTURE §11, TESTS.md §2): the gentle rep must produce a
 * peak activation at least `thresholds.calibration.comfortableMaxMinRise` ABOVE the exercise's
 * resting (neutral) activation, or the demo has measured nothing and there is no honest
 * baseline. A faceless device yields zero approved gentle-rep frames →
 * `Math.max(...[]) === -Infinity` → this throws `NO_BASELINE` loudly. The floor matters just
 * as much as the emptiness check: a user who held STILL through the gentle window produces a
 * peak indistinguishable from their resting read, and effortIndex would then treat sensor
 * noise as full-effort movement, reps fire on their own at a timer-like cadence. The check
 * is RELATIVE to `neutralActivation` because some blendshapes read well above zero at rest
 * (browOuterUp, eyeBlink), so an absolute floor passes a face that never moved (API §15).
 */
export function demoComfortableMax(
  gentleActivations: readonly number[],
  neutralActivation = 0,
): number {
  let peak = Number.NEGATIVE_INFINITY;
  for (const value of gentleActivations) {
    if (value > peak) peak = value;
  }
  if (!Number.isFinite(peak) || peak - neutralActivation < thresholds.calibration.comfortableMaxMinRise) {
    throw new MirrorWellError('NO_BASELINE', 'demo quick-setup captured no measurable movement');
  }
  return peak;
}
