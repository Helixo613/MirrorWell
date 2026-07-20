import { describe, expect, it, vi } from 'vitest';
import { SessionController } from '../../src/session/controller.ts';
import { SafetyGate } from '../../src/session/safety.ts';
import { StorageService } from '../../src/data/storage.ts';
import { CalibrationFlow } from '../../src/session/calibration.ts';

describe('SessionController skeleton', () => {
  it('checks attestation before baseline', async () => {
    vi.spyOn(SafetyGate, 'isAttested').mockResolvedValue(false);
    const baseline = vi.spyOn(StorageService, 'getActiveBaseline');
    await expect(SessionController.start(['EX_SMILE'])).rejects.toMatchObject({ code: 'NOT_ATTESTED' });
    expect(baseline).not.toHaveBeenCalled();
  });
  it('rejects missing baseline and drift recalibration', async () => {
    vi.spyOn(SafetyGate, 'isAttested').mockResolvedValue(true);
    vi.spyOn(StorageService, 'getActiveBaseline').mockResolvedValue(null);
    await expect(SessionController.start(['EX_SMILE'])).rejects.toMatchObject({ code: 'NO_BASELINE' });
  });
  it('rejects invalid exercise lists', async () => {
    vi.spyOn(SafetyGate, 'isAttested').mockResolvedValue(true);
    await expect(SessionController.start([])).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(SessionController.start(['EX_PUCKER'])).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
  it('emits sessionEnded when stopped', async () => {
    const seen = vi.fn();
    SessionController.on('sessionEnded', seen);
    await expect(SessionController.stop('user_stopped')).resolves.toMatchObject({ endReason: 'user_stopped' });
    expect(seen).toHaveBeenCalled();
  });
});
