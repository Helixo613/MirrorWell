import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface CheckboxOption<T extends string> {
  id: T;
  label: string;
  description?: string;
}

export interface CheckboxGroupProps<T extends string> {
  options: readonly CheckboxOption<T>[];
  values: ReadonlySet<T>;
  onToggle: (id: T, checked: boolean) => void;
  name: string;
  className?: string;
  disabled?: boolean;
}

export function CheckboxGroup<T extends string>({
  options,
  values,
  onToggle,
  name,
  className,
  disabled = false,
}: CheckboxGroupProps<T>) {
  return (
    <fieldset className={cn('space-y-4', className)} disabled={disabled}>
      <legend className="sr-only">{name}</legend>
      {options.map((option) => {
        const checked = values.has(option.id);
        const inputId = `${name}-${option.id}`;
        return (
          <div
            key={option.id}
            className={cn(
              'flex min-h-touch items-start gap-3 rounded-lg border border-border bg-card p-5 transition-colors sm:p-6',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
              checked && 'border-primary/40 bg-primary/5',
            )}
          >
            <Checkbox
              id={inputId}
              checked={checked}
              onCheckedChange={(value) => onToggle(option.id, value === true)}
              disabled={disabled}
              className="mt-0.5"
              aria-describedby={
                option.description ? `${inputId}-desc` : undefined
              }
            />
            <div className="flex-1 space-y-1">
              <Label
                htmlFor={inputId}
                className="block cursor-pointer font-normal leading-snug"
              >
                {option.label}
              </Label>
              {option.description ? (
                <p
                  id={`${inputId}-desc`}
                  className="text-sm text-muted-foreground"
                >
                  {option.description}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
