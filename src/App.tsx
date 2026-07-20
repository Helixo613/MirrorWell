// Placeholder root component. Route wiring lands in Task 13 (HomeScreen + route completion).
// Dev-only mounts use dynamic import() inside `import.meta.env.DEV` branches so production
// builds drop the entire src/dev/ graph (static imports are hoisted and would ship harness
// strings into the prod bundle — B8 verification forbids that).
import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppStateProvider } from '@/context/AppStateContext';
import { CaregiverRoute } from '@/router/CaregiverRoute';
import { GateRoute, RootRedirect } from '@/router/RouteGuard';
import { CalibrationScreen } from '@/screens/CalibrationScreen';
import { ExportScreen } from '@/screens/ExportScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { CaregiverScreen } from '@/screens/SecondaryScreens';
import { SessionScreen } from '@/screens/SessionScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { SummaryScreen } from '@/screens/SummaryScreen';
import { TrendsScreen } from '@/screens/TrendsScreen';

function DevOnly({ loader }: { loader: () => Promise<{ default: ComponentType }> }) {
  const Comp = lazy(loader);
  return (
    <Suspense fallback={null}>
      <Comp />
    </Suspense>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route
            path="/onboarding"
            element={
              <GateRoute allowed={['UNATTESTED']} redirectTo="/calibration">
                <OnboardingScreen />
              </GateRoute>
            }
          />
          <Route element={<GateRoute allowed={['ATTESTED']} redirectTo="/onboarding" />}>
            <Route path="/calibration" element={<CalibrationScreen />} />
            <Route path="/home" element={<HomeScreen />} />
            <Route path="/trends" element={<TrendsScreen />} />
            <Route path="/export" element={<ExportScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route
              path="/caregiver"
              element={
                <CaregiverRoute>
                  <CaregiverScreen />
                </CaregiverRoute>
              }
            />
          </Route>
          <Route
            element={<GateRoute allowed={['ATTESTED', 'DEMO']} redirectTo="/onboarding" />}
          >
            <Route path="/session" element={<SessionScreen />} />
            <Route path="/summary" element={<SummaryScreen />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <>
        {import.meta.env.DEV && (
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
      </>
    </AppStateProvider>
  );
}
