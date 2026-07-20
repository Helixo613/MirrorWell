import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../..', import.meta.url);

function source(path: string): string {
  return readFileSync(new URL(path, root), 'utf8');
}

describe('dev SessionApi screen wiring', () => {
  it('loads the stub only behind the compile-time dev flag', () => {
    const session = source('src/hooks/useSessionScreen.ts');
    const calibration = source('src/screens/calibration/useCalibrationFlow.ts');

    expect(session).toContain("import.meta.env.VITE_USE_SESSION_STUB === 'true'");
    expect(session).toContain("import('@/dev/sessionApiStub')");
    expect(calibration).toContain("import.meta.env.VITE_USE_SESSION_STUB === 'true'");
    expect(calibration).toContain("import('@/dev/sessionApiStub')");
  });

  it('does not offer EX_PUCKER without a validated blendshape pair', () => {
    const session = source('src/hooks/useSessionScreen.ts');

    expect(session).toContain('blendshapePair');
    expect(session).toContain('MODEL_AND_DATA §7');
  });
});
