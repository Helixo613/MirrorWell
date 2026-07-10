// Placeholder root component. Route wiring lands in Task 13 (HomeScreen + route completion).
// The dev-only mounts below are dead code in production: import.meta.env.DEV is a compile-time
// false there, so esbuild eliminates these branches and the src/dev/ imports entirely from the
// bundle (same mechanism as src/log.ts's debug/info stripping). DebugHud is additionally gated
// at runtime by VITE_ENABLE_DEBUG_HUD (docs/ARCHITECTURE.md §9) — off by default even in dev.
import { CaptureHarness } from './dev/CaptureHarness';
import { DebugHud } from './dev/DebugHud';

export default function App() {
  return (
    <div>
      MirrorWell
      {import.meta.env.DEV && <CaptureHarness />}
      {import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_HUD === 'true' && <DebugHud />}
    </div>
  );
}
