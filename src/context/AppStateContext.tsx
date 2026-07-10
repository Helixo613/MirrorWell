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
import type { UserProfile } from '@/data/schema';
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type AppStateContextValue,
  type GateState,
} from '@/types/app';

export const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [gate, setGateState] = useState<GateState>('UNATTESTED');
  const [settings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void hydrateAppState().then((state) => {
      if (cancelled) {
        return;
      }
      setProfileState(state.profile);
      setGateState(SafetyGate.isDemoMode() ? 'DEMO' : state.gate);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setProfile = useCallback((next: UserProfile) => {
    setProfileState(next);
  }, []);

  const setGate = useCallback((next: GateState) => {
    setGateState(next);
  }, []);

  const value = useMemo<AppStateContextValue>(
    () => ({
      profile,
      activeBaseline: null,
      settings,
      gate,
      setProfile,
      setGate,
    }),
    [profile, settings, gate, setProfile, setGate],
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
