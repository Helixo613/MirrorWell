import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { hydrateAppState } from '@/context/hydrateAppState';
import { SafetyGate } from '@/session/safety';
import { strings } from '@/config/strings';
import type { CalibrationBaseline, UserProfile } from '@/data/schema';
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type AppStateContextValue,
  type GateState,
} from '@/types/app';

export const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [activeBaseline, setActiveBaselineState] =
    useState<CalibrationBaseline | null>(null);
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [gate, setGateState] = useState<GateState>('UNATTESTED');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void hydrateAppState().then((state) => {
      if (cancelled) {
        return;
      }
      setProfileState(state.profile);
      setActiveBaselineState(state.activeBaseline);
      setSettingsState(state.settings);
      setGateState(SafetyGate.isDemoMode() ? 'DEMO' : state.gate);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setProfile = useCallback((next: UserProfile | null) => {
    setProfileState(next);
  }, []);

  const setGate = useCallback((next: GateState) => {
    setGateState(next);
  }, []);

  const setActiveBaseline = useCallback((next: CalibrationBaseline | null) => {
    setActiveBaselineState(next);
  }, []);

  const setSettings = useCallback((next: AppSettings) => {
    setSettingsState(next);
  }, []);

  const value = useMemo<AppStateContextValue>(
    () => ({
      profile,
      activeBaseline,
      settings,
      gate,
      setProfile,
      setGate,
      setActiveBaseline,
      setSettings,
    }),
    [
      profile,
      activeBaseline,
      settings,
      gate,
      setProfile,
      setGate,
      setActiveBaseline,
      setSettings,
    ],
  );

  if (!hydrated) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-muted-foreground">
        {strings.app.loading}
      </main>
    );
  }

  return (
    <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
  );
}
