import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { assignableExercises, exercises } from '@/config/exercises';
import { strings } from '@/config/strings';
import type { ExerciseId } from '@/data/schema';
import {
  ATTESTATION_KEYS,
  type AttestationKey,
  type AttestationState,
  isAttestationComplete,
} from '@/screens/onboarding/types';
import type { CheckboxOption } from '@/components/forms/CheckboxGroup';

export function useAttestationOptions(): CheckboxOption<AttestationKey>[] {
  const items = strings.onboarding.steps.attestation.items;
  return useMemo(
    () =>
      ATTESTATION_KEYS.map((key) => ({
        id: key,
        label: items[key],
      })),
    [items],
  );
}

export function useExerciseOptions(): CheckboxOption<ExerciseId>[] {
  return useMemo(
    () =>
      assignableExercises.map((id) => ({
        id,
        label: exercises[id].displayName,
      })),
    [],
  );
}

export function useAttestationSet(
  attestations: AttestationState,
): Set<AttestationKey> {
  return useMemo(() => {
    const set = new Set<AttestationKey>();
    for (const key of ATTESTATION_KEYS) {
      if (attestations[key]) {
        set.add(key);
      }
    }
    return set;
  }, [attestations]);
}

export function useExerciseSet(
  selected: readonly ExerciseId[],
): Set<ExerciseId> {
  return useMemo(() => new Set(selected), [selected]);
}

export function useToggleAttestation(
  setAttestations: Dispatch<SetStateAction<AttestationState>>,
) {
  return useCallback((key: AttestationKey, checked: boolean) => {
    setAttestations((prev) => ({ ...prev, [key]: checked }));
  }, [setAttestations]);
}

export function useToggleExercise(
  setSelected: Dispatch<SetStateAction<ExerciseId[]>>,
) {
  return useCallback((id: ExerciseId, checked: boolean) => {
    setSelected((prev) => {
      if (checked) {
        return prev.includes(id) ? prev : [...prev, id];
      }
      return prev.filter((item) => item !== id);
    });
  }, [setSelected]);
}

export { isAttestationComplete };
