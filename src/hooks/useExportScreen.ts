import { useCallback, useEffect, useMemo, useState } from 'react';
import { compareYmd, formatYmd, isValidYmd } from '@/lib/dateRange';
import { downloadBlob } from '@/lib/downloadBlob';
import { strings } from '@/config/strings';
import { useAppState } from '@/context/useAppState';
import { ExportService } from '@/data/export';
import { isMirrorWellError } from '@/data/errors';
import { SettingsService } from '@/data/settings';
import type { AppSettings } from '@/data/schema';
import type {
  ExportDateRange,
  ExportScreenStatus,
  ExportSummaryBlobs,
  ExportSummaryPreview,
} from '@/types/export';
import { EXPORT_HEADING_ID } from '@/types/export';

export interface UseExportScreenResult {
  status: ExportScreenStatus;
  range: ExportDateRange;
  settings: AppSettings;
  blobs: ExportSummaryBlobs | null;
  preview: ExportSummaryPreview | null;
  filenameBase: string;
  errorTitle: string | null;
  errorBody: string | null;
  generatingAnnouncement: string;
  successAnnouncement: string;
  emptyAnnouncement: string;
  canGenerate: boolean;
  setFrom: (value: string) => void;
  setTo: (value: string) => void;
  generate: () => Promise<void>;
  downloadJson: () => void;
  downloadHtml: () => void;
  headingId: string;
}

export function useExportScreen(): UseExportScreenResult {
  const { settings: appSettings } = useAppState();
  const [status, setStatus] = useState<ExportScreenStatus>('loading');
  const [settings, setSettings] = useState<AppSettings>(appSettings);
  const [range, setRange] = useState<ExportDateRange>(() =>
    ExportService.defaultRange(),
  );
  const [blobs, setBlobs] = useState<ExportSummaryBlobs | null>(null);
  const [preview, setPreview] = useState<ExportSummaryPreview | null>(null);
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [errorBody, setErrorBody] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot(): Promise<void> {
      try {
        const loadedSettings = await SettingsService.get();
        if (cancelled) {
          return;
        }
        setSettings(loadedSettings);
        setRange(ExportService.defaultRange());
        setStatus('ready');
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (isMirrorWellError(error) && error.code === 'DB_UNAVAILABLE') {
          setErrorTitle(strings.errors.DB_UNAVAILABLE.title);
          setErrorBody(strings.errors.DB_UNAVAILABLE.body);
        } else {
          setErrorTitle(strings.errors.VALIDATION_FAILED.title);
          setErrorBody(strings.errors.VALIDATION_FAILED.body);
        }
        setStatus('error');
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status === 'ready' || status === 'empty' || status === 'success') {
      const heading = document.getElementById(EXPORT_HEADING_ID);
      heading?.focus({ preventScroll: true });
    }
  }, [status]);

  const canGenerate = useMemo(
    () =>
      isValidYmd(range.from) &&
      isValidYmd(range.to) &&
      compareYmd(range.from, range.to) <= 0,
    [range.from, range.to],
  );

  const filenameBase = useMemo(
    () => strings.export.filename(formatYmd(new Date())),
    [],
  );

  const generatingAnnouncement = useMemo(
    () => (status === 'generating' ? strings.export.generating : ''),
    [status],
  );

  const successAnnouncement = useMemo(() => {
    if (status !== 'success' || !preview) {
      return '';
    }
    return strings.export.success.announcement(
      preview.sessionCount,
      preview.range.from,
      preview.range.to,
      Math.round(preview.completionRate * 100),
    );
  }, [status, preview]);

  const emptyAnnouncement = useMemo(
    () => (status === 'empty' ? strings.export.empty.title : ''),
    [status],
  );

  const resetResult = useCallback(() => {
    setBlobs(null);
    setPreview(null);
    setStatus((current) =>
      current === 'success' || current === 'empty' ? 'ready' : current,
    );
  }, []);

  const setFrom = useCallback(
    (value: string) => {
      setRange((current) => ({ ...current, from: value }));
      resetResult();
    },
    [resetResult],
  );

  const setTo = useCallback(
    (value: string) => {
      setRange((current) => ({ ...current, to: value }));
      resetResult();
    },
    [resetResult],
  );

  const generate = useCallback(async () => {
    if (!canGenerate) {
      return;
    }

    setStatus('generating');
    setErrorTitle(null);
    setErrorBody(null);
    setBlobs(null);
    setPreview(null);

    try {
      const result = await ExportService.generateSummary(range);
      setBlobs(result.blobs);
      setPreview(result.preview);
      setStatus('success');
    } catch (error) {
      if (
        isMirrorWellError(error) &&
        error.code === 'VALIDATION_FAILED' &&
        error.message === 'no sessions in export range'
      ) {
        setStatus('empty');
        return;
      }
      if (isMirrorWellError(error) && error.code === 'DB_UNAVAILABLE') {
        setErrorTitle(strings.errors.DB_UNAVAILABLE.title);
        setErrorBody(strings.errors.DB_UNAVAILABLE.body);
      } else {
        setErrorTitle(strings.errors.VALIDATION_FAILED.title);
        setErrorBody(strings.errors.VALIDATION_FAILED.body);
      }
      setStatus('error');
    }
  }, [canGenerate, range]);

  const downloadJson = useCallback(() => {
    if (!blobs) {
      return;
    }
    downloadBlob(blobs.json, `${filenameBase}.json`);
  }, [blobs, filenameBase]);

  const downloadHtml = useCallback(() => {
    if (!blobs) {
      return;
    }
    downloadBlob(blobs.html, `${filenameBase}.html`);
  }, [blobs, filenameBase]);

  return {
    status,
    range,
    settings,
    blobs,
    preview,
    filenameBase,
    errorTitle,
    errorBody,
    generatingAnnouncement,
    successAnnouncement,
    emptyAnnouncement,
    canGenerate,
    setFrom,
    setTo,
    generate,
    downloadJson,
    downloadHtml,
    headingId: EXPORT_HEADING_ID,
  };
}
