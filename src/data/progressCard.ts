// src/data/progressCard.ts — weekly progressCard (V3 Task 6).
// Offscreen canvas PNG (1080×1350): week range, session count, gentlenessStat, garden plant
// stage. Download only via downloadBlob — same local channel as ExportService (no share API).
// Unit tests cover week aggregation only; pixel output is not asserted.
import { strings } from '../config/strings.ts';
import { gentlenessStat } from '../lib/summaryMetrics.ts';
import { MirrorWellError } from './errors.ts';
import type { SessionRecordFull } from './storage.ts';
import { StorageService } from './storage.ts';
import { SafetyGate } from '../session/safety.ts';

/** Canvas size — calm share-card portrait (1080×1350). */
export const PROGRESS_CARD_WIDTH = 1080;
export const PROGRESS_CARD_HEIGHT = 1350;

/** Garden plant stage for the week: seed → sprout → leaf → bloom (min(3, sessions)). */
export type PlantStage = 0 | 1 | 2 | 3;

/** Derived aggregates for one Monday-start local week — no raw metrics tables. */
export type ProgressCardData = {
  weekStart: string; // YYYY-MM-DD (Monday, local)
  weekEnd: string; // YYYY-MM-DD (Sunday, local)
  sessionCount: number;
  gentle: number;
  total: number;
  plantStage: PlantStage;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Monday-start local calendar week of an ISO timestamp or Date.
 * Matches TrendsService weekly bucketing (ARCHITECTURE §13 local periods).
 */
export function weekStartMonday(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : new Date(isoOrDate.getTime());
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday);
  return formatYmd(monday);
}

/** Sunday of the Monday-start week given as YYYY-MM-DD. */
export function weekEndSunday(weekStartYmd: string): string {
  const [y, m, d] = weekStartYmd.split('-').map(Number);
  const sunday = new Date(y, m - 1, d + 6);
  return formatYmd(sunday);
}

/** Plant stage from session count — growth only, never decay (SAFETY garden rule). */
export function plantStageForSessions(sessionCount: number): PlantStage {
  const n = Math.max(0, Math.floor(sessionCount));
  return Math.min(3, n) as PlantStage;
}

/**
 * Pure week aggregation: filter sessions into the local Monday-start week of `now`,
 * count sessions, fold gentlenessStat across all results, derive plant stage.
 */
export function aggregateWeek(
  sessions: SessionRecordFull[],
  now: Date = new Date(),
): ProgressCardData {
  const weekStart = weekStartMonday(now);
  const weekEnd = weekEndSunday(weekStart);
  const inWeek = sessions.filter((s) => weekStartMonday(s.startedAt) === weekStart);
  const results = inWeek.flatMap((s) => s.results);
  const { gentle, total } = gentlenessStat(results);
  const sessionCount = inWeek.length;
  return {
    weekStart,
    weekEnd,
    sessionCount,
    gentle,
    total,
    plantStage: plantStageForSessions(sessionCount),
  };
}

