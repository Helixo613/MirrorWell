import { strings } from '@/config/strings';
import { thresholds } from '@/config/thresholds';

export function greetingFor(hour: number, nickname: string | undefined): string {
  const part = hour < thresholds.home.afternoonStartHour
    ? strings.home.greeting.morning
    : hour < thresholds.home.eveningStartHour
      ? strings.home.greeting.afternoon
      : strings.home.greeting.evening;
  return nickname ? `${part}, ${nickname}` : part;
}
