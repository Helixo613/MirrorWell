import { DateField } from '@/components/forms/DateField';
import { cn } from '@/lib/utils';

export interface DateRangeFieldsProps {
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  fromAriaLabel?: string;
  toAriaLabel?: string;
  groupLabel: string;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function DateRangeFields({
  fromId,
  toId,
  fromLabel,
  toLabel,
  fromAriaLabel,
  toAriaLabel,
  groupLabel,
  from,
  to,
  onFromChange,
  onToChange,
  disabled = false,
  className,
}: DateRangeFieldsProps) {
  const groupId = `${fromId}-group`;

  return (
    <fieldset
      className={cn('space-y-4', className)}
      aria-labelledby={groupId}
      disabled={disabled}
    >
      <legend id={groupId} className="text-sm font-medium text-muted-foreground">
        {groupLabel}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          id={fromId}
          label={fromLabel}
          value={from}
          max={to}
          ariaLabel={fromAriaLabel}
          disabled={disabled}
          onChange={onFromChange}
        />
        <DateField
          id={toId}
          label={toLabel}
          value={to}
          min={from}
          ariaLabel={toAriaLabel}
          disabled={disabled}
          onChange={onToChange}
        />
      </div>
    </fieldset>
  );
}
