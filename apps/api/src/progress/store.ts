import type { RecallItem } from '@forward-pass/shared';
import type { Db } from '../db';
import { readingOrder } from '../lessons/progress';
import {
  addDays,
  longestUptime,
  rollup,
  startOfStudyDay,
  studyDate,
  uptime,
  type StudyDay,
} from './days';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Recall thresholds, in days since the rating. */
const RECALL_AFTER_DAYS = { solid: 21, okay: 10 } as const;

/**
 * Recomputes one learner's study days from reading events, read lessons and graded answers.
 * With `since`, only days from that date on are rebuilt, which keeps the frequent refreshes cheap.
 */
export async function rebuildStudyDays(
  db: Db,
  userId: string,
  { since }: { since?: string } = {},
): Promise<StudyDay[]> {
  const from = since ? startOfStudyDay(since) : undefined;
  const after = from ? { gte: from } : undefined;
  const [reading, reads, answers] = await Promise.all([
    db.readingEvent.findMany({
      where: { userId, ...(after ? { startedAt: after } : {}) },
      select: { startedAt: true, endedAt: true },
    }),
    db.lessonProgress.findMany({
      where: { userId, readAt: after ?? { not: null } },
      select: { readAt: true },
    }),
    db.answer.findMany({
      where: { userId, ...(after ? { createdAt: after } : {}) },
      select: { createdAt: true },
    }),
  ]);
  const days = rollup({
    reading,
    reads: reads.map((row) => row.readAt!),
    answers: answers.map((row) => row.createdAt),
  });

  await db.$transaction([
    db.studyDay.deleteMany({ where: { userId, ...(since ? { date: { gte: since } } : {}) } }),
    db.studyDay.createMany({ data: days.map((day) => ({ userId, ...day })) }),
  ]);

  const all = since ? await studyDaysOf(db, userId) : days;
  const longest = longestUptime(all);
  await db.user.updateMany({
    where: { id: userId, longestUptime: { lt: longest } },
    data: { longestUptime: longest },
  });
  return all;
}

export async function studyDaysOf(db: Db, userId: string): Promise<StudyDay[]> {
  return db.studyDay.findMany({ where: { userId }, orderBy: { date: 'asc' } });
}

/** Rebuilds today and yesterday, then returns every stored day. Called on reads of progress. */
export async function freshStudyDays(db: Db, userId: string, now = new Date()) {
  return rebuildStudyDays(db, userId, { since: addDays(studyDate(now), -1) });
}

export async function currentUptime(db: Db, userId: string, now = new Date()): Promise<number> {
  return uptime(await freshStudyDays(db, userId, now), studyDate(now));
}

export async function rebuildAll(db: Db): Promise<number> {
  const users = await db.user.findMany({ select: { id: true } });
  for (const user of users) await rebuildStudyDays(db, user.id);
  return users.length;
}

/** Runs a full rebuild shortly after every Lagos midnight. Returns a function that stops it. */
export function scheduleNightlyRebuild(db: Db, log: (message: string) => void = console.info) {
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    const now = new Date();
    const next = startOfStudyDay(addDays(studyDate(now), 1)).getTime() + 5 * 60 * 1000;
    timer = setTimeout(async () => {
      try {
        log(`progress: rebuilt study days for ${await rebuildAll(db)} learner(s)`);
      } catch (error) {
        console.error('progress: nightly rebuild failed', error);
      }
      arm();
    }, next - now.getTime());
    timer.unref?.();
  };
  arm();
  return () => clearTimeout(timer);
}

/** Latest confidence rating per lesson, with its date. */
export async function latestRatings(db: Db, userId: string) {
  const ratings = await db.confidenceRating.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  const latest = new Map<string, (typeof ratings)[number]>();
  for (const rating of ratings)
    if (!latest.has(rating.lessonId)) latest.set(rating.lessonId, rating);
  return latest;
}

/** Sections due for recall: rated solid 21+ days ago or okay 10+ days ago, oldest first. */
export async function recallQueue(db: Db, userId: string, now = new Date()): Promise<RecallItem[]> {
  const [latest, order, sections] = await Promise.all([
    latestRatings(db, userId),
    readingOrder(db),
    db.section.findMany({ select: { number: true } }),
  ]);
  // Numbered sections only: the Preface and Chapter 0 have no checkpoint to recall with.
  const numbered = new Set(sections.map((section) => section.number));
  return [...latest.values()]
    .filter(
      (rating) =>
        numbered.has(rating.lessonId) &&
        rating.level !== 'shaky' &&
        now.getTime() - rating.createdAt.getTime() >= RECALL_AFTER_DAYS[rating.level] * DAY_MS,
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((rating) => ({
      lessonId: rating.lessonId,
      title: order.find((lesson) => lesson.id === rating.lessonId)?.title ?? rating.lessonId,
      confidence: rating.level,
      ratedAt: rating.createdAt.toISOString(),
    }));
}

/** First-try acceptance across every graded answer: [accepted, answered]. */
export async function firstTryCounts(db: Db, userId: string): Promise<[number, number]> {
  return Promise.all([
    db.answer.count({ where: { userId, firstTry: true, accepted: true } }),
    db.answer.count({ where: { userId, firstTry: true } }),
  ]);
}

/** The latest finished solo checkpoint's acceptance per section. */
export async function latestAcceptance(db: Db, userId: string): Promise<Map<string, number>> {
  const finished = await db.attempt.findMany({
    where: { userId, kind: 'solo', completedAt: { not: null } },
    orderBy: { completedAt: 'asc' },
  });
  return new Map(
    finished.map((attempt) => [
      attempt.sectionNumber,
      (attempt.firstTryAccepted ?? 0) / Math.max(1, attempt.questionIds.length),
    ]),
  );
}
