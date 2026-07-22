import { PlaceholderScreen } from '@/screens/PlaceholderScreen';
import { strings } from '@/config/strings';

// Gate 0 placeholder: registers + compiles the /session route. The full salvage body
// (FeedbackRenderer, rep counter, rest timer, demo quick-setup) is preserved at
// origin/sai-shanmukh-progress:src/screens/SessionScreen.tsx and its useSessionScreen hook.
// Stream S1 rebuilds it against main's SessionController (7 events incl. qualityOfferStop) —
// see docs/superpowers/coordination/frontend-s1-requests.md.
export function SessionScreen() {
  return (
    <PlaceholderScreen
      title={strings.placeholders.session.title}
      body={strings.placeholders.session.body}
    />
  );
}
