// Compile-time type barrier: NormalizationLayer.normalize accepts ApprovedFrame only.
// Raw LandmarkFrame must fail typecheck (Task B1).
import { describe, it, expect } from 'vitest';
import type { LandmarkFrame } from '../../src/sensing/landmarks.ts';
import { NormalizationLayer } from '../../src/metrics/normalize.ts';

describe('type barrier', () => {
  it('normalize rejects LandmarkFrame at compile time', () => {
    // Type-level only — never execute the invalid call at runtime.
    if (false as boolean) {
      // @ts-expect-error LandmarkFrame is not ApprovedFrame
      NormalizationLayer.normalize({} as LandmarkFrame);
    }
    expect(true).toBe(true);
  });
});
