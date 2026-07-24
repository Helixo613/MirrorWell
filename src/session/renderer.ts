// src/session/renderer.ts — FeedbackRenderer (docs/API.md §18). All in-session output.
//
// Responsibility split (API §18): the CANVAS layer (redrawn every animation frame) owns the
// GentleTarget, optional symmetry context and focus-side dot; the AUDIO/HAPTIC channels for cues.
// The DOM layer (quality banners, ease-off chip, rep counter, rest timer, watermark) is React
// and lives in SessionScreen — this module never composes user-facing text.
//
// THE load-bearing rule (API §18 / FRONTEND §5 / TESTS.md §3.3): during ANY non-`QUALITY_OK`
// state every live canvas value is frozen and visibly labeled. A target that moves on a bad frame
// is a critical defect. Here that is guaranteed structurally: the draw loop redraws every frame, but
// on a non-OK state it advances neither the bar value nor the arc phase — so successive frames
// are pixel-identical (a pure function of frozen inputs), while still being drawn (immune to a
// late canvas-resize blanking the last skipped frame).
import type { ExerciseId, AppSettings, UserProfile } from '@/data/schema';
import type { MetricSample } from '@/metrics/metrics';
import type { QualityState } from '@/sensing/quality';
import { isHapticsAvailable } from '@/lib/deviceCapabilities';
import { thresholds } from '@/config/thresholds';
import {
  advanceArcPhase,
  advanceBar,
  audioCueEnabled,
  hapticCueEnabled,
} from '@/screens/session/sessionHelpers';

// ponytail: canvas geometry, cue frequencies and vibration durations are PRESENTATION / cue-design
// constants (like the pixel sizes throughout src/components/**), not metric or session tunables —
// they do not belong in thresholds.ts (API §15) and the canvas is aria-hidden/decorative (every
// value a user reads off it also exists as DOM live-text). Tune on real hardware.
const BAR_MAX_HALF_FRAC = 0.22; // symmetry is secondary context, not the patient-primary hero
const BAR_HEIGHT_PX = 6;
const BAR_EASE = 0.2; // per-frame approach of the displayed bar toward its target (OK frames only)
const TARGET_RADIUS_FRAC = 0.18;
const TARGET_Y_FRAC = 0.48;
const TARGET_DOT_RADIUS_PX = 8;
const TARGET_TRACK_WIDTH_PX = 10;
const TARGET_ZONE_WIDTH_PX = 16;
const TARGET_GUIDE_WIDTH_PX = 4;
const TARGET_GUIDE_GAP_PX = 13;
const TARGET_GUIDE_SWEEP_FRAC = 0.22;
const SYMMETRY_Y_FRAC = 0.78;
const SYMMETRY_CENTER_HALF_HEIGHT_PX = 8;
const ZONE_COLOR = 'rgba(22, 163, 74, 0.5)'; // effortTargetZone band — visible on both video and scrim
const ARC_SPEED = 0.012; // guide-arc sweep per frame (calm pace)
const ARC_SPEED_EASE = 0.005; // slower sweep while easing off (FRONTEND §5: "arc slows")
const FOCUS_DOT_RADIUS_PX = 5;
const FOCUS_DOT_GAP_PX = 16;
const FROZEN_ALPHA = 0.35;

const TRACK_COLOR = 'rgba(120, 120, 120, 0.35)';
const CENTER_COLOR = 'rgba(120, 120, 120, 0.8)';
const CALM_COLOR = '#2563eb';
const EASE_COLOR = '#d97706';
const FROZEN_COLOR = '#6b7280';

const CHIME_HZ = 880;
const CHIME_MS = 120;
const EASE_TONE_START_HZ = 660; // soft DESCENDING tone for ease-off (FRONTEND §5)
const EASE_TONE_END_HZ = 330;
const EASE_TONE_MS = 420;
const REP_TICK_HZ = 1180;
const REP_TICK_MS = 60;
const REP_PULSE_MS = 20; // single tick pulse on rep completion
const EASE_PULSE_MS = 40; // double pulse on ease-off
const EASE_PULSE_GAP_MS = 60;

