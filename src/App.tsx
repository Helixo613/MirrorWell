import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ScreenShell } from '@/components/layout/ScreenShell';
import { strings } from '@/config/strings';
import { AppStateProvider } from '@/context/AppStateContext';
import { CaregiverRoute } from '@/router/CaregiverRoute';
import { GateRoute, RootRedirect } from '@/router/RouteGuard';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { CalibrationScreen } from '@/screens/CalibrationScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { SessionScreen } from '@/screens/SessionScreen';
import { SummaryScreen } from '@/screens/SummaryScreen';
import { ExportScreen } from '@/screens/ExportScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { CaregiverScreen } from '@/screens/SecondaryScreens';
import { DEFAULT_SETTINGS } from '@/types/app';

const TrendsScreen = lazy(() =>
  import('@/screens/TrendsScreen').then((module) => ({
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

export function App() {
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
          <Route
            element={
              <GateRoute allowed={['ATTESTED']} redirectTo="/onboarding" />
            }
          >
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
            element={
              <GateRoute allowed={['ATTESTED', 'DEMO']} redirectTo="/onboarding" />
            }
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
