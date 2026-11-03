import {
  CONFIDENCE_WEIGHT,
  STUDY_DAY_MINUTES,
  STUDY_TIMEZONE,
  type Confidence,
} from '@forward-pass/shared';

// Study days, uptime and mastery. Pure: no database, and "now" is always passed in, so the
// midnight and timezone edges are testable.

const DAY_MS = 24 * 60 * 60 * 1000;

/** The study day an instant falls on, in the pod's timezone, as YYYY-MM-DD. */
export function studyDate(at: Date, timeZone: string = STUDY_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Minutes the timezone is ahead of UTC at an instant. */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** The instant a study day starts, for date-range queries. */
export function startOfStudyDay(date: string, timeZone: string = STUDY_TIMEZONE): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const guess = new Date(Date.UTC(y, m - 1, d));
  return new Date(guess.getTime() - offsetMinutes(guess, timeZone) * 60000);
}

/** Calendar arithmetic on YYYY-MM-DD dates. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** 0 is Monday, 6 is Sunday. */
export function weekdayOf(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export interface DayActivity {
  readingMinutes: number;
  sectionsRead: number;
  answersGraded: number;
  projectEvents: number;
}

export interface StudyDay extends DayActivity {
  date: string;
  intensity: number;
}

/**
 * 0 when the day doesn't count as study (no graded answer or project event, and under ten minutes
 * of reading); otherwise 1 to 3 by how much got done.
 */
export function intensityOf(day: DayActivity): number {
  const studied =
    day.answersGraded > 0 || day.projectEvents > 0 || day.readingMinutes >= STUDY_DAY_MINUTES;
  if (!studied) return 0;
  const score =
    day.readingMinutes + 3 * day.answersGraded + 15 * day.sectionsRead + 30 * day.projectEvents;
  if (score >= 90) return 3;
  if (score >= 40) return 2;
  return 1;
}

/** One reading event never counts for more than this, so a tab left open overnight can't. */
const MAX_EVENT_MINUTES = 120;

export interface ActivityInput {
  reading: { startedAt: Date; endedAt: Date }[];
  /** When lessons first counted as read. */
  reads: Date[];
  answers: Date[];
  projectEvents?: Date[];
}

/** Groups raw activity into study days, oldest first. Days with nothing are left out. */
export function rollup(input: ActivityInput, timeZone: string = STUDY_TIMEZONE): StudyDay[] {
  const days = new Map<string, DayActivity>();
  const day = (at: Date) => {
    const key = studyDate(at, timeZone);
    let entry = days.get(key);
    if (!entry) {
      entry = { readingMinutes: 0, sectionsRead: 0, answersGraded: 0, projectEvents: 0 };
      days.set(key, entry);
    }
    return entry;
  };
  for (const event of input.reading) {
    const minutes = (event.endedAt.getTime() - event.startedAt.getTime()) / 60000;
    day(event.startedAt).readingMinutes += Math.min(MAX_EVENT_MINUTES, Math.max(0, minutes));
  }
  for (const at of input.reads) day(at).sectionsRead++;
  for (const at of input.answers) day(at).answersGraded++;
  for (const at of input.projectEvents ?? []) day(at).projectEvents++;

  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, activity]) => {
      const rounded = { ...activity, readingMinutes: Math.round(activity.readingMinutes) };
      return { date, ...rounded, intensity: intensityOf(rounded) };
    });
}

/** Consecutive study days ending today, or yesterday if today has nothing yet. */
export function uptime(days: { date: string; intensity: number }[], today: string): number {
  const studied = new Set(days.filter((day) => day.intensity >= 1).map((day) => day.date));
  let cursor = studied.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (studied.has(cursor)) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/** The longest run of consecutive study days. */
export function longestUptime(days: { date: string; intensity: number }[]): number {
  const dates = days
    .filter((day) => day.intensity >= 1)
    .map((day) => day.date)
    .sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of dates) {
    run = previous && daysBetween(previous, date) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  return best;
}

/** Days without study in the most recent break between study days, or null with no break. */
export function lastGap(days: { date: string; intensity: number }[]): number | null {
  const dates = days
    .filter((day) => day.intensity >= 1)
    .map((day) => day.date)
    .sort();
  for (let i = dates.length - 1; i > 0; i--) {
    const gap = daysBetween(dates[i - 1]!, dates[i]!) - 1;
    if (gap > 0) return gap;
  }
  return null;
}

/** The weekday with the most study, by intensity, or null before any study. */
export function bestWeekday(days: { date: string; intensity: number }[]): number | null {
  const totals = Array.from({ length: 7 }, () => 0);
  for (const day of days) totals[weekdayOf(day.date)]! += day.intensity;
  const best = Math.max(...totals);
  return best > 0 ? totals.indexOf(best) : null;
}

/** Reading events closer than this join into one session. */
const SESSION_GAP_MS = 15 * 60 * 1000;

/** The median reading session in minutes, joining events less than 15 minutes apart. */
export function typicalSession(events: { startedAt: Date; endedAt: Date }[]): number | null {
  const sorted = [...events].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const sessions: number[] = [];
  let start: number | null = null;
  let end = 0;
  for (const event of sorted) {
    if (start !== null && event.startedAt.getTime() - end <= SESSION_GAP_MS) {
      end = Math.max(end, event.endedAt.getTime());
      continue;
    }
    if (start !== null) sessions.push((end - start) / 60000);
    start = event.startedAt.getTime();
    end = event.endedAt.getTime();
  }
  if (start !== null) sessions.push((end - start) / 60000);
  const real = sessions.filter((minutes) => minutes >= 1).sort((a, b) => a - b);
  if (!real.length) return null;
  const mid = Math.floor(real.length / 2);
  return Math.round(real.length % 2 ? real[mid]! : (real[mid - 1]! + real[mid]!) / 2);
}

/**
 * 0.7 × latest checkpoint acceptance + 0.3 × confidence weight. A section never attempted is 0,
 * whatever its rating.
 */
export function sectionMastery(acceptance: number | null, confidence: Confidence | null): number {
  if (acceptance === null) return 0;
  return 0.7 * acceptance + 0.3 * (confidence ? CONFIDENCE_WEIGHT[confidence] : 0);
}

export const mean = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
