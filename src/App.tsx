import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ScreenShell } from '@/components/layout/ScreenShell';
import { strings } from '@/config/strings';
import { AppStateProvider } from '@/context/AppStateContext';
import { CaregiverRoute } from '@/router/CaregiverRoute';
import { GateRoute, RootRedirect } from '@/router/RouteGuard';
import { OnboardingScreen } from '@/screens/onboarding/OnboardingScreen';
import { CalibrationScreen } from '@/screens/calibration/CalibrationScreen';
import { HomeScreen } from '@/screens/home/HomeScreen';
import { SessionScreen } from '@/screens/session/SessionScreen';
import { SummaryScreen } from '@/screens/summary/SummaryScreen';
import { ExportScreen } from '@/screens/export/ExportScreen';
import { SettingsScreen } from '@/screens/settings/SettingsScreen';
import { CaregiverScreen } from '@/screens/caregiver/CaregiverScreen';
import { DEFAULT_SETTINGS } from '@/types/app';

// Trends pulls in Recharts; keep it out of the initial route chunk.
const TrendsScreen = lazy(() =>
  import('@/screens/trends/TrendsScreen').then((module) => ({
    default: module.TrendsScreen,
  })),
);

function TrendsRouteFallback() {
  return (
    <ScreenShell textScale={DEFAULT_SETTINGS.textScale}>
      <p
        className="flex flex-1 items-center justify-center text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {strings.trends.loading}
      </p>
    </ScreenShell>
  );
}

// Product shell: AppStateProvider (hydrates from StorageService/SafetyGate) →
// BrowserRouter → route guards → the nine screens. All nine routes are registered
// here at Gate 0; the screen bodies are filled in by the S1/S2/S3 streams.
//
// Guard rules (FRONTEND §3, ARCH §12): every blocked route redirects to "/" and lets
// RootRedirect send the user to the correct home for their gate — UNATTESTED →
// /onboarding, ATTESTED → /home or /calibration, DEMO → /session. Redirecting through
// root (rather than a fixed screen) is what keeps DEMO out of everything but
// Session/Summary without a redirect loop. Caregiver additionally requires the
// caregiverViewEnabled consent (CaregiverRoute).
//
// /onboarding is the one exception: it admits DEMO as well, because it is demo's documented
// EXIT (API §17 "✅ (exits demo)", FRONTEND §1/§2.5 "ends at OnboardingScreen"). Admitting only
// UNATTESTED bounced the demo close-out back through RootRedirect to /session, making demo a
// one-way door until reload. OnboardingScreen clears the flag on mount (SafetyGate.exitDemoMode)
// and re-derives the gate, so a DEMO visitor is UNATTESTED again by its first effect.
function ProductApp() {
  return (
    <AppStateProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route
            path="/onboarding"
            element={
              <GateRoute allowed={['UNATTESTED', 'DEMO']} redirectTo="/">
                <OnboardingScreen />
              </GateRoute>
            }
          />
          <Route element={<GateRoute allowed={['ATTESTED']} redirectTo="/" />}>
            <Route path="/calibration" element={<CalibrationScreen />} />
            <Route path="/home" element={<HomeScreen />} />
            <Route
              path="/trends"
              element={
                <Suspense fallback={<TrendsRouteFallback />}>
                  <TrendsScreen />
                </Suspense>
              }
            />
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
            element={<GateRoute allowed={['ATTESTED', 'DEMO']} redirectTo="/" />}
          >
            <Route path="/session" element={<SessionScreen />} />
            <Route path="/summary" element={<SummaryScreen />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppStateProvider>
  );
}

function DevOnly({
  loader,
  componentProps,
}: {
  loader: () => Promise<{ default: ComponentType<{ cameraControls?: boolean }> }>;
  componentProps?: { cameraControls?: boolean };
}) {
  const Comp = lazy(loader);
  return (
    <Suspense fallback={null}>
      <Comp {...componentProps} />
    </Suspense>
  );
}

export function App() {
  // Dev-only harnesses are opt-in and DEV-gated; production (DEV=false) always renders
  // the product app and tree-shakes the entire src/dev/ graph. When a harness flag IS
  // set in dev, the product app is NOT mounted so the harness owns CaptureService's
  // single <video> element alone (ARCH §11 camera rule; every harness re-parents that
  // one element). The three camera harnesses are mutually exclusive by priority; the
  // DebugHud is an additive overlay.
  const liveDemo = import.meta.env.VITE_ENABLE_LIVE_DEMO === 'true';
  const liveV1 = import.meta.env.VITE_ENABLE_LIVE_V1_HARNESS === 'true';
  const captureHarness = import.meta.env.VITE_ENABLE_CAPTURE_HARNESS === 'true';
  const debugHud = import.meta.env.VITE_ENABLE_DEBUG_HUD === 'true';
  const devHarness = import.meta.env.DEV && (liveDemo || liveV1 || captureHarness);
  const showDebugHud = import.meta.env.DEV && debugHud;

  if (!devHarness) {
    return showDebugHud ? (
      <>
        <ProductApp />
        <DevOnly
          loader={() => import('./dev/DebugHud').then((m) => ({ default: m.DebugHud }))}
          componentProps={{ cameraControls: false }}
        />
      </>
    ) : (
      <ProductApp />
    );
  }

  return (
    <div>
      MirrorWell — dev harness
      {liveDemo ? (
        <DevOnly
          loader={() => import('./dev/LiveDemoView').then((m) => ({ default: m.LiveDemoView }))}
        />
      ) : liveV1 ? (
        <DevOnly
          loader={() => import('./dev/LiveV1Harness').then((m) => ({ default: m.LiveV1Harness }))}
        />
      ) : captureHarness ? (
        <DevOnly
          loader={() => import('./dev/CaptureHarness').then((m) => ({ default: m.CaptureHarness }))}
        />
      ) : null}
      {showDebugHud && (
        <DevOnly loader={() => import('./dev/DebugHud').then((m) => ({ default: m.DebugHud }))} />
      )}
    </div>
  );
}
