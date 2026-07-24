import { useCallback, useMemo, useRef, useState } from 'react';
import { strings } from '@/config/strings';
import { thresholds } from '@/config/thresholds';
import { MirrorWellError } from '@/data/errors';
import { ExportService } from '@/data/export';
import { generateWeeklyProgressCard } from '@/data/progressCard';
import { downloadBlob } from '@/lib/downloadBlob';
import type {
  ExportDateRange,
  ExportSummaryPreview,
} from '@/types/export';

// ExportScreen status: it needs no initial fetch (the setup form shows immediately), so there is
// no 'loading' state, generation drives 'generating' -> 'success' | 'empty' | 'error'.
export type ExportStatus = 'ready' | 'generating' | 'success' | 'empty' | 'error';

export type WeeklyCardStatus = 'idle' | 'generating' | 'error';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local calendar date as YYYY-MM-DD (the export range is a bare calendar date, API §13). */
function localYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// Default window: last N weeks up to today (FRONTEND §2.8; thresholds.export.defaultRangeWeeks).
const DEFAULT_RANGE_DAYS = thresholds.export.defaultRangeWeeks * 7;

interface GeneratedResult {
  json: Blob;
  html: Blob;
  preview: ExportSummaryPreview;
}

export interface UseExportScreenResult {
  status: ExportStatus;
  range: ExportDateRange;
  preview: ExportSummaryPreview | null;
  errorTitle: string | null;
  errorBody: string | null;
  liveAnnouncement: string;
  weeklyCardStatus: WeeklyCardStatus;
  setFrom: (value: string) => void;
  setTo: (value: string) => void;
  generate: () => Promise<void>;
  downloadJson: () => void;
  downloadHtml: () => void;
  downloadWeeklyCard: () => Promise<void>;
}

export function useExportScreen(): UseExportScreenResult {
  const nowRef = useRef<Date>(new Date());
  const [range, setRange] = useState<ExportDateRange>(() => ({
    from: localYmd(new Date(nowRef.current.getTime() - DEFAULT_RANGE_DAYS * 86_400_000)),
    to: localYmd(nowRef.current),
  }));
  const [status, setStatus] = useState<ExportStatus>('ready');
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [errorBody, setErrorBody] = useState<string | null>(null);
  const [weeklyCardStatus, setWeeklyCardStatus] = useState<WeeklyCardStatus>('idle');
  const [cardAnnouncement, setCardAnnouncement] = useState('');

  const setFrom = useCallback((value: string) => {
    setRange((prev) => ({ ...prev, from: value }));
    setStatus('ready');
  }, []);

  const setTo = useCallback((value: string) => {
    setRange((prev) => ({ ...prev, to: value }));
    setStatus('ready');
  }, []);

  const generate = useCallback(async () => {
    setStatus('generating');
    setErrorTitle(null);
    setErrorBody(null);
    try {
      const { json, html } = await ExportService.generateSummary(range);
      // Parse the JSON payload to detect the empty-range case and build the preview; the
      // service returns Blobs only, so this is the single source of the on-screen summary.
      const parsed = JSON.parse(await json.text()) as {
        sessions: unknown[];
        adherence: { completionRate: number };
        profile: { assignedExercises: unknown[] };
        range: ExportDateRange;
      };
      if (parsed.sessions.length === 0) {
        setResult(null);
        setStatus('empty');
        return;
      }
      setResult({
        json,
        html,
        preview: {
          sessionCount: parsed.sessions.length,
          exerciseCount: parsed.profile.assignedExercises.length,
          completionRate: parsed.adherence.completionRate,
          range: parsed.range,
        },
      });
      setStatus('success');
    } catch (error) {
      if (error instanceof MirrorWellError && error.code === 'DB_UNAVAILABLE') {
        setErrorTitle(strings.errors.DB_UNAVAILABLE.title);
        setErrorBody(strings.errors.DB_UNAVAILABLE.body);
      } else {
        setErrorTitle(strings.errors.VALIDATION_FAILED.title);
        setErrorBody(strings.errors.VALIDATION_FAILED.body);
      }
      setStatus('error');
    }
  }, [range]);

  // Download only, shared downloadBlob helper (object-URL anchor, no Web Share / clipboard).
  const downloadJson = useCallback(() => {
    if (result) {
      downloadBlob(result.json, `${strings.export.filename(range.to)}.json`);
    }
  }, [result, range.to]);

  const downloadHtml = useCallback(() => {
    if (result) {
      downloadBlob(result.html, `${strings.export.filename(range.to)}.html`);
    }
  }, [result, range.to]);

  const downloadWeeklyCard = useCallback(async () => {
    setWeeklyCardStatus('generating');
    setCardAnnouncement('');
    try {
      const { blob, data } = await generateWeeklyProgressCard();
      downloadBlob(blob, `${strings.export.card.filename(data.weekStart)}.png`);
      setWeeklyCardStatus('idle');
      setCardAnnouncement(strings.export.card.announcementReady);
    } catch {
      setWeeklyCardStatus('error');
      setErrorTitle(strings.errors.VALIDATION_FAILED.title);
      setErrorBody(strings.errors.VALIDATION_FAILED.body);
    }
  }, []);

  const liveAnnouncement = useMemo(() => {
    if (cardAnnouncement) {
      return cardAnnouncement;
    }
    if (status !== 'success' || !result) {
      return '';
    }
    const { preview } = result;
    return strings.export.success.announcement(
      preview.sessionCount,
      preview.range.from,
      preview.range.to,
      Math.round(preview.completionRate * 100),
    );
  }, [status, result, cardAnnouncement]);

  return {
    status,
    range,
    preview: result?.preview ?? null,
    errorTitle,
    errorBody,
    liveAnnouncement,
    weeklyCardStatus,
    setFrom,
    setTo,
    generate,
    downloadJson,
    downloadHtml,
    downloadWeeklyCard,
  };
}
