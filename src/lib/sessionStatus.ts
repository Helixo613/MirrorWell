import { strings } from '@/config/strings';
import type { QualityState } from '@/sensing/quality';

export type SessionStatusVariant = 'safety' | 'muted';

export interface SessionStatusMessage {
  message: string;
  variant: SessionStatusVariant;
}

/** One visible status at a time: quality > ease-off > rep discarded. */
export function resolveSessionStatus(
  quality: QualityState,
  easeOffActive: boolean,
): SessionStatusMessage | null {
  if (quality !== 'QUALITY_OK') {
    const message = strings.quality[quality];
    if (message) {
      return { message, variant: 'safety' };
    }
  }

  if (easeOffActive) {
    return { message: strings.session.easeOff, variant: 'safety' };
  }

  return null;
}
