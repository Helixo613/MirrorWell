import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppState } from '@/context/useAppState';
import type { GateState } from '@/types/app';

interface GateRouteProps {
  allowed: GateState[];
  redirectTo: string;
  children?: ReactNode;
}

export function GateRoute({ allowed, redirectTo, children }: GateRouteProps) {
  const { gate } = useAppState();
  const location = useLocation();

  if (!allowed.includes(gate)) {
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export function RootRedirect() {
  const { gate, activeBaseline } = useAppState();

  if (gate === 'ATTESTED') {
    return (
      <Navigate
        to={activeBaseline ? '/home' : '/calibration'}
        replace
      />
    );
  }
  if (gate === 'DEMO') {
    return <Navigate to="/session" replace />;
  }
  return <Navigate to="/onboarding" replace />;
}