let canvasEl: HTMLCanvasElement | null = null;
// videoEl is retained per the API §18 `mount(canvas, video)` contract; the live preview is a
// separate <video> sharing the same MediaStream (SessionScreen), so the canvas overlays it
// rather than re-drawing frames — nothing is painted from videoEl.
let videoEl: HTMLVideoElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let rafId: number | null = null;
let cssW = 0;
let cssH = 0;
let dpr = 1;

let audioCtx: AudioContext | null = null;

let settings: AppSettings | null = null;
let affectedSide: UserProfile['affectedSide'] = 'unknown';
let exerciseId: ExerciseId | null = null;
let repDone = 0;
let repTotal = 0;
let prevRepDone = 0;
let watermark = false;
let easeOff = false;

let quality: QualityState = 'FACE_LOST';
let prevQuality: QualityState | null = null;
let barTarget = 0; // symmetryIndex in [0..1]; 0 = rest at centre (SI null / below movement floor)
let barValue = 0; // displayed extent, eased toward barTarget on OK frames
let effortTarget = 0; // effortIndex clamped to [0..1] for display (over-effort shows full + amber)
let effortValue = 0; // displayed meter fill, eased toward effortTarget on OK frames
let arcPhase = 0;

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function resizeIfNeeded(): void {
  if (!canvasEl || !ctx) return;
  const rect = canvasEl.getBoundingClientRect();
  const nextW = Math.max(1, Math.round(rect.width));
  const nextH = Math.max(1, Math.round(rect.height));
  const nextDpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  if (nextW === cssW && nextH === cssH && nextDpr === dpr) return;
  cssW = nextW;
  cssH = nextH;
  dpr = nextDpr;
  canvasEl.width = Math.round(cssW * dpr);
  canvasEl.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function draw(frozen: boolean): void {
  if (!ctx) return;
  const g = ctx;
  const cx = cssW / 2;
  const targetY = cssH * TARGET_Y_FRAC;
  const barY = cssH * SYMMETRY_Y_FRAC;
  const maxHalf = cssW * BAR_MAX_HALF_FRAC;
  const fill = frozen ? FROZEN_COLOR : easeOff ? EASE_COLOR : CALM_COLOR;

  g.clearRect(0, 0, cssW, cssH);

  // Reduced-preview scrim (API §18 "camera-preview dimming"): lift the target off the
  // still-visible video behind the canvas.
  if (settings?.reducedFacePreview && videoEl) {
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(0, 0, 0, 0.15)';
    g.fillRect(0, 0, cssW, cssH);
  }

  // GentleTarget: the same smoothed effortIndex the rep FSM receives, shown as one calm
  // semicircular path with a fixed target-zone segment. The moving dot and pacing highlight
  // both freeze through advanceBar/advanceArcPhase on every non-OK frame.
  const targetRadius = Math.min(cssW, cssH) * TARGET_RADIUS_FRAC;
  const [zoneLow, zoneHigh] = thresholds.metrics.effortTargetZone;
  g.globalAlpha = 1;
  g.strokeStyle = TRACK_COLOR;
  g.lineWidth = TARGET_TRACK_WIDTH_PX;
  g.beginPath();
  g.arc(cx, targetY, targetRadius, Math.PI, Math.PI * 2);
  g.stroke();
  g.strokeStyle = ZONE_COLOR;
  g.lineWidth = TARGET_ZONE_WIDTH_PX;
  g.beginPath();
  g.arc(
    cx,
    targetY,
    targetRadius,
    Math.PI + Math.PI * zoneLow,
    Math.PI + Math.PI * zoneHigh,
  );
  g.stroke();

  const effortAngle = Math.PI + Math.PI * clamp01(effortValue);
  g.globalAlpha = frozen ? FROZEN_ALPHA : 1;
  g.fillStyle = fill;
  g.beginPath();
  g.arc(
    cx + Math.cos(effortAngle) * targetRadius,
    targetY + Math.sin(effortAngle) * targetRadius,
    TARGET_DOT_RADIUS_PX,
    0,
    Math.PI * 2,
  );
  g.fill();

  if (exerciseId !== null) {
    const sweep = Math.PI * TARGET_GUIDE_SWEEP_FRAC;
    const guideStart = Math.PI + arcPhase * (Math.PI - sweep);
    g.strokeStyle = fill;
    g.lineWidth = TARGET_GUIDE_WIDTH_PX;
    g.beginPath();
    g.arc(cx, targetY, targetRadius + TARGET_GUIDE_GAP_PX, guideStart, guideStart + sweep);
    g.stroke();
  }

  // Optional symmetry context: a restrained lower indicator, no longer the hero.
  g.globalAlpha = 1;
  g.strokeStyle = TRACK_COLOR;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx - maxHalf, barY);
  g.lineTo(cx + maxHalf, barY);
  g.stroke();
  g.strokeStyle = CENTER_COLOR;
  g.beginPath();
  g.moveTo(cx, barY - SYMMETRY_CENTER_HALF_HEIGHT_PX);
  g.lineTo(cx, barY + SYMMETRY_CENTER_HALF_HEIGHT_PX);
  g.stroke();
  const half = maxHalf * clamp01(barValue);
  g.globalAlpha = frozen ? FROZEN_ALPHA : 1;
  g.fillStyle = fill;
  g.fillRect(cx - half, barY - BAR_HEIGHT_PX / 2, half * 2, BAR_HEIGHT_PX);

  if (settings?.showAffectedSideMarker && affectedSide !== 'unknown') {
    const dotX = affectedSide === 'left' ? cx - maxHalf - FOCUS_DOT_GAP_PX : cx + maxHalf + FOCUS_DOT_GAP_PX;
    g.beginPath();
    g.arc(dotX, barY, FOCUS_DOT_RADIUS_PX, 0, Math.PI * 2);
    g.fill();
  }

  // Rep progress underline (canvas mirror of the DOM rep counter's fraction).
  if (repTotal > 0) {
    const track = cssW * 0.5;
    const progress = clamp01(repDone / repTotal);
    g.globalAlpha = frozen ? FROZEN_ALPHA : 1;
    g.fillStyle = fill;
    g.fillRect(cx - track / 2, barY + BAR_HEIGHT_PX, track * progress, 3);
  }

  // Demo canvas mark (reinforces the DOM DEMO watermark strip on the feedback surface itself).
  if (watermark) {
    g.globalAlpha = 0.5;
    g.fillStyle = FROZEN_COLOR;
    g.fillRect(0, cssH - 4, cssW, 4);
  }

  g.globalAlpha = 1;
}

