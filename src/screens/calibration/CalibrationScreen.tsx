import { PlaceholderScreen } from '@/screens/PlaceholderScreen';
import { strings } from '@/config/strings';

// Gate 0 placeholder: registers + compiles the /calibration route. The full salvage body
// (CalibrationFlow wiring, qualityScore coaching retry, camera-release-on-unmount) is
// preserved at origin/sai-shanmukh-progress:src/screens/CalibrationScreen.tsx and its
// useCalibrationFlow / useCameraPipeline hooks. Stream S1 rebuilds it against main's
// CalibrationFlow (captureNeutral/captureComfortableMax/runNoiseFloorSelfTest/checkBaselineDrift)
// — see docs/superpowers/coordination/frontend-s1-requests.md.
export function CalibrationScreen() {
  return (
    <PlaceholderScreen
      title={strings.placeholders.calibration.title}
      body={strings.placeholders.calibration.body}
    />
  );
}
