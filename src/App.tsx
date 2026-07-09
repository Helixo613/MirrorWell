// Placeholder root component. Route wiring lands in Task 13 (HomeScreen + route completion).
// The dev-only CaptureHarness mount below is dead code in production: import.meta.env.DEV is
// a compile-time false there, so esbuild eliminates this branch and the src/dev/ import
// entirely from the bundle (same mechanism as src/log.ts's debug/info stripping).
import { CaptureHarness } from './dev/CaptureHarness';

export default function App() {
  return (
    <div>
      MirrorWell
      {import.meta.env.DEV && <CaptureHarness />}
    </div>
  );
}
