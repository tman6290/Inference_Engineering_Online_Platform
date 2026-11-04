import { STUDY_TIMEZONE } from '@forward-pass/shared';
import { Placeholder } from './Placeholder';

/** Morning, afternoon or evening in the pod's timezone. */
export function greeting(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: STUDY_TIMEZONE,
    }).format(now),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function NotFoundPage() {
  return (
    <Placeholder
      eyebrow="404"
      title="Page not found"
      description="That address doesn't match a page."
      plan={['Use the navigation to get back on track']}
    />
  );
}
