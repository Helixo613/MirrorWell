import { Button } from '@/components/ui/button';
import { DownloadCard } from '@/components/export/DownloadCard';
import { ExportGeneratingPlaceholder } from '@/components/export/ExportGeneratingPlaceholder';
import { ExportSetupPanel } from '@/components/export/ExportSetupPanel';
import { ExportSuccessSection } from '@/components/export/ExportSuccessSection';
import { BlockingNotice } from '@/components/feedback/BlockingNotice';
import { HomeHeader } from '@/components/home/HomeHeader';
import { ScreenShell } from '@/components/layout/ScreenShell';
import { SoftPanel } from '@/components/layout/SoftPanel';
import { StaggerFadeIn } from '@/components/motion/StaggerFadeIn';
import { QuietNavLink } from '@/components/navigation/QuietNavLink';
import { strings } from '@/config/strings';
import { useAppState } from '@/context/useAppState';
import { useExportScreen } from '@/screens/export/useExportScreen';
import { EXPORT_HEADING_ID } from '@/types/export';

const STAGGER_MS = 60;

/**
 * ExportScreen (FRONTEND §2.8): generate a clinician summary from ExportService.generateSummary,
 * plus weekly progressCard PNG. Download only — no Web Share API, no clipboard.
 */
export function ExportScreen() {
  const { settings } = useAppState();
  const exportScreen = useExportScreen();
  const copy = strings.export;
  const card = copy.card;
  const isGenerating = exportScreen.status === 'generating';
  const cardBusy = exportScreen.weeklyCardStatus === 'generating';

  return (
    <ScreenShell
      variant="wide"
      textScale={settings.textScale}
      ariaLabelledBy={EXPORT_HEADING_ID}
      className="gap-6"
    >
      <p className="sr-only" role="status" aria-live="polite">
        {exportScreen.liveAnnouncement}
      </p>

      <StaggerFadeIn animationKey="export-header">
        <HomeHeader
          title={copy.title}
          subtitle={copy.subtitle}
          headingId={EXPORT_HEADING_ID}
        />
      </StaggerFadeIn>

      {/* Export is a single linear form flow (notice -> setup -> generate -> card), not a
          multi-item collection — .fluid-grid doesn't apply. A reading-width cap on just this
          inner column (no breakpoint, so still continuous) keeps form fields from stretching
          edge-to-edge in the wide sidebar-adjacent shell, without re-imposing the old
          screen-wide cap the wide variant exists to remove. */}
      <div className="flex max-w-shell flex-col gap-6">
        {/* Mandatory non-diagnostic notice (SAFETY §8) — always visible. */}
        <StaggerFadeIn animationKey="export-notice" delayMs={STAGGER_MS}>
          <SoftPanel
            aria-labelledby="export-notice-heading"
            className="border border-primary/15 bg-primary/5"
          >
            <h2
              id="export-notice-heading"
              className="text-base font-semibold text-foreground"
            >
              {copy.scopeNoticeHeading}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {copy.nonDiagnosticNotice}
            </p>
          </SoftPanel>
        </StaggerFadeIn>

        {exportScreen.status === 'success' && exportScreen.preview ? (
          <StaggerFadeIn animationKey="export-success" delayMs={STAGGER_MS * 2}>
            <ExportSuccessSection
              preview={exportScreen.preview}
              onDownloadJson={exportScreen.downloadJson}
              onDownloadHtml={exportScreen.downloadHtml}
              onDownloadWeeklyCard={() => void exportScreen.downloadWeeklyCard()}
              weeklyCardBusy={cardBusy}
            />
          </StaggerFadeIn>
        ) : (
          <>
            <StaggerFadeIn animationKey="export-setup" delayMs={STAGGER_MS * 2}>
              <ExportSetupPanel
                range={exportScreen.range}
                disabled={isGenerating}
                onFromChange={exportScreen.setFrom}
                onToChange={exportScreen.setTo}
              />
            </StaggerFadeIn>

            <Button
              type="button"
              size="lg"
              className="w-full"
              aria-label={copy.generateAriaLabel}
              disabled={isGenerating}
              onClick={() => void exportScreen.generate()}
            >
              {copy.generate}
            </Button>

            {isGenerating ? <ExportGeneratingPlaceholder /> : null}

            {/* Weekly progressCard — available without generating the clinician summary. */}
            <StaggerFadeIn animationKey="export-weekly-card" delayMs={STAGGER_MS * 3}>
              <DownloadCard
                title={card.title}
                description={card.description}
                actionLabel={cardBusy ? card.generating : card.download}
                actionAriaLabel={card.downloadAriaLabel}
                onDownload={() => void exportScreen.downloadWeeklyCard()}
                disabled={cardBusy || isGenerating}
              />
            </StaggerFadeIn>

            {exportScreen.status === 'empty' ? (
              <SoftPanel aria-labelledby="export-empty-heading">
                <h2
                  id="export-empty-heading"
                  className="text-lg font-semibold text-foreground"
                >
                  {copy.empty.title}
                </h2>
                <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                  {copy.empty.body}
                </p>
              </SoftPanel>
            ) : null}

            {exportScreen.status === 'error' &&
            exportScreen.errorTitle &&
            exportScreen.errorBody ? (
              <BlockingNotice
                title={exportScreen.errorTitle}
                body={exportScreen.errorBody}
              />
            ) : null}
          </>
        )}
      </div>

      <div className="mt-auto max-w-shell border-t border-border/60 pt-6">
        <QuietNavLink
          to="/home"
          label={copy.nav.back}
          ariaLabel={copy.nav.backAriaLabel}
          className="w-full"
        />
      </div>
    </ScreenShell>
  );
}
