import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface QuietNavLinkProps {
  to: string;
  label: string;
  ariaLabel?: string;
  className?: string;
}

export function QuietNavLink({
  to,
  label,
  ariaLabel,
  className,
}: QuietNavLinkProps) {
  return (
    <Link
      to={to}
      aria-label={ariaLabel ?? label}
      className={cn(
        'flex min-h-touch items-center justify-center px-4 py-3 text-base text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
    >
      {label}
    </Link>
  );
}
