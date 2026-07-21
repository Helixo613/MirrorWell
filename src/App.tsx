// Placeholder root component. Route wiring lands in Task 13 (HomeScreen + route completion).
// Dev-only mounts use dynamic import() inside `import.meta.env.DEV` branches so production
// builds drop the entire src/dev/ graph (static imports are hoisted and would ship harness
// strings into the prod bundle — B8 verification forbids that).
import { lazy, Suspense, type ComponentType } from 'react';

function DevOnly({ loader }: { loader: () => Promise<{ default: ComponentType }> }) {
  const Comp = lazy(loader);
  return (
    <Suspense fallback={null}>
      <Comp />
    </Suspense>
  );
}

export default function App() {
  // Every dev harness re-parents CaptureService's single <video>, so the live demo and the V1
  // protocol harness are mutually exclusive: VITE_ENABLE_LIVE_DEMO=true swaps the default
  // harness for the demo readout rather than mounting both and leaving one preview black.
  const liveDemo = import.meta.env.VITE_ENABLE_LIVE_DEMO === 'true';
  return (
    <div>
      MirrorWell
      {import.meta.env.DEV && liveDemo && (
        <DevOnly
          loader={() => import('./dev/LiveDemoView').then((m) => ({ default: m.LiveDemoView }))}
        />
      )}
      {import.meta.env.DEV && !liveDemo && (
        <DevOnly
          loader={() =>
            import('./dev/LiveV1Harness').then((m) => ({ default: m.LiveV1Harness }))
          }
        />
      )}
      {/* CaptureHarness and LiveV1Harness both re-parent CaptureService's single <video>
          element — mounting both leaves one preview black. Opt-in via env flag. */}
      {import.meta.env.DEV && import.meta.env.VITE_ENABLE_CAPTURE_HARNESS === 'true' && (
        <DevOnly
          loader={() =>
            import('./dev/CaptureHarness').then((m) => ({ default: m.CaptureHarness }))
          }
        />
      )}
      {import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_HUD === 'true' && (
        <DevOnly
          loader={() => import('./dev/DebugHud').then((m) => ({ default: m.DebugHud }))}
        />
      )}
    </div>
  );
}
