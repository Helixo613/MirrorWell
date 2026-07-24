import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { strings } from '@/config/strings';
import { useAppState } from '@/context/useAppState';

export interface AppShellProps {
  children: ReactNode;
}

interface ShellNavItem {
  to: string;
  label: string;
  ariaLabel: string;
}

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex min-h-touch flex-1 items-center justify-center rounded-md px-3 py-2 text-center text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:flex-none lg:justify-start lg:px-4 lg:py-3 lg:text-base',
    isActive && 'text-foreground font-medium bg-secondary/40',
  );

/**
 * Hub shell: sidebar nav at lg+ (1024px), bottom tab bar below it. Wraps only the
 * hub screens (Home/Trends/Export/Settings/Caregiver, FRONTEND §1 nav map) — Onboarding,
 * Calibration, and the Session/Summary flow are never mounted inside this shell, so
 * the session stage stays chrome-free without any phase-aware toggle here.
 */
export function AppShell({ children }: AppShellProps) {
  const { settings } = useAppState();

  const items: ShellNavItem[] = [
    { to: '/home', label: strings.home.nav.home, ariaLabel: strings.home.nav.homeAriaLabel },
    { to: '/trends', label: strings.home.nav.trends, ariaLabel: strings.home.nav.trendsAriaLabel },
    { to: '/export', label: strings.home.nav.export, ariaLabel: strings.home.nav.exportAriaLabel },
    { to: '/settings', label: strings.home.nav.settings, ariaLabel: strings.home.nav.settingsAriaLabel },
  ];
  if (settings.caregiverViewEnabled) {
    items.push({
      to: '/caregiver',
      label: strings.home.nav.caregiver,
      ariaLabel: strings.home.nav.caregiverAriaLabel,
    });
  }

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden lg:flex lg:w-56 lg:shrink-0 lg:flex-col lg:gap-1 lg:border-r lg:border-border/60 lg:p-sm">
        <nav aria-label={strings.home.nav.primaryLabel} className="flex flex-col gap-1">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} aria-label={item.ariaLabel} className={navLinkClassName}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0">{children}</div>

      <nav
        aria-label={strings.home.nav.primaryLabel}
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border/60 bg-background/95 px-1 pb-[max(0px,env(safe-area-inset-bottom))] backdrop-blur-sm lg:hidden"
      >
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} aria-label={item.ariaLabel} className={navLinkClassName}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
