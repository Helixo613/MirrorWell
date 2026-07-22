import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BlockingNotice } from '@/components/feedback/BlockingNotice';
import { ScreenShell } from '@/components/layout/ScreenShell';
import { FadeIn } from '@/components/motion/FadeIn';
import { OnboardingFooter } from '@/components/onboarding/OnboardingFooter';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { StepIndicator } from '@/components/onboarding/StepIndicator';
import { strings } from '@/config/strings';
import { useAppState } from '@/context/useAppState';
import { MirrorWellError } from '@/data/errors';
import type { ExerciseId } from '@/data/schema';
import { StorageService } from '@/data/storage';
import { SafetyGate } from '@/session/safety';
import {
  ONBOARDING_STEP_HEADING_ID,
  OnboardingStepContent,
} from '@/screens/onboarding/OnboardingStepContent';
import {
  INITIAL_ATTESTATIONS,
  ONBOARDING_STEP_COUNT,
  type AttestationState,
} from '@/screens/onboarding/types';
import { useOnboardingSteps } from '@/screens/onboarding/useOnboardingSteps';
import {
  isAttestationComplete,
  useToggleAttestation,
  useToggleExercise,
} from '@/screens/onboarding/useOnboardingSelections';

const PRIMARY_HELPER_ID = 'onboarding-primary-helper';

function createProfileId(): string {
  return crypto.randomUUID();
}

export function OnboardingScreen() {
  const navigate = useNavigate();
  const { settings, setProfile, setGate } = useAppState();
  const { step, goNext, goBack, canGoBack, isLastStep } = useOnboardingSteps();

  const [attestations, setAttestations] =
    useState<AttestationState>(INITIAL_ATTESTATIONS);
  const [selectedExercises, setSelectedExercises] = useState<ExerciseId[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [blockingError, setBlockingError] = useState<{
    title: string;
    body: string;
  } | null>(null);

  const toggleAttestation = useToggleAttestation(setAttestations);
  const toggleExercise = useToggleExercise(setSelectedExercises);

  const demoEnabled = strings.onboarding.demo.enabled;
  const stepAnnouncement = strings.onboarding.stepIndicator(
    step + 1,
    ONBOARDING_STEP_COUNT,
  );

  useEffect(() => {
    let cancelled = false;
    void SafetyGate.isAttested().then((attested) => {
      if (!cancelled && attested) {
        navigate('/calibration', { replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    const heading = document.getElementById(ONBOARDING_STEP_HEADING_ID);
    heading?.focus({ preventScroll: true });
  }, [step]);

  const primaryDisabled = useMemo(() => {
    if (isSubmitting) {
      return true;
    }
    if (step === 3) {
      return !isAttestationComplete(attestations);
    }
    if (isLastStep) {
      return selectedExercises.length === 0;
    }
    return false;
  }, [step, isLastStep, isSubmitting, attestations, selectedExercises.length]);

  const primaryHelperText = useMemo(() => {
    if (!primaryDisabled || isSubmitting) {
      return null;
    }
    if (step === 3) {
      return strings.onboarding.helpers.attestationIncomplete;
    }
    if (isLastStep) {
      return strings.onboarding.helpers.exercisesRequired;
    }
    return null;
  }, [primaryDisabled, isSubmitting, step, isLastStep]);

  const primaryLabel = useMemo(() => {
    if (step === 1) {
      return strings.onboarding.steps.redFlag.continueLabel;
    }
    if (isLastStep) {
      return strings.onboarding.actions.startCalibration;
    }
    return strings.onboarding.actions.continue;
  }, [step, isLastStep]);

  const handleDemo = useCallback(() => {
    SafetyGate.enterDemoMode();
    setGate('DEMO');
    navigate('/session');
  }, [navigate, setGate]);

  const handlePrimary = useCallback(async () => {
    if (primaryDisabled) {
      return;
    }
    if (!isLastStep) {
      goNext();
      return;
    }

    setIsSubmitting(true);
    setBlockingError(null);

    try {
      const now = new Date().toISOString();
      const profile = {
        profileId: createProfileId(),
        createdAt: now,
        affectedSide: 'left' as const,
        assignedExercises: selectedExercises,
        attestedAt: null,
        consentVersion: null,
      };

      await StorageService.saveProfile(profile);
      await SafetyGate.recordAttestation(import.meta.env.VITE_CONSENT_VERSION);

      const saved = await StorageService.getProfile();
      if (!saved) {
        throw new Error('Profile missing after save');
      }

      setProfile(saved);
      setGate('ATTESTED');
      navigate('/calibration', { replace: true });
    } catch (error) {
      if (
        error instanceof MirrorWellError &&
        (error.code === 'DB_UNAVAILABLE' || error.code === 'VALIDATION_FAILED')
      ) {
        setBlockingError(strings.errors[error.code]);
      } else {
        setBlockingError(strings.errors.VALIDATION_FAILED);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    primaryDisabled,
    isLastStep,
    goNext,
    selectedExercises,
    setProfile,
    setGate,
    navigate,
  ]);

  return (
    <ScreenShell textScale={settings.textScale}>
      <OnboardingHeader
        showBack={canGoBack}
        backLabel={strings.onboarding.actions.back}
        backAriaLabel={strings.onboarding.actions.backAriaLabel}
        onBack={goBack}
        showDemo={demoEnabled}
        demoLabel={strings.onboarding.actions.tryDemo}
        onDemo={handleDemo}
      />

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {stepAnnouncement}
      </p>

      <StepIndicator
        totalSteps={ONBOARDING_STEP_COUNT}
        currentStep={step}
        getLabel={strings.onboarding.stepIndicator}
      />

      {blockingError ? (
        <BlockingNotice
          title={blockingError.title}
          body={blockingError.body}
          showDemo={demoEnabled}
          demoLabel={strings.onboarding.actions.tryDemo}
          onTryDemo={handleDemo}
          className="mb-6"
        />
      ) : null}

      <FadeIn animationKey={step} className="flex flex-1 flex-col pb-4">
        <OnboardingStepContent
          step={step}
          attestations={attestations}
          onAttestationToggle={toggleAttestation}
          selectedExercises={selectedExercises}
          onExerciseToggle={toggleExercise}
          disabled={isSubmitting}
        />
      </FadeIn>

      <OnboardingFooter
        helperText={primaryHelperText}
        helperId={PRIMARY_HELPER_ID}
      >
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={primaryDisabled}
          aria-describedby={
            primaryHelperText ? PRIMARY_HELPER_ID : undefined
          }
          onClick={() => void handlePrimary()}
        >
          {isSubmitting ? strings.onboarding.actions.saving : primaryLabel}
        </Button>
      </OnboardingFooter>
    </ScreenShell>
  );
}
