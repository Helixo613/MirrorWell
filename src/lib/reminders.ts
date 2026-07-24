// Local practice reminders. On-device only.
//
// NO-NETWORK NOTE (ARCHITECTURE §9, the project's first non-negotiable): this module must never
// reach the network, and specifically must never call PushManager.subscribe(). A Web Push
// subscription contacts a push service (FCM/Mozilla/etc.) and would fail the no-network CI gate
// as well as the "no network, no accounts" promise the product is built on. Everything here is a
// local timer plus ServiceWorkerRegistration.showNotification(), neither of which performs a
// request. If a future change appears to need a subscription, the feature is wrong; stop.
//
// SAFETY NOTE (§8, practice-rhythm carve-out): reminder copy must never reference the practice
// rhythm count or any run of days. A nudge that says "don't lose your 5 days" is precisely the
// loss mechanic the carve-out forbids. Reminders invite practice and say nothing about history.
import { strings } from '@/config/strings';

export type ReminderSupport = 'unsupported' | 'default' | 'granted' | 'denied';

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

/** setTimeout clamps above this, so long waits are re-armed in chunks instead of scheduled once. */
const MAX_TIMEOUT_MS = 2_147_483_647;

let timer: ReturnType<typeof setTimeout> | null = null;

function notificationApi(): typeof Notification | null {
  return typeof window !== 'undefined' && 'Notification' in window ? window.Notification : null;
}

/**
 * Milliseconds from `now` until the next local occurrence of `HH:MM`. Exported for tests: this is
 * the only real logic in the module and it has the daylight-saving and midnight-rollover edges.
 *
 * Built by calendar fields rather than by adding MS_PER_DAY to a timestamp, so that across a DST
 * boundary the reminder stays at the wall-clock time the user chose instead of drifting an hour.
 */
export function msUntilNext(now: Date, time: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= now.getTime()) {
    // Advance by calendar day, then re-apply the wall-clock time (DST safety, see above).
    next.setDate(next.getDate() + 1);
    next.setHours(hours, minutes, 0, 0);
  }

  return next.getTime() - now.getTime();
}

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

async function show(): Promise<void> {
  const api = notificationApi();
  if (!api || api.permission !== 'granted') return;

  const { title, body } = strings.settings.reminders.notification;

  // Prefer the service worker: on Android, `new Notification()` throws in some browsers, and the
  // SW path is also what lets a notification survive the tab being backgrounded.
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.showNotification(title, { body, tag: 'mirrorwell-practice-reminder' });
      return;
    }
  }

  new api(title, { body, tag: 'mirrorwell-practice-reminder' });
}

export const Reminders = {
  /** Current permission state, or 'unsupported' where the Notification API does not exist. */
  support(): ReminderSupport {
    const api = notificationApi();
    return api ? (api.permission as ReminderSupport) : 'unsupported';
  },

  /** Prompts only if the user has not already decided; browsers ignore repeat prompts anyway. */
  async request(): Promise<ReminderSupport> {
    const api = notificationApi();
    if (!api) return 'unsupported';
    if (api.permission !== 'default') return api.permission as ReminderSupport;
    return (await api.requestPermission()) as ReminderSupport;
  },

  /**
   * Arm the next reminder. Safe to call repeatedly: any pending timer is replaced, so settings
   * changes and app re-entry both just re-arm rather than stacking duplicates.
   *
   * Honest limitation: this is a timer owned by the page, so it fires reliably while the app is
   * open or recently backgrounded, and not at all if the browser has fully evicted it. Delivering
   * a reminder to a fully closed app is exactly what Web Push exists for, and Web Push is barred
   * here (see the no-network note above). The Settings copy states this rather than implying
   * alarm-clock reliability.
   */
  schedule(enabled: boolean, time: string): void {
    clearTimer();
    if (!enabled || this.support() !== 'granted') return;

    const arm = (): void => {
      const remaining = msUntilNext(new Date(), time);
      if (remaining === null) return;

      if (remaining > MAX_TIMEOUT_MS) {
        timer = setTimeout(arm, MAX_TIMEOUT_MS);
        return;
      }

      timer = setTimeout(() => {
        void show();
        arm(); // re-arm for tomorrow
      }, remaining);
    };

    arm();
  },

  cancel(): void {
    clearTimer();
  },
};

export const REMINDER_INTERNALS = { MS_PER_DAY };
