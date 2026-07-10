import { useContext } from 'react';
import { AppStateContext } from '@/context/AppStateContext';
import type { AppStateContextValue } from '@/types/app';

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return ctx;
}
