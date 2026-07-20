import { cn } from '@/lib/utils';

export interface ToggleSettingRowProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function ToggleSettingRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  className,
}: ToggleSettingRowProps) {
  const labelId = `${id}-label`;
  const descriptionId = description ? `${id}-desc` : undefined;

  return (
    <div
      className={cn(
        'flex min-h-touch items-start justify-between gap-4 px-5 py-4 sm:px-6',
        className,
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <span id={labelId} className="block text-base leading-snug text-foreground">
          {label}
        </span>
        {description ? (
          <p id={descriptionId} className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        disabled={disabled}
        className={cn(
          'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border-2 border-transparent transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          checked ? 'bg-primary' : 'bg-muted',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          'motion-reduce:transition-none',
        )}
        onClick={() => onCheckedChange(!checked)}
      >
        <span
          aria-hidden
          className={cn(
            'pointer-events-none block h-6 w-6 rounded-full bg-background shadow-sm transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
            'motion-reduce:transition-none',
          )}
        />
      </button>
    </div>
  );
}
