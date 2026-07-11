import { PlainLanguageList } from '@/components/content/PlainLanguageList';
import { DateRangeFields } from '@/components/forms/DateRangeFields';
import { SoftPanel } from '@/components/layout/SoftPanel';
import { strings } from '@/config/strings';
import type { ExportDateRange } from '@/types/export';
import { cn } from '@/lib/utils';

export interface ExportSetupPanelProps {
  range: ExportDateRange;
  disabled?: boolean;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  className?: string;
}

export function ExportSetupPanel({
  range,
  disabled = false,
  onFromChange,
  onToChange,
  className,
}: ExportSetupPanelProps) {
  return (
    <SoftPanel className={cn('space-y-5', className)}>
      <DateRangeFields
        groupLabel={strings.export.dateRange.label}
        fromId="export-from"
        toId="export-to"
        fromLabel={strings.export.dateRange.from}
        toLabel={strings.export.dateRange.to}
        fromAriaLabel={strings.export.dateRange.fromAriaLabel}
        toAriaLabel={strings.export.dateRange.toAriaLabel}
        from={range.from}
        to={range.to}
        disabled={disabled}
        onFromChange={onFromChange}
        onToChange={onToChange}
      />

      <div className="space-y-3 border-t border-border/60 pt-5">
        <h2
          id="export-included-heading"
          className="text-lg font-semibold leading-snug"
        >
          {strings.export.included.heading}
        </h2>
        <PlainLanguageList items={strings.export.included.items} />
      </div>
    </SoftPanel>
  );
}
