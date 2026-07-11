import type { ExerciseId } from '@/data/schema';
import type { AppSettings } from '@/types/app';
import type { MetricSample, QualityState } from '@/types/sensing';

export interface FeedbackRendererSettings {
  reducedFacePreview: boolean;
  showAffectedSideMarker: boolean;
  highContrast: boolean;
  affectedSide: 'left' | 'right' | 'unknown';
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let animationId: number | null = null;
let lastSample: MetricSample | null = null;
let lastQuality: QualityState = 'FACE_LOST';
let easeOff = false;
let watermark = false;
let settings: FeedbackRendererSettings = {
  reducedFacePreview: false,
  showAffectedSideMarker: true,
  highContrast: false,
  affectedSide: 'unknown',
};
let arcPhase = 0;

function barColors(highContrast: boolean): {
  fill: string;
  track: string;
  center: string;
  easeOff: string;
} {
  if (highContrast) {
    return {
      fill: '#1a4d33',
      track: '#333333',
      center: '#000000',
      easeOff: '#b45309',
    };
  }
  return {
    fill: '#4a7c59',
    track: '#d4cfc4',
    center: '#6b7280',
    easeOff: '#d97706',
  };
}

function drawSymmetryBar(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const colors = barColors(settings.highContrast);
  const barY = height * 0.55;
  const barH = height * 0.12;
  const barW = width * 0.85;
  const barX = (width - barW) / 2;
  const centerX = barX + barW / 2;

  context.fillStyle = colors.track;
  context.beginPath();
  context.roundRect(barX, barY, barW, barH, barH / 2);
  context.fill();

  context.strokeStyle = colors.center;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(centerX, barY - 4);
  context.lineTo(centerX, barY + barH + 4);
  context.stroke();

  const frozen = lastQuality !== 'QUALITY_OK';
  const symmetry = frozen ? 0.5 : (lastSample?.symmetryIndex ?? 0.5);
  const fillColor = easeOff ? colors.easeOff : colors.fill;
  const leftWidth = (symmetry * barW) / 2;
  const rightWidth = barW / 2;

  context.fillStyle = fillColor;
  context.globalAlpha = frozen ? 0.35 : 1;
  context.beginPath();
  context.roundRect(centerX - leftWidth, barY, leftWidth, barH, barH / 2);
  context.fill();
  context.beginPath();
  context.roundRect(centerX, barY, rightWidth * symmetry, barH, barH / 2);
  context.fill();
  context.globalAlpha = 1;

  if (settings.showAffectedSideMarker && settings.affectedSide !== 'unknown') {
    const dotX =
      settings.affectedSide === 'left' ? centerX - barW * 0.25 : centerX + barW * 0.25;
    context.fillStyle = colors.fill;
    context.beginPath();
    context.arc(dotX, barY + barH / 2, 5, 0, Math.PI * 2);
    context.fill();
  }
}

function drawGuideArc(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  if (lastQuality !== 'QUALITY_OK') {
    return;
  }

  const cx = width / 2;
  const cy = height * 0.32;
  const radius = Math.min(width, height) * 0.22;
  arcPhase += easeOff ? 0.008 : 0.02;
  const start = arcPhase;
  const end = start + Math.PI * 0.6;

  context.strokeStyle = easeOff ? '#d97706' : '#4a7c59';
  context.lineWidth = 4;
  context.lineCap = 'round';
  context.beginPath();
  context.arc(cx, cy, radius, start, end);
  context.stroke();
}

function drawWatermark(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  if (!watermark) {
    return;
  }
  context.save();
  context.fillStyle = 'rgba(180, 83, 9, 0.15)';
  context.fillRect(0, height - 36, width, 36);
  context.restore();
}

function paint(): void {
  if (!ctx || !canvas) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, width, height);
  drawGuideArc(ctx, width, height);
  drawSymmetryBar(ctx, width, height);
  drawWatermark(ctx, width, height);

  animationId = requestAnimationFrame(paint);
}

export const FeedbackRenderer = {
  mount(targetCanvas: HTMLCanvasElement): void {
    FeedbackRenderer.unmount();
    canvas = targetCanvas;
    ctx = canvas.getContext('2d');
    animationId = requestAnimationFrame(paint);
  },

  unmount(): void {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    canvas = null;
    ctx = null;
  },

  render(sample: MetricSample | null, quality: QualityState): void {
    lastSample = sample;
    lastQuality = quality;
  },

  setEaseOff(active: boolean): void {
    easeOff = active;
  },

  setExercise(nextExerciseId: ExerciseId): void {
    void nextExerciseId;
    arcPhase = 0;
  },

  setRepCount(done: number, total: number): void {
    void done;
    void total;
  },

  setWatermark(on: boolean): void {
    watermark = on;
  },

  applySettings(
    appSettings: AppSettings,
    affectedSide: 'left' | 'right' | 'unknown',
  ): void {
    settings = {
      reducedFacePreview: appSettings.reducedFacePreview,
      showAffectedSideMarker: appSettings.showAffectedSideMarker,
      highContrast: appSettings.highContrast,
      affectedSide,
    };
  },

  getReducedFacePreview(): boolean {
    return settings.reducedFacePreview;
  },
};
