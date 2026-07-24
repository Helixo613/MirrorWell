import { DownloadCard } from '@/components/export/DownloadCard';
import { SoftPanel } from '@/components/layout/SoftPanel';
import { strings } from '@/config/strings';
import type { ExportSummaryPreview } from '@/types/export';
import { cn } from '@/lib/utils';

export interface ExportSuccessSectionProps {
  preview: ExportSummaryPreview;
  onDownloadJson: () => void;
  onDownloadHtml: () => void;
  onDownloadWeeklyCard: () => void;
  weeklyCardBusy?: boolean;
  className?: string;
}

export function ExportSuccessSection({
  preview,
  onDownloadJson,
  onDownloadHtml,
  onDownloadWeeklyCard,
  weeklyCardBusy = false,
  className,
}: ExportSuccessSectionProps) {
  const completionPct = Math.round(preview.completionRate * 100);
  const card = strings.export.card;

  return (
    <section
      aria-labelledby="export-success-heading"
      className={cn('space-y-4', className)}
    >
      <h2 id="export-success-heading" className="text-lg font-semibold leading-snug">
        {strings.export.success.heading}
      </h2>

      <SoftPanel className="space-y-2" ariaLabel={strings.export.success.previewAriaLabel}>
        <p className="text-base text-foreground">
          {strings.export.success.previewSessions(preview.sessionCount)}
        </p>
        <p className="text-base text-muted-foreground">
          {strings.export.success.previewRange(preview.range.from, preview.range.to)}
        </p>
        <p className="text-base text-muted-foreground">
          {strings.export.success.previewCompletion(completionPct)}
        </p>
        <p className="text-base text-muted-foreground">
          {strings.export.success.previewExercises(preview.exerciseCount)}
        </p>
      </SoftPanel>

      <p className="text-base leading-relaxed text-muted-foreground">
        {strings.export.advisory}
      </p>

      {/* Download cards (JSON / printable HTML / weekly progressCard) — download only. */}
      <div className="space-y-3">
        <DownloadCard
          title={strings.export.success.jsonTitle}
          description={strings.export.success.jsonDescription}
          actionLabel={strings.export.success.jsonDownload}
          actionAriaLabel={strings.export.success.jsonDownloadAriaLabel}
          onDownload={onDownloadJson}
        />
        <DownloadCard
          title={strings.export.success.htmlTitle}
          description={strings.export.success.htmlDescription}
          actionLabel={strings.export.success.htmlDownload}
          actionAriaLabel={strings.export.success.htmlDownloadAriaLabel}
          onDownload={onDownloadHtml}
        />
        <DownloadCard
          title={card.title}
          description={card.description}
          actionLabel={weeklyCardBusy ? card.generating : card.download}
          actionAriaLabel={card.downloadAriaLabel}
          onDownload={onDownloadWeeklyCard}
          disabled={weeklyCardBusy}
        />
      </div>
    </section>
  );
}
