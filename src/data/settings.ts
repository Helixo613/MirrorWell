import { db } from '@/data/schema';
import { MirrorWellError } from '@/data/errors';
import { SafetyGate } from '@/session/safety';
import { DEFAULT_SETTINGS, type AppSettings } from '@/types/app';
import type { AppSettingsRow } from '@/data/schema';

async function openDb(): Promise<void> {
  try {
    if (!db.isOpen()) {
      await db.open();
    }
  } catch {
    throw new MirrorWellError(
      'DB_UNAVAILABLE',
      'Failed to open mirrorwell_db',
      false,
    );
  }
}

function rowToSettings(row: AppSettingsRow): AppSettings {
  return { ...row };
}

function validatePartial(partial: Partial<AppSettings>): void {
  if (
    partial.textScale !== undefined &&
    (partial.textScale < 1 || partial.textScale > 2)
  ) {
    throw new MirrorWellError(
      'VALIDATION_FAILED',
      'textScale must be between 1.0 and 2.0',
      true,
    );
  }
  if (
    partial.noiseFloorSymmetry !== undefined &&
    (!Number.isFinite(partial.noiseFloorSymmetry) ||
      partial.noiseFloorSymmetry <= 0)
  ) {
    throw new MirrorWellError(
      'VALIDATION_FAILED',
      'noiseFloorSymmetry must be finite and > 0',
      true,
    );
  }
}

export const SettingsService = {
  async get(): Promise<AppSettings> {
    await openDb();
    const row = await db.app_settings.get('singleton');
    if (!row) {
      await db.app_settings.put({ ...DEFAULT_SETTINGS });
      return { ...DEFAULT_SETTINGS };
    }
    return rowToSettings(row);
  },

  async update(partial: Partial<AppSettings>): Promise<AppSettings> {
    if (SafetyGate.isDemoMode()) {
      throw new MirrorWellError(
        'VALIDATION_FAILED',
        'demo mode is read-only',
        true,
      );
    }
    validatePartial(partial);
    await openDb();
    const current = await SettingsService.get();
    const next: AppSettingsRow = {
      ...current,
      ...partial,
      settingsId: 'singleton',
    };
    await db.app_settings.put(next);
    return rowToSettings(next);
  },
};
