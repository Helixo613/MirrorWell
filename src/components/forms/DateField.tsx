import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface DateFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
}

export function DateField({
  id,
  label,
  value,
  onChange,
  ariaLabel,
  min,
  max,
  disabled = false,
  className,
}: DateFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
