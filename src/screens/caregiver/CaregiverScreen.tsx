import { strings } from '@/config/strings';
import { PlaceholderScreen } from '@/screens/PlaceholderScreen';

// Gate 0 stub: routes and compiles. S3 (longitudinal & export) builds the real
// read-only caregiver summary behind this already-registered /caregiver route.
export function CaregiverScreen() {
  return (
    <PlaceholderScreen
      title={strings.placeholders.caregiver.title}
      body={strings.placeholders.caregiver.body}
    />
  );
}
