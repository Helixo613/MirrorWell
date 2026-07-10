import { useCallback, useState } from 'react';
import {
  isOnboardingStepIndex,
  ONBOARDING_STEP_COUNT,
  type OnboardingStepIndex,
} from '@/screens/onboarding/types';

export interface UseOnboardingStepsResult {
  step: OnboardingStepIndex;
  goNext: () => void;
  goBack: () => void;
  canGoBack: boolean;
  isLastStep: boolean;
}

export function useOnboardingSteps(): UseOnboardingStepsResult {
  const [step, setStep] = useState<OnboardingStepIndex>(0);

  const goNext = useCallback(() => {
    setStep((current) => {
      const next = current + 1;
      return isOnboardingStepIndex(next) ? next : current;
    });
  }, []);

  const goBack = useCallback(() => {
    setStep((current) => {
      const prev = current - 1;
      return isOnboardingStepIndex(prev) ? prev : current;
    });
  }, []);

  return {
    step,
    goNext,
    goBack,
    canGoBack: step > 0,
    isLastStep: step === ONBOARDING_STEP_COUNT - 1,
  };
}
