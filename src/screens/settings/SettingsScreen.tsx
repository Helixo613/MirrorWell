import { useEffect, useState } from 'react';
import { SegmentedControl } from '@/components/controls/SegmentedControl';
import { BlockingNotice } from '@/components/feedback/BlockingNotice';
import { DeleteDataDialog } from '@/components/settings/DeleteDataDialog';
import { SettingsLinkRow } from '@/components/settings/SettingsLinkRow';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { TextScaleControl } from '@/components/settings/TextScaleControl';
import { ToggleSettingRow } from '@/components/settings/ToggleSettingRow';
import { HomeHeader } from '@/components/home/HomeHeader';
import { SoftPanel } from '@/components/layout/SoftPanel';
import { ScreenShell } from '@/components/layout/ScreenShell';
import { StaggerFadeIn } from '@/components/motion/StaggerFadeIn';
import { QuietNavLink } from '@/components/navigation/QuietNavLink';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { strings } from '@/config/strings';
import { thresholds } from '@/config/thresholds';
import { useSettingsScreen } from '@/hooks/useSettingsScreen';
import { cn } from '@/lib/utils';
import { VoiceCoach } from '@/session/voice';

export function SettingsScreen() {
  const settingsScreen = useSettingsScreen();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const disabled = settingsScreen.isSaving || settingsScreen.deletePhase !== 'idle';

  useEffect(() => VoiceCoach.onVoicesChanged(setVoices), []);

  if (settingsScreen.status === 'loading') {
    return (
      <ScreenShell textScale={settingsScreen.settings.textScale}>
        <p
          className="flex flex-1 items-center justify-center text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {strings.settings.loading}
        </p>
      </ScreenShell>
    );
  }

  if (settingsScreen.status === 'error') {
    return (
      <ScreenShell textScale={settingsScreen.settings.textScale}>
        <BlockingNotice
          title={strings.errors.DB_UNAVAILABLE.title}
          body={strings.errors.DB_UNAVAILABLE.body}
        />
        <QuietNavLink
          to="/home"
          label={strings.settings.nav.back}
          ariaLabel={strings.settings.nav.backAriaLabel}
          className="mt-6 w-full"
        />
      </ScreenShell>
    );
  }

  const granularityOptions = [
    {
      value: 'monthly' as const,
      label: strings.settings.trends.monthly,
      ariaLabel: strings.settings.trends.monthlyAriaLabel,
    },
    {
      value: 'weekly' as const,
      label: strings.settings.trends.weekly,
      ariaLabel: strings.settings.trends.weeklyAriaLabel,
    },
  ];

  return (
    <ScreenShell
      variant="wide"
      textScale={settingsScreen.settings.textScale}
      ariaLabelledBy={settingsScreen.headingId}
      className="gap-6"
    >
      <p className="sr-only" role="status" aria-live="polite">
        {settingsScreen.savingAnnouncement}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {settingsScreen.saveSuccessAnnouncement}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {settingsScreen.deleteAnnouncement}
      </p>

      <StaggerFadeIn animationKey="settings-header">
        <HomeHeader
          title={strings.settings.title}
          subtitle={strings.settings.subtitle}
          headingId={settingsScreen.headingId}
        />
      </StaggerFadeIn>

      {settingsScreen.saveFeedback ? (
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {settingsScreen.saveFeedback}
        </p>
      ) : null}

      {settingsScreen.errorMessage ? (
        <p className="text-base text-destructive" role="alert">
          {settingsScreen.errorMessage}
        </p>
      ) : null}

      {/* The three settings groups are same-kind tiles — auto-fit spreads them 1/2/3-up as
          the wide shell widens. Recalibrate/Danger-zone below stay full-width standalone
          bands (not tiles): a destructive action shouldn't compete for a grid cell. */}
      <div className="fluid-grid">
        <SettingsSection
          title={strings.settings.sections.profile}
          headingId="settings-profile-heading"
        >
          <div className="flex flex-col gap-4 p-4">
            <div className="space-y-2">
              <Label htmlFor="settings-nickname">{strings.settings.profile.nicknameLabel}</Label>
              <Input
                id="settings-nickname"
                value={settingsScreen.nickname}
                maxLength={thresholds.profile.nicknameMaxLength}
                disabled={disabled}
                onChange={(event) => settingsScreen.setNickname(event.target.value)}
              />
              <p className="text-sm text-muted-foreground">{strings.settings.profile.nicknameHint}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-motivation">
                {strings.settings.profile.motivationLabel}
              </Label>
              <Input
                id="settings-motivation"
                value={settingsScreen.motivation}
                maxLength={thresholds.profile.motivationMaxLength}
                disabled={disabled}
                onChange={(event) => settingsScreen.setMotivation(event.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                {strings.settings.profile.motivationHint}
              </p>
            </div>
            <Button
              type="button"
              disabled={disabled}
              onClick={() => void settingsScreen.saveProfileFields()}
            >
              {strings.settings.profile.save}
            </Button>
          </div>
        </SettingsSection>

        <SettingsSection
          title={strings.settings.sections.displayAndCues}
          headingId="settings-display-cues-heading"
        >
          <ToggleSettingRow
            id="settings-high-contrast"
            label={strings.settings.display.highContrast.label}
            description={strings.settings.display.highContrast.description}
            checked={settingsScreen.settings.highContrast}
            disabled={disabled}
            onCheckedChange={(checked) =>
              void settingsScreen.updateSetting('highContrast', checked)
            }
          />
          <TextScaleControl
            value={settingsScreen.settings.textScale}
            disabled={disabled}
            onChange={(value) => void settingsScreen.updateSetting('textScale', value)}
          />
          <ToggleSettingRow
            id="settings-reduced-face-preview"
            label={strings.settings.display.reducedFacePreview.label}
            description={strings.settings.display.reducedFacePreview.description}
            checked={settingsScreen.settings.reducedFacePreview}
            disabled={disabled}
            onCheckedChange={(checked) =>
              void settingsScreen.updateSetting('reducedFacePreview', checked)
            }
          />
          <ToggleSettingRow
            id="settings-affected-side-marker"
            label={strings.settings.display.showAffectedSideMarker.label}
            description={strings.settings.display.showAffectedSideMarker.description}
            checked={settingsScreen.settings.showAffectedSideMarker}
            disabled={disabled}
            onCheckedChange={(checked) =>
              void settingsScreen.updateSetting('showAffectedSideMarker', checked)
            }
          />
          {settingsScreen.hapticsAvailable ? (
            <ToggleSettingRow
              id="settings-haptics"
              label={strings.settings.cues.haptics.label}
              description={strings.settings.cues.haptics.description}
              checked={settingsScreen.settings.hapticsEnabled}
              disabled={disabled}
              onCheckedChange={(checked) =>
                void settingsScreen.updateSetting('hapticsEnabled', checked)
              }
            />
          ) : null}
          <ToggleSettingRow
            id="settings-audio"
            label={strings.settings.cues.audio.label}
            description={strings.settings.cues.audio.description}
            checked={settingsScreen.settings.audioCuesEnabled}
            disabled={disabled}
            onCheckedChange={(checked) =>
              void settingsScreen.updateSetting('audioCuesEnabled', checked)
            }
          />
          <ToggleSettingRow
            id="settings-voice-coach"
            label={strings.settings.cues.voiceCoach.label}
            description={strings.settings.cues.voiceCoach.description}
            checked={settingsScreen.settings.voiceCoachEnabled}
            disabled={disabled}
            onCheckedChange={(checked) =>
              void settingsScreen.updateSetting('voiceCoachEnabled', checked)
            }
          />
          <div className="space-y-2 px-5 py-4 sm:px-6">
            <Label htmlFor="settings-voice-name">{strings.settings.cues.voiceName.label}</Label>
            <select
              id="settings-voice-name"
              className="min-h-12 w-full rounded-md border border-input bg-background px-3 text-base"
              value={settingsScreen.settings.voiceName ?? ''}
              disabled={disabled || voices.length === 0}
              onChange={(event) =>
                void settingsScreen.updateSetting('voiceName', event.target.value || undefined)
              }
            >
              <option value="">{strings.settings.cues.voiceName.automatic}</option>
              {voices.map((voice) => (
                <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground">
              {voices.length === 0
                ? strings.settings.cues.voiceName.unavailable
                : strings.settings.cues.voiceName.description}
            </p>
          </div>
        </SettingsSection>

        <SettingsSection
          title={strings.settings.sections.trendsAndSharing}
          headingId="settings-trends-sharing-heading"
        >
          <div className="px-5 py-4 sm:px-6">
            <SegmentedControl
              label={strings.settings.trends.granularityLabel}
              options={granularityOptions}
              value={settingsScreen.settings.trendGranularity}
              disabled={disabled}
              onChange={(value) =>
                void settingsScreen.updateSetting('trendGranularity', value)
              }
            />
          </div>
          <ToggleSettingRow
            id="settings-caregiver-view"
            label={strings.settings.sharing.caregiver.label}
            description={strings.settings.sharing.caregiver.description}
            checked={settingsScreen.settings.caregiverViewEnabled}
            disabled={disabled}
            onCheckedChange={(checked) =>
              void settingsScreen.updateSetting('caregiverViewEnabled', checked)
            }
          />
        </SettingsSection>
      </div>

      <div className="flex max-w-shell flex-col gap-6">
        <nav aria-label={strings.settings.calibration.navLabel}>
          <SoftPanel className="p-0">
            <SettingsLinkRow
              to="/calibration"
              label={strings.settings.calibration.recalibrate}
              description={strings.settings.calibration.description}
              ariaLabel={strings.settings.calibration.recalibrateAriaLabel}
            />
          </SoftPanel>
        </nav>

        <section
          aria-labelledby="settings-danger-heading"
          className="space-y-2"
        >
          <h2
            id="settings-danger-heading"
            className="px-1 text-sm font-medium text-muted-foreground"
          >
            {strings.settings.sections.danger}
          </h2>
          <div
            className={cn(
              'rounded-2xl border border-destructive/25 bg-destructive/5 px-5 py-4 sm:px-6',
            )}
          >
            <Button
              type="button"
              variant="destructive"
              size="lg"
              className="w-full"
              disabled={disabled}
              aria-label={strings.settings.delete.triggerAriaLabel}
              onClick={settingsScreen.openDeleteDialog}
            >
              {strings.settings.delete.trigger}
            </Button>
          </div>
        </section>
      </div>

      <div className="mt-auto max-w-shell border-t border-border/60 pt-6">
        <QuietNavLink
          to="/home"
          label={strings.settings.nav.back}
          ariaLabel={strings.settings.nav.backAriaLabel}
          className="w-full"
        />
      </div>

      <DeleteDataDialog
        open={settingsScreen.deletePhase !== 'idle'}
        phase={settingsScreen.deletePhase === 'deleting' ? 'deleting' : 'confirm'}
        onCancel={settingsScreen.cancelDelete}
        onConfirm={() => void settingsScreen.confirmDelete()}
      />
    </ScreenShell>
  );
}
