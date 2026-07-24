import type { AppSettings } from './schema.ts';
import { MirrorWellError } from './errors.ts';
import { StorageService } from './storage.ts';

const DEFAULT_SETTINGS: AppSettings = {
  settingsId: 'singleton',
  highContrast: false,
  textScale: 1.0,
  hapticsEnabled: true,
  audioCuesEnabled: true,
  voiceCoachEnabled: false,
  reducedFacePreview: false,
  trendGranularity: 'monthly',
  showAffectedSideMarker: true,
  caregiverViewEnabled: false,
  remindersEnabled: false,
  reminderTime: '09:00',
};

/** 'HH:MM' in 24-hour local time. */
const REMINDER_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const SETTINGS_KEYS = new Set<keyof AppSettings>([
  'highContrast',
  'textScale',
  'hapticsEnabled',
  'audioCuesEnabled',
  'voiceCoachEnabled',
  'reducedFacePreview',
  'trendGranularity',
  'showAffectedSideMarker',
  'caregiverViewEnabled',
  'remindersEnabled',
  'reminderTime',
]);

function assertSettings(settings: AppSettings): void {
  if (!Number.isFinite(settings.textScale) || settings.textScale < 1.0 || settings.textScale > 2.0) {
    throw new MirrorWellError('VALIDATION_FAILED', 'textScale must be in [1.0..2.0]');
  }
  if (settings.trendGranularity !== 'weekly' && settings.trendGranularity !== 'monthly') {
    throw new MirrorWellError('VALIDATION_FAILED', 'invalid trendGranularity');
  }
  if (!REMINDER_TIME_PATTERN.test(settings.reminderTime)) {
    throw new MirrorWellError('VALIDATION_FAILED', 'reminderTime must be HH:MM in 24-hour time');
  }
}

async function get(): Promise<AppSettings> {
  return { ...DEFAULT_SETTINGS, ...(await StorageService.getSettings()) };
}

export const SettingsService = {
  get,
  async update(partial: Partial<AppSettings>): Promise<AppSettings> {
    if (Object.keys(partial).some((key) => !SETTINGS_KEYS.has(key as keyof AppSettings))) {
      throw new MirrorWellError('VALIDATION_FAILED', 'unknown settings key');
    }

    const settings = { ...(await get()), ...partial };
    assertSettings(settings);
    await StorageService.saveSettings(settings);
    return settings;
  },
};
