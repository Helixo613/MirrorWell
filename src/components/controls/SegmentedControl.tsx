import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  ariaLabel?: string;
}

export interface SegmentedControlProps<T extends string> {
  label: string;
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
  disabled = false,
}: SegmentedControlProps<T>) {
  const groupId = `${label.replace(/\s+/g, '-').toLowerCase()}-group`;
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusOption = (index: number) => {
    buttonRefs.current[index]?.focus();
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex = index;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % options.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + options.length) % options.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = options.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    onChange(options[nextIndex].value);
    focusOption(nextIndex);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <span id={groupId} className="text-sm font-medium text-muted-foreground">
        {label}
      </span>
      <div
        role="tablist"
        aria-labelledby={groupId}
        className="flex flex-wrap gap-2"
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={option.ariaLabel ?? option.label}
              tabIndex={selected ? 0 : -1}
              disabled={disabled}
              className={cn(
                'min-h-touch rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                selected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
              )}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
