import { strings } from '@/config/strings';
import { PlaceholderScreen } from '@/screens/PlaceholderScreen';

export function TrendsScreen() {
  return (
    <PlaceholderScreen
      title={strings.placeholders.trends.title}
      body={strings.placeholders.trends.body}
    />
  );
}

export function ExportScreen() {
  return (
    <PlaceholderScreen
      title={strings.placeholders.export.title}
      body={strings.placeholders.export.body}
    />
  );
}

export function SettingsScreen() {
  return (
    <PlaceholderScreen
      title={strings.placeholders.settings.title}
      body={strings.placeholders.settings.body}
    />
  );
}

export function CaregiverScreen() {
  return (
    <PlaceholderScreen
      title={strings.placeholders.caregiver.title}
      body={strings.placeholders.caregiver.body}
    />
  );
}
