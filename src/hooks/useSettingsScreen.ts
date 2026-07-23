import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { strings } from '@/config/strings';
import { thresholds } from '@/config/thresholds';
import { useAppState } from '@/context/useAppState';
import { MirrorWellError } from '@/data/errors';
import { SettingsService } from '@/data/settings';
import { StorageService } from '@/data/storage';
import { isHapticsAvailable } from '@/lib/deviceCapabilities';
import { settingLabelFor, type EditableAppSettingKey } from '@/lib/settingLabels';
import type { AppSettings } from '@/types/app';
import { DEFAULT_SETTINGS } from '@/types/app';
import type { DeleteDataPhase, SettingsScreenStatus } from '@/types/settingsScreen';
import { SETTINGS_HEADING_ID } from '@/types/settingsScreen';

export interface UseSettingsScreenResult {
  status: SettingsScreenStatus;
  settings: AppSettings;
  nickname: string;
  motivation: string;
  setNickname: (value: string) => void;
  setMotivation: (value: string) => void;
  saveProfileFields: () => Promise<void>;
  hapticsAvailable: boolean;
  isSaving: boolean;
  errorMessage: string | null;
  deletePhase: DeleteDataPhase;
  saveFeedback: string | null;
  savingAnnouncement: string;
  saveSuccessAnnouncement: string;
  deleteAnnouncement: string;
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => Promise<void>;
  openDeleteDialog: () => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<void>;
  headingId: string;
}

