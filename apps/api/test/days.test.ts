import { describe, expect, it } from 'vitest';
import {
  addDays,
  bestWeekday,
  intensityOf,
  lastGap,
  longestUptime,
  rollup,
  sectionMastery,
  startOfStudyDay,
  studyDate,
  typicalSession,
  uptime,
  weekdayOf,
} from '../src/progress/days';

const at = (iso: string) => new Date(iso);
const days = (...dates: string[]) => dates.map((date) => ({ date, intensity: 1 }));

describe('study dates in Africa/Lagos (UTC+1)', () => {
  it('turns the day at 23:00 UTC, an hour before UTC midnight', () => {
    expect(studyDate(at('2026-11-03T22:59:59Z'))).toBe('2026-11-03');
    expect(studyDate(at('2026-11-03T23:00:00Z'))).toBe('2026-11-04');
  });

  it('keeps the early hours of a UTC day on the same Lagos day', () => {
    expect(studyDate(at('2026-11-04T00:30:00Z'))).toBe('2026-11-04');
  });

  it('handles month and year boundaries', () => {
    expect(studyDate(at('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('starts a study day at 23:00 UTC the evening before', () => {
    expect(startOfStudyDay('2026-11-04').toISOString()).toBe('2026-11-03T23:00:00.000Z');
  });

  it('works in another timezone with daylight saving', () => {
    // London is UTC+1 in summer and UTC+0 in winter.
    expect(studyDate(at('2026-07-01T23:30:00Z'), 'Europe/London')).toBe('2026-07-02');
    expect(studyDate(at('2026-12-01T23:30:00Z'), 'Europe/London')).toBe('2026-12-01');
    expect(startOfStudyDay('2026-07-02', 'Europe/London').toISOString()).toBe(
      '2026-07-01T23:00:00.000Z',
    );
  });

  it('numbers weekdays from Monday', () => {
    expect(weekdayOf('2026-11-02')).toBe(0); // a Monday
    expect(weekdayOf('2026-11-08')).toBe(6);
  });
});

describe('rollup', () => {
  it('puts reading just after 23:00 UTC on the next Lagos day', () => {
    const result = rollup({
      reading: [
        { startedAt: at('2026-11-03T22:40:00Z'), endedAt: at('2026-11-03T22:52:00Z') },
        { startedAt: at('2026-11-03T23:05:00Z'), endedAt: at('2026-11-03T23:20:00Z') },
      ],
      reads: [],
      answers: [],
    });
    expect(result.map((day) => [day.date, day.readingMinutes])).toEqual([
      ['2026-11-03', 12],
      ['2026-11-04', 15],
    ]);
  });

  it('counts a study day from one graded answer or ten minutes of reading', () => {
    const result = rollup({
      reading: [{ startedAt: at('2026-11-01T08:00:00Z'), endedAt: at('2026-11-01T08:09:00Z') }],
      reads: [],
      answers: [at('2026-11-02T09:00:00Z')],
    });
    expect(result.map((day) => [day.date, day.intensity])).toEqual([
      ['2026-11-01', 0],
      ['2026-11-02', 1],
    ]);
  });

  it('caps a single reading event at two hours', () => {
    const [day] = rollup({
      reading: [{ startedAt: at('2026-11-01T06:00:00Z'), endedAt: at('2026-11-01T18:00:00Z') }],
      reads: [],
      answers: [],
    });
    expect(day!.readingMinutes).toBe(120);
  });

  it('grades intensity in three steps', () => {
    const base = { sectionsRead: 0, answersGraded: 0, projectEvents: 0 };
    expect(intensityOf({ ...base, readingMinutes: 9 })).toBe(0);
    expect(intensityOf({ ...base, readingMinutes: 10 })).toBe(1);
    expect(intensityOf({ ...base, readingMinutes: 40 })).toBe(2);
    expect(intensityOf({ ...base, readingMinutes: 60, answersGraded: 10 })).toBe(3);
  });
});

describe('uptime', () => {
  it('counts a streak that ends today', () => {
    expect(uptime(days('2026-11-02', '2026-11-03', '2026-11-04'), '2026-11-04')).toBe(3);
  });

  it('keeps a streak that ended yesterday, since today may still count', () => {
    expect(uptime(days('2026-11-02', '2026-11-03'), '2026-11-04')).toBe(2);
  });

  it('drops to zero after a full missed day', () => {
    expect(uptime(days('2026-11-01', '2026-11-02'), '2026-11-04')).toBe(0);
  });

  it('ignores days that did not count as study', () => {
    const list = [...days('2026-11-02', '2026-11-04'), { date: '2026-11-03', intensity: 0 }];
    expect(uptime(list, '2026-11-04')).toBe(1);
  });

  it('follows the Lagos day across UTC midnight', () => {
    // Studying at 23:30 UTC on the 3rd lands on the 4th in Lagos, so it extends a streak to the 4th.
    const today = studyDate(at('2026-11-03T23:30:00Z'));
    expect(today).toBe('2026-11-04');
    expect(uptime(days('2026-11-03', '2026-11-04'), today)).toBe(2);
  });

  it('finds the longest run and the last gap', () => {
    const list = days('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-06', '2026-10-07');
    expect(longestUptime(list)).toBe(3);
    expect(lastGap(list)).toBe(2);
    expect(lastGap(days('2026-10-01', '2026-10-02'))).toBeNull();
  });
});

describe('patterns and mastery', () => {
  it('finds the best weekday', () => {
    expect(bestWeekday(days('2026-11-03', '2026-11-10', '2026-11-05'))).toBe(1); // Tuesdays
    expect(bestWeekday([])).toBeNull();
  });

  it('joins reading events less than 15 minutes apart into one session', () => {
    const minutes = (start: string, end: string) => ({
      startedAt: at(`2026-11-03T${start}:00Z`),
      endedAt: at(`2026-11-03T${end}:00Z`),
    });
    // Sessions of 30 (two events joined), 10 and 50 minutes: the median is 30.
    expect(
      typicalSession([
        minutes('08:00', '08:20'),
        minutes('08:25', '08:30'),
        minutes('12:00', '12:10'),
        minutes('18:00', '18:50'),
      ]),
    ).toBe(30);
    expect(typicalSession([])).toBeNull();
  });

  it('weighs checkpoint acceptance and confidence 0.7 to 0.3, and 0 before any attempt', () => {
    expect(sectionMastery(0.8, 'solid')).toBeCloseTo(0.86);
    expect(sectionMastery(0.5, 'shaky')).toBeCloseTo(0.44);
    expect(sectionMastery(1, null)).toBeCloseTo(0.7);
    expect(sectionMastery(null, 'solid')).toBe(0);
  });
});
