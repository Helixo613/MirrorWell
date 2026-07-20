import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { thresholds } from '@/config/thresholds';
import { strings } from '@/config/strings';
import { cn } from '@/lib/utils';

export interface TextScaleControlProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

function clampTextScale(value: number): number {
  const { textScaleMin, textScaleMax, textScaleStep } = thresholds.settings;
  const stepped = Math.round(value / textScaleStep) * textScaleStep;
  return Math.min(textScaleMax, Math.max(textScaleMin, stepped));
}

export function TextScaleControl({
  value,
  onChange,
  disabled = false,
  className,
}: TextScaleControlProps) {
  const { textScaleMin, textScaleMax, textScaleStep } = thresholds.settings;
  const pct = Math.round(value * 100);
  const atMin = value <= textScaleMin;
  const atMax = value >= textScaleMax;

  const adjust = (delta: number) => {
    onChange(clampTextScale(value + delta));
  };

  return (
    <div className={cn('space-y-4 px-5 py-4 sm:px-6', className)}>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="settings-text-scale" className="font-normal leading-snug">
          {strings.settings.display.textScale.label}
        </Label>
        <span className="text-base tabular-nums text-muted-foreground" aria-hidden>
          {strings.settings.display.textScale.value(pct)}
        </span>
      </div>

      <input
        id="settings-text-scale"
        type="range"
        min={textScaleMin}
        max={textScaleMax}
        step={textScaleStep}
        value={value}
        disabled={disabled}
        aria-label={strings.settings.display.textScale.sliderAriaLabel}
        aria-valuemin={textScaleMin * 100}
        aria-valuemax={textScaleMax * 100}
        aria-valuenow={pct}
        aria-valuetext={strings.settings.display.textScale.value(pct)}
        className="h-2 w-full cursor-pointer accent-primary disabled:opacity-50"
        onChange={(event) => onChange(clampTextScale(Number(event.target.value)))}
      />

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={disabled || atMin}
          aria-label={strings.settings.display.textScale.decreaseAriaLabel}
          onClick={() => adjust(-textScaleStep)}
        >
          {strings.settings.display.textScale.decrease}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={disabled || atMax}
          aria-label={strings.settings.display.textScale.increaseAriaLabel}
          onClick={() => adjust(textScaleStep)}
        >
          {strings.settings.display.textScale.increase}
        </Button>
      </div>
    </div>
  );
}
