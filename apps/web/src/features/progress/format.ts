// Small formatters for progress numbers. Dates arrive as YYYY-MM-DD study days.

export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const asUtc = (date: string) => new Date(`${date}T12:00:00Z`);

export function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

/** 220 → "3h 40m"; 45 → "45m". */
export function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** "Tuesday · 3 Nov 2026". */
export function longDate(date: string): string {
  const day = asUtc(date);
  const weekday = day.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  const rest = day.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${weekday} · ${rest}`;
}

/** "14 Feb 2027". */
export function shortDate(date: string): string {
  return asUtc(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function monthOf(date: string): string {
  return asUtc(date).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
}

/** "5 min ago", "2h ago", "3 days ago". */
export function ago(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60000));
  if (minutes < 60) return minutes <= 1 ? 'just now' : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
