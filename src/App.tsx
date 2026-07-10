import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppStateProvider } from '@/context/AppStateContext';
import { GateRoute, RootRedirect } from '@/router/RouteGuard';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { CalibrationScreen } from '@/screens/CalibrationScreen';
import { SessionScreen } from '@/screens/SessionScreen';

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
          </Route>
          <Route
            element={
              <GateRoute allowed={['ATTESTED', 'DEMO']} redirectTo="/onboarding" />
            }
          >
            <Route path="/session" element={<SessionScreen />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppStateProvider>
  );
}
