import { strings } from '@/config/strings';
import type { AppSettings } from '@/types/app';

export type EditableAppSettingKey = Exclude<
  keyof AppSettings,
  'settingsId' | 'noiseFloorSymmetry'
>;

export function settingLabelFor(key: EditableAppSettingKey): string {
  switch (key) {
    case 'highContrast':
      return strings.settings.display.highContrast.label;
    case 'textScale':
      return strings.settings.display.textScale.label;
    case 'reducedFacePreview':
      return strings.settings.display.reducedFacePreview.label;
    case 'showAffectedSideMarker':
      return strings.settings.display.showAffectedSideMarker.label;
    case 'hapticsEnabled':
      return strings.settings.cues.haptics.label;
    case 'audioCuesEnabled':
      return strings.settings.cues.audio.label;
    case 'trendGranularity':
      return strings.settings.trends.granularityLabel;
    case 'caregiverViewEnabled':
      return strings.settings.sharing.caregiver.label;
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}