// --- Canvas palette (calm-clinical; fixed hex so the PNG does not depend on CSS vars) ---
const COLORS = {
  bg: '#FAF8F5',
  card: '#FFFFFF',
  ink: '#24352E',
  muted: '#5C6B64',
  primary: '#3D6B5A',
  accent: '#E8EFEA',
  plant: '#5A8F74',
  soil: '#C4B8A8',
  border: '#D9D2C8',
} as const;

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Simple plant glyph for the garden row — stage 0 seed … 3 bloom. */
function drawPlant(ctx: CanvasRenderingContext2D, cx: number, baseY: number, stage: PlantStage): void {
  // Soil mound
  ctx.fillStyle = COLORS.soil;
  ctx.beginPath();
  ctx.ellipse(cx, baseY, 48, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  if (stage === 0) {
    // Seed
    ctx.fillStyle = COLORS.primary;
    ctx.beginPath();
    ctx.ellipse(cx, baseY - 10, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Stem
  ctx.strokeStyle = COLORS.plant;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, baseY - 4);
  const stemTop = baseY - (stage === 1 ? 48 : stage === 2 ? 80 : 100);
  ctx.lineTo(cx, stemTop);
  ctx.stroke();

  if (stage >= 1) {
    // Small sprout leaves
    ctx.fillStyle = COLORS.plant;
    ctx.beginPath();
    ctx.ellipse(cx - 18, stemTop + 18, 16, 8, -0.6, 0, Math.PI * 2);
    ctx.ellipse(cx + 18, stemTop + 18, 16, 8, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  if (stage >= 2) {
    // Larger leaves lower on stem
    ctx.beginPath();
    ctx.ellipse(cx - 28, baseY - 40, 22, 10, -0.5, 0, Math.PI * 2);
    ctx.ellipse(cx + 28, baseY - 40, 22, 10, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (stage >= 3) {
    // Bloom
    ctx.fillStyle = COLORS.primary;
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(a) * 22;
      const py = stemTop + Math.sin(a) * 22;
      ctx.moveTo(cx, stemTop);
      ctx.arc(px, py, 12, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = '#E8D5A3';
    ctx.beginPath();
    ctx.arc(cx, stemTop, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Compose the progress card onto an offscreen canvas and return a PNG Blob.
 * Not unit-tested for pixels — only the data path is.
 */
export function composeProgressCardPng(data: ProgressCardData): Promise<Blob> {
  const copy = strings.export.card;
  const canvas = document.createElement('canvas');
  canvas.width = PROGRESS_CARD_WIDTH;
  canvas.height = PROGRESS_CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Promise.reject(new MirrorWellError('VALIDATION_FAILED', 'canvas 2d context unavailable'));
  }

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, PROGRESS_CARD_WIDTH, PROGRESS_CARD_HEIGHT);

  // Inner card panel
  ctx.fillStyle = COLORS.card;
  drawRoundedRect(ctx, 64, 80, PROGRESS_CARD_WIDTH - 128, PROGRESS_CARD_HEIGHT - 200, 32);
  ctx.fill();
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 64, 80, PROGRESS_CARD_WIDTH - 128, PROGRESS_CARD_HEIGHT - 200, 32);
  ctx.stroke();

  // Heading
  ctx.fillStyle = COLORS.primary;
  ctx.font = '600 48px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(copy.canvasHeading, PROGRESS_CARD_WIDTH / 2, 180);

  // Week range
  ctx.fillStyle = COLORS.muted;
  ctx.font = '400 36px system-ui, sans-serif';
  ctx.fillText(copy.weekRange(data.weekStart, data.weekEnd), PROGRESS_CARD_WIDTH / 2, 250);

  // Accent band for session count
  ctx.fillStyle = COLORS.accent;
  drawRoundedRect(ctx, 140, 320, PROGRESS_CARD_WIDTH - 280, 200, 24);
  ctx.fill();

  ctx.fillStyle = COLORS.ink;
  ctx.font = '600 96px system-ui, sans-serif';
  ctx.fillText(String(data.sessionCount), PROGRESS_CARD_WIDTH / 2, 420);
  ctx.fillStyle = COLORS.muted;
  ctx.font = '500 36px system-ui, sans-serif';
  ctx.fillText(copy.sessionsLabel(data.sessionCount), PROGRESS_CARD_WIDTH / 2, 480);

  // Gentleness (reuse framing from summary — no raw tables)
  ctx.fillStyle = COLORS.ink;
  ctx.font = '500 40px system-ui, sans-serif';
  const gentlenessLine =
    data.total === 0 ? copy.gentlenessEmpty : copy.gentlenessLabel(data.gentle, data.total);
  ctx.fillText(gentlenessLine, PROGRESS_CARD_WIDTH / 2, 600);

  // Garden row
  ctx.fillStyle = COLORS.primary;
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.fillText(copy.gardenLabel, PROGRESS_CARD_WIDTH / 2, 720);

  drawPlant(ctx, PROGRESS_CARD_WIDTH / 2, 920, data.plantStage);

  ctx.fillStyle = COLORS.muted;
  ctx.font = '400 32px system-ui, sans-serif';
  ctx.fillText(copy.plantStageLabel(data.plantStage), PROGRESS_CARD_WIDTH / 2, 1000);

  // Footer — same data class notice as export (non-diagnostic, local only)
  ctx.fillStyle = COLORS.muted;
  ctx.font = '400 26px system-ui, sans-serif';
  const footer = copy.footer;
  // Wrap footer if needed (simple single-line centered; keep short in strings)
  ctx.fillText(footer, PROGRESS_CARD_WIDTH / 2, PROGRESS_CARD_HEIGHT - 60);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new MirrorWellError('VALIDATION_FAILED', 'canvas.toBlob returned null'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

/**
 * Load this week's sessions, aggregate, compose PNG.
 * Gated: ATTESTED and not demo — same class as ExportService (API §17).
 */
export async function generateWeeklyProgressCard(
  now: Date = new Date(),
): Promise<{ blob: Blob; data: ProgressCardData }> {
  if (SafetyGate.isDemoMode() || !(await SafetyGate.isAttested())) {
    throw new MirrorWellError(
      'NOT_ATTESTED',
      'progress card requires attestation (demo mode is not an export path)',
    );
  }

  const weekStart = weekStartMonday(now);
  const weekEnd = weekEndSunday(weekStart);
  // Local day bounds → UTC ISO for StorageService (same pattern as export range widening).
  const [ys, ms, ds] = weekStart.split('-').map(Number);
  const [ye, me, de] = weekEnd.split('-').map(Number);
  const fromIso = new Date(ys, ms - 1, ds, 0, 0, 0, 0).toISOString();
  const toIso = new Date(ye, me - 1, de, 23, 59, 59, 999).toISOString();

  const sessions = await StorageService.getSessions({ from: fromIso, to: toIso });
  const data = aggregateWeek(sessions, now);
  const blob = await composeProgressCardPng(data);
  return { blob, data };
}
