/** True when the Vibration API is available (typically Android). */
export function isHapticsAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}
