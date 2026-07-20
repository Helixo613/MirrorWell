import { Navigate } from 'react-router-dom';
import { useAppState } from '@/context/useAppState';
import type { ReactNode } from 'react';

export function CaregiverRoute({ children }: { children: ReactNode }) {
  const { settings } = useAppState();

  if (!settings.caregiverViewEnabled) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
}
