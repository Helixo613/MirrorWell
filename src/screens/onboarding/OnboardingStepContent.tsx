import { strings } from '@/config/strings';
import { thresholds } from '@/config/thresholds';
import { CheckboxGroup } from '@/components/forms/CheckboxGroup';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CollapsibleDetails } from '@/components/content/CollapsibleDetails';
import {
  BulletList,
  OnboardingStepFrame,
  ProseBlock,
  SafetyCallout,
  StepHeading,
} from '@/components/onboarding/OnboardingContent';
import type { ExerciseId } from '@/data/schema';
import type { AttestationKey, AttestationState } from '@/screens/onboarding/types';
import {
  useAttestationOptions,
  useAttestationSet,
  useExerciseOptions,
  useExerciseSet,
} from '@/screens/onboarding/useOnboardingSelections';
import type { OnboardingStepIndex } from '@/screens/onboarding/types';

export const ONBOARDING_STEP_HEADING_ID = 'onboarding-step-heading';

export interface OnboardingStepContentProps {
  step: OnboardingStepIndex;
  attestations: AttestationState;
  onAttestationToggle: (key: AttestationKey, checked: boolean) => void;
  selectedExercises: ExerciseId[];
  onExerciseToggle: (id: ExerciseId, checked: boolean) => void;
  nickname: string;
  onNicknameChange: (value: string) => void;
  motivation: string;
  onMotivationChange: (value: string) => void;
  disabled?: boolean;
}

export function OnboardingStepContent({
  step,
  attestations,
  onAttestationToggle,
  selectedExercises,
  onExerciseToggle,
  nickname,
  onNicknameChange,
  motivation,
  onMotivationChange,
  disabled = false,
}: OnboardingStepContentProps) {
  const attestationOptions = useAttestationOptions();
  const exerciseOptions = useExerciseOptions();
  const attestationValues = useAttestationSet(attestations);
  const exerciseValues = useExerciseSet(selectedExercises);
  const headingId = ONBOARDING_STEP_HEADING_ID;

  switch (step) {
    case 0: {
      const copy = strings.onboarding.steps.intendedUse;
      return (
        <OnboardingStepFrame>
          <ProseBlock
            title={copy.title}
            paragraphs={copy.body}
            headingId={headingId}
          />
          <CollapsibleDetails title={copy.goodToKnowTitle}>
            <BulletList items={copy.limitations} />
          </CollapsibleDetails>
        </OnboardingStepFrame>
      );
    }
    case 1: {
      const copy = strings.onboarding.steps.redFlag;
      return (
        <OnboardingStepFrame>
          <SafetyCallout
            title={copy.title}
            emergency={copy.emergency}
            paragraphs={copy.body}
            headingId={headingId}
          />
        </OnboardingStepFrame>
      );
    }
    case 2: {
      const copy = strings.onboarding.steps.localProcessing;
      return (
        <OnboardingStepFrame>
          <ProseBlock
            title={copy.title}
            paragraphs={copy.body}
            headingId={headingId}
          />
        </OnboardingStepFrame>
      );
    }
    case 3: {
      const copy = strings.onboarding.steps.attestation;
      return (
        <OnboardingStepFrame>
          <StepHeading
            id={headingId}
            title={copy.title}
            subtitle={copy.subtitle}
          />
          <CheckboxGroup
            name="attestation"
            options={attestationOptions}
            values={attestationValues}
            onToggle={onAttestationToggle}
            disabled={disabled}
          />
          <div className="space-y-2">
            <Label htmlFor="onboarding-nickname">
              {strings.onboarding.nickname.label}
            </Label>
            <Input
              id="onboarding-nickname"
              value={nickname}
              maxLength={thresholds.profile.nicknameMaxLength}
              placeholder={strings.onboarding.nickname.placeholder}
              aria-describedby="onboarding-nickname-hint"
              disabled={disabled}
              onChange={(event) => onNicknameChange(event.target.value)}
            />
            <p id="onboarding-nickname-hint" className="text-sm text-muted-foreground">
              {strings.onboarding.nickname.hint}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="onboarding-motivation">
              {strings.onboarding.motivation.label}
            </Label>
            <Input
              id="onboarding-motivation"
              value={motivation}
              maxLength={thresholds.profile.motivationMaxLength}
              placeholder={strings.onboarding.motivation.placeholder}
              aria-describedby="onboarding-motivation-hint"
              disabled={disabled}
              onChange={(event) => onMotivationChange(event.target.value)}
            />
            <p id="onboarding-motivation-hint" className="text-sm text-muted-foreground">
              {strings.onboarding.motivation.hint}
            </p>
          </div>
        </OnboardingStepFrame>
      );
    }
    case 4: {
      const copy = strings.onboarding.steps.exercises;
      return (
        <OnboardingStepFrame>
          <StepHeading
            id={headingId}
            title={copy.title}
            subtitle={copy.subtitle}
          />
          <CheckboxGroup
            name="exercises"
            options={exerciseOptions}
            values={exerciseValues}
            onToggle={onExerciseToggle}
            disabled={disabled}
          />
        </OnboardingStepFrame>
      );
    }
    default: {
      const _exhaustive: never = step;
      return _exhaustive;
    }
  }
}
