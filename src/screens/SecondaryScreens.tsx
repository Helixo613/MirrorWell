import { strings } from '@/config/strings';
import { PlaceholderScreen } from '@/screens/PlaceholderScreen';

export function CaregiverScreen() {
  return (
    <PlaceholderScreen
      title={strings.placeholders.caregiver.title}
      body={strings.placeholders.caregiver.body}
    />
  );
}
