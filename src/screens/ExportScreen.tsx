import { CollapsibleDetails } from '@/components/content/CollapsibleDetails';
import { ExportGeneratingPlaceholder } from '@/components/export/ExportGeneratingPlaceholder';
import { ExportSetupPanel } from '@/components/export/ExportSetupPanel';
import { ExportSuccessSection } from '@/components/export/ExportSuccessSection';
import { BlockingNotice } from '@/components/feedback/BlockingNotice';
import { HomeHeader } from '@/components/home/HomeHeader';
import { PrimaryActionButton } from '@/components/home/PrimaryActionButton';
import { ScreenShell } from '@/components/layout/ScreenShell';
import { StickyScreenFooter } from '@/components/layout/StickyScreenFooter';
import { StaggerFadeIn } from '@/components/motion/StaggerFadeIn';
import { QuietNavLink } from '@/components/navigation/QuietNavLink';
import { TrendsEmptyState } from '@/components/trends/TrendsEmptyState';
import { strings } from '@/config/strings';
import { useExportScreen } from '@/hooks/useExportScreen';

const STAGGER_MS = 60;

export function ExportScreen() {
  const exportScreen = useExportScreen();

  if (exportScreen.status === 'loading') {
    return (
      <ScreenShell textScale={exportScreen.settings.textScale}>
        <p
          className="flex flex-1 items-center justify-center text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {strings.export.loading}
        </p>
      </ScreenShell>
    );
  }

  if (
    exportScreen.status === 'error' &&
    exportScreen.errorTitle &&
    exportScreen.errorBody
  ) {
    return (
      <ScreenShell textScale={exportScreen.settings.textScale}>
        <BlockingNotice
          title={exportScreen.errorTitle}
          body={exportScreen.errorBody}
        />
        <QuietNavLink
          to="/home"
          label={strings.export.nav.back}
          ariaLabel={strings.export.nav.backAriaLabel}
          className="mt-6 w-full"
        />
      </ScreenShell>
    );
  }

  const isGenerating = exportScreen.status === 'generating';
  const showSuccess =
    exportScreen.status === 'success' &&
    exportScreen.blobs !== null &&
    exportScreen.preview !== null;

  const successPreview = exportScreen.preview;

  return (
    <ScreenShell
      textScale={exportScreen.settings.textScale}
      ariaLabelledBy={exportScreen.headingId}
      className="gap-0 pb-0"
    >
      <p className="sr-only" role="status" aria-live="polite">
        {exportScreen.generatingAnnouncement}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {exportScreen.successAnnouncement}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {exportScreen.emptyAnnouncement}
      </p>

      <div className="flex flex-1 flex-col gap-6 pb-6">
        <StaggerFadeIn animationKey="export-header">
          <HomeHeader
            title={strings.export.title}
            subtitle={strings.export.subtitle}
            headingId={exportScreen.headingId}
          />
        </StaggerFadeIn>

        {!showSuccess ? (
          <>
            <StaggerFadeIn animationKey="export-setup" delayMs={STAGGER_MS}>
              <ExportSetupPanel
                range={exportScreen.range}
                disabled={isGenerating}
                onFromChange={exportScreen.setFrom}
                onToChange={exportScreen.setTo}
              />
            </StaggerFadeIn>

            <CollapsibleDetails title={strings.export.scopeNoticeHeading}>
              {strings.export.nonDiagnosticNotice}
            </CollapsibleDetails>

            {isGenerating ? <ExportGeneratingPlaceholder /> : null}

            {exportScreen.status === 'empty' ? (
              <TrendsEmptyState
                title={strings.export.empty.title}
                body={strings.export.empty.body}
              />
            ) : null}
          </>
        ) : successPreview ? (
          <StaggerFadeIn animationKey="export-success">
            <ExportSuccessSection
              preview={successPreview}
              onDownloadJson={exportScreen.downloadJson}
            />
          </StaggerFadeIn>
        ) : null}
      </div>

      <StickyScreenFooter>
        {showSuccess ? (
          <PrimaryActionButton
            label={strings.export.success.htmlDownload}
            aria-label={strings.export.success.htmlDownloadAriaLabel}
            onClick={exportScreen.downloadHtml}
          />
        ) : (
          <PrimaryActionButton
            label={
              isGenerating ? strings.export.generating : strings.export.generate
            }
            aria-label={strings.export.generateAriaLabel}
            aria-busy={isGenerating}
            disabled={!exportScreen.canGenerate || isGenerating}
            onClick={() => void exportScreen.generate()}
          />
        )}
      </StickyScreenFooter>

      <div className="border-t border-border/60 pt-6">
        <QuietNavLink
          to="/home"
          label={strings.export.nav.back}
          ariaLabel={strings.export.nav.backAriaLabel}
          className="w-full"
        />
      </div>
    </ScreenShell>
  );
}
