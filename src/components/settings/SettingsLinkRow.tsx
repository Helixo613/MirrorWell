import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface SettingsLinkRowProps {
  to: string;
  label: string;
  description?: string;
  ariaLabel?: string;
  className?: string;
}

export function SettingsLinkRow({
  to,
  label,
  description,
  ariaLabel,
  className,
}: SettingsLinkRowProps) {
  return (
    <Link
      to={to}
      aria-label={ariaLabel ?? label}
      className={cn(
        'flex min-h-touch flex-col justify-center gap-1 px-5 py-4 text-left sm:px-6',
        'transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        className,
      )}
    >
      <span className="text-base font-medium leading-snug text-foreground">{label}</span>
      {description ? (
        <span className="text-sm leading-relaxed text-muted-foreground">{description}</span>
      ) : null}
    </Link>
  );
}