export function useSettingsScreen(): UseSettingsScreenResult {
  const navigate = useNavigate();
  const {
    profile,
    setProfile,
    setActiveBaseline,
    setSettings: setGlobalSettings,
    setGate,
  } = useAppState();

  const [status, setStatus] = useState<SettingsScreenStatus>('loading');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [nickname, setNickname] = useState('');
  const [motivation, setMotivation] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletePhase, setDeletePhase] = useState<DeleteDataPhase>('idle');
  const [hapticsAvailable, setHapticsAvailable] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [savingAnnouncement, setSavingAnnouncement] = useState('');
  const [saveSuccessAnnouncement, setSaveSuccessAnnouncement] = useState('');
  const [deleteAnnouncement, setDeleteAnnouncement] = useState('');
  const saveFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setHapticsAvailable(isHapticsAvailable());
  }, []);

  useEffect(() => {
    setNickname(profile?.nickname ?? '');
    setMotivation(profile?.motivation ?? '');
  }, [profile?.nickname, profile?.motivation]);

  useEffect(() => {
    let cancelled = false;

    async function boot(): Promise<void> {
      try {
        const loaded = await SettingsService.get();
        if (cancelled) {
          return;
        }
        setSettings(loaded);
        setGlobalSettings(loaded);
        setStatus('ready');
      } catch {
        if (cancelled) {
          return;
        }
        setStatus('error');
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [setGlobalSettings]);

  const saveProfileFields = useCallback(async () => {
    if (!profile) {
      setErrorMessage(strings.settings.a11y.updateFailed);
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setSavingAnnouncement(strings.settings.saving);
    try {
      const next = {
        ...profile,
        nickname: nickname.trim() || undefined,
        motivation: motivation.trim() || undefined,
      };
      await StorageService.saveProfile(next);
      setProfile(next);
      setSaveFeedback(strings.settings.profile.saved);
      setSaveSuccessAnnouncement(strings.settings.profile.saved);
      if (saveFeedbackTimerRef.current !== null) {
        clearTimeout(saveFeedbackTimerRef.current);
      }
      saveFeedbackTimerRef.current = setTimeout(() => {
        setSaveFeedback(null);
        saveFeedbackTimerRef.current = null;
      }, thresholds.settings.saveFeedbackDismissMs);
    } catch (error) {
      if (error instanceof MirrorWellError && error.code === 'VALIDATION_FAILED') {
        setErrorMessage(error.message);
      } else if (error instanceof MirrorWellError && error.code === 'DB_UNAVAILABLE') {
        setErrorMessage(strings.errors.DB_UNAVAILABLE.body);
      } else {
        setErrorMessage(strings.settings.a11y.updateFailed);
      }
    } finally {
      setIsSaving(false);
      setSavingAnnouncement('');
    }
  }, [motivation, nickname, profile, setProfile]);

  useEffect(() => {
    if (status === 'ready') {
      const heading = document.getElementById(SETTINGS_HEADING_ID);
      heading?.focus({ preventScroll: true });
    }
  }, [status]);

  useEffect(() => {
    return () => {
      if (saveFeedbackTimerRef.current !== null) {
        clearTimeout(saveFeedbackTimerRef.current);
      }
    };
  }, []);

  const showSaveFeedback = useCallback((key: EditableAppSettingKey) => {
    const label = settingLabelFor(key);
    setSaveFeedback(strings.settings.saved(label));
    setSaveSuccessAnnouncement(strings.settings.savedAnnouncement(label));

    if (saveFeedbackTimerRef.current !== null) {
      clearTimeout(saveFeedbackTimerRef.current);
    }

    saveFeedbackTimerRef.current = setTimeout(() => {
      setSaveFeedback(null);
      saveFeedbackTimerRef.current = null;
    }, thresholds.settings.saveFeedbackDismissMs);
  }, []);

  const updateSetting = useCallback(
    async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setIsSaving(true);
      setErrorMessage(null);
      setSavingAnnouncement(strings.settings.saving);
      setSaveSuccessAnnouncement('');
      const previous = settings[key];

      setSettings((current) => ({ ...current, [key]: value }));

      try {
        const updated = await SettingsService.update({ [key]: value });
        setSettings(updated);
        setGlobalSettings(updated);
        if (key !== 'settingsId') {
          showSaveFeedback(key);
        }
      } catch (error) {
        setSettings((current) => ({ ...current, [key]: previous }));
        if (error instanceof MirrorWellError && error.code === 'DB_UNAVAILABLE') {
          setErrorMessage(strings.errors.DB_UNAVAILABLE.body);
        } else {
          setErrorMessage(strings.settings.a11y.updateFailed);
        }
      } finally {
        setIsSaving(false);
        setSavingAnnouncement('');
      }
    },
    [settings, setGlobalSettings, showSaveFeedback],
  );

  const openDeleteDialog = useCallback(() => {
    setDeletePhase('confirm');
  }, []);

  const cancelDelete = useCallback(() => {
    setDeletePhase('idle');
    setDeleteAnnouncement('');
  }, []);

  const confirmDelete = useCallback(async () => {
    setDeletePhase('deleting');
    setDeleteAnnouncement(strings.settings.delete.deleting);
    setErrorMessage(null);

    try {
      await StorageService.deleteAllData();
      setProfile(null);
      setActiveBaseline(null);
      setGlobalSettings(DEFAULT_SETTINGS);
      setGate('UNATTESTED');
      navigate('/onboarding', { replace: true });
    } catch (error) {
      setDeletePhase('confirm');
      setDeleteAnnouncement('');
      if (error instanceof MirrorWellError && error.code === 'DB_UNAVAILABLE') {
        setErrorMessage(strings.errors.DB_UNAVAILABLE.body);
      } else {
        setErrorMessage(strings.settings.a11y.updateFailed);
      }
    }
  }, [navigate, setActiveBaseline, setGate, setGlobalSettings, setProfile]);

  return {
    status,
    settings,
    nickname,
    motivation,
    setNickname,
    setMotivation,
    saveProfileFields,
    hapticsAvailable,
    isSaving,
    errorMessage,
    deletePhase,
    saveFeedback,
    savingAnnouncement,
    saveSuccessAnnouncement,
    deleteAnnouncement,
    updateSetting,
    openDeleteDialog,
    cancelDelete,
    confirmDelete,
    headingId: SETTINGS_HEADING_ID,
  };
}
