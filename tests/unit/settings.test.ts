import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/data/schema.ts';
import type { AppSettings } from '../../src/data/schema.ts';
import { SettingsService } from '../../src/data/settings.ts';

const DEFAULT_SETTINGS: AppSettings = {
  settingsId: 'singleton',
  highContrast: false,
  textScale: 1.0,
  hapticsEnabled: true,
  audioCuesEnabled: true,
  reducedFacePreview: false,
  trendGranularity: 'monthly',
  showAffectedSideMarker: true,
  caregiverViewEnabled: false,
};

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('SettingsService', () => {
  it('returns documented defaults when app_settings is unset', async () => {
    expect(await SettingsService.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges a partial update and persists it', async () => {
    const updated = await SettingsService.update({ caregiverViewEnabled: true, textScale: 1.5 });

    expect(updated).toEqual({ ...DEFAULT_SETTINGS, caregiverViewEnabled: true, textScale: 1.5 });
    expect(await SettingsService.get()).toEqual(updated);
  });

  it('rejects unknown update keys', async () => {
    await expect(
      SettingsService.update({ unknown: true } as unknown as Partial<AppSettings>),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects textScale above 2.0', async () => {
    await expect(SettingsService.update({ textScale: 2.5 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('rejects an invalid trendGranularity', async () => {
    await expect(
      SettingsService.update({ trendGranularity: 'daily' as AppSettings['trendGranularity'] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