function tick(): void {
  rafId = requestAnimationFrame(tick);
  if (!ctx || !canvasEl) return;
  resizeIfNeeded();
  // The freeze guard lives entirely in advanceBar/advanceArcPhase (pure, unit-tested): a non-OK
  // frame holds both the bar and the arc, so successive frozen frames are pixel-identical.
  const frozen = quality !== 'QUALITY_OK';
  barValue = advanceBar(frozen, barValue, barTarget, BAR_EASE);
  effortValue = advanceBar(frozen, effortValue, effortTarget, BAR_EASE);
  arcPhase = advanceArcPhase(frozen, arcPhase, easeOff ? ARC_SPEED_EASE : ARC_SPEED);
  draw(frozen);
}

// --- Audio / haptic cues (owned here per API §18) -------------------------------------------

function ensureAudioContext(): AudioContext | null {
  if (!audioCueEnabled(settings)) return null;
  if (typeof window === 'undefined') return null;
  const Ctor: typeof AudioContext | undefined =
    typeof AudioContext !== 'undefined'
      ? AudioContext
      : (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  let ac = audioCtx;
  if (!ac) {
    try {
      ac = new Ctor();
    } catch {
      return null;
    }
    audioCtx = ac;
  }
  // Browsers start an AudioContext suspended until a user gesture; the "I'm ready"/"Start quick
  // setup" taps resume it. A resume() before any gesture is a harmless no-op.
  if (ac.state === 'suspended') void ac.resume();
  return ac;
}

function tone(startHz: number, endHz: number, durationMs: number): void {
  const ac = ensureAudioContext();
  if (!ac) return;
  const now = ac.currentTime;
  const end = now + durationMs / 1000;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.frequency.setValueAtTime(startHz, now);
  if (endHz !== startHz) osc.frequency.linearRampToValueAtTime(endHz, end);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.14, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(now);
  osc.stop(end);
}

function vibrate(pattern: number[]): void {
  if (hapticCueEnabled(settings, isHapticsAvailable())) navigator.vibrate(pattern);
}

// --- Public interface (docs/API.md §18, verbatim) -------------------------------------------

function mount(canvas: HTMLCanvasElement, video: HTMLVideoElement): void {
  canvasEl = canvas;
  videoEl = video;
  ctx = canvas.getContext('2d');
  cssW = 0;
  cssH = 0;
  dpr = 1;
  quality = 'FACE_LOST';
  prevQuality = null;
  barTarget = 0;
  barValue = 0;
  effortTarget = 0;
  effortValue = 0;
  arcPhase = 0;
  // These are module globals and no event ever clears them: SessionController.start() resets its
  // easeOffWasActive flag WITHOUT emitting, so no easeOff{active:false} reaches the renderer. Left
  // unreset, session 2 opened drawing the bar and arc in amber EASE_COLOR at ARC_SPEED_EASE while
  // the DOM chip (fresh React state) said nothing — canvas and DOM contradicting each other on a
  // safety-relevant cue. mount() is the session boundary, so it is where they reset.
  easeOff = false;
  repDone = 0;
  repTotal = 0;
  prevRepDone = 0;
  if (rafId === null) rafId = requestAnimationFrame(tick);
}

function unmount(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (audioCtx) {
    void audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  canvasEl = null;
  videoEl = null;
  ctx = null;
}

function render(sample: MetricSample | null, nextQuality: QualityState): void {
  quality = nextQuality;
  if (nextQuality === 'QUALITY_OK' && sample) {
    // OK + SI number → bar tracks symmetry; OK + SI null (below movement floor) → rest at centre.
    barTarget = sample.symmetryIndex === null ? 0 : clamp01(sample.symmetryIndex);
    // Effort meter follows the same smoothed sample RepDetector consumes, clamped for display
    // (effort can exceed 1 on over-effort; the ease-off amber carries that signal).
    effortTarget = clamp01(sample.effortIndex);
  }
  // Soft chime on entry to any non-OK state (FRONTEND §5).
  if (nextQuality !== 'QUALITY_OK' && nextQuality !== prevQuality) {
    tone(CHIME_HZ, CHIME_HZ, CHIME_MS);
  }
  prevQuality = nextQuality;
}

function setEaseOff(active: boolean): void {
  easeOff = active;
  if (active) {
    tone(EASE_TONE_START_HZ, EASE_TONE_END_HZ, EASE_TONE_MS);
    vibrate([EASE_PULSE_MS, EASE_PULSE_GAP_MS, EASE_PULSE_MS]);
  }
}

function setExercise(nextExerciseId: ExerciseId): void {
  exerciseId = nextExerciseId;
  arcPhase = 0;
}

function setRepCount(done: number, total: number): void {
  if (done > prevRepDone) {
    tone(REP_TICK_HZ, REP_TICK_HZ, REP_TICK_MS);
    vibrate([REP_PULSE_MS]);
  }
  prevRepDone = done;
  repDone = done;
  repTotal = total;
}

function setWatermark(on: boolean): void {
  // The visible DEMO strip is the DOM `DemoWatermark`; the flag is retained per the API §18
  // contract for any canvas treatment and to keep the renderer's demo awareness explicit.
  watermark = on;
}

function applySettings(next: AppSettings, side: UserProfile['affectedSide']): void {
  settings = next;
  affectedSide = side;
}

export const FeedbackRenderer = {
  mount,
  unmount,
  render,
  setEaseOff,
  setExercise,
  setRepCount,
  setWatermark,
  applySettings,
};
