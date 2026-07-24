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
  voiceCoachEnabled: false,
  voiceName: undefined,
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

  it('does not share unset defaults between get calls', async () => {
    const settings = await SettingsService.get();
    settings.highContrast = true;

    expect(await SettingsService.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('defaults voice settings for a legacy stored settings row', async () => {
    const { voiceCoachEnabled: _, voiceName: __, ...legacySettings } = {
      ...DEFAULT_SETTINGS,
      highContrast: true,
    };
    await db
      .table<Omit<AppSettings, 'voiceCoachEnabled'>, string>('app_settings')
      .put(legacySettings);

    expect(await SettingsService.get()).toEqual({
      ...DEFAULT_SETTINGS,
      highContrast: true,
    });
  });

  it('merges a partial update and persists it', async () => {
    const updated = await SettingsService.update({
      caregiverViewEnabled: true,
      textScale: 1.5,
      voiceCoachEnabled: true,
      voiceName: 'Natural Voice',
    });

    expect(updated).toEqual({
      ...DEFAULT_SETTINGS,
      caregiverViewEnabled: true,
      textScale: 1.5,
      voiceCoachEnabled: true,
      voiceName: 'Natural Voice',
    });
    expect(await SettingsService.get()).toEqual(updated);
  });

  it('rejects unknown update keys', async () => {
    await expect(
      SettingsService.update({ unknown: true } as unknown as Partial<AppSettings>),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects settingsId updates', async () => {
    await expect(SettingsService.update({ settingsId: 'other' } as any)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
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
