import { CHECKPOINT_PASS, type Confidence } from '@forward-pass/shared';
import { hashPassword } from '../auth/password';
import { sampleQuestions, seededRandom } from '../checkpoints/sample';
import type { LoadedContent } from '../content/load';
import type { Db } from '../db';
import { readingOrder } from '../lessons/progress';
import { addDays, startOfStudyDay, studyDate } from '../progress/days';
import { rebuildStudyDays } from '../progress/store';

// Made-up study history for two demo learners, so Home and Progress have something to show.
// Deterministic: the same seed and `now` give the same rows. It never touches real accounts.

export const SEED_USERS = [
  { email: 'tofa@seed.test', displayName: 'Tofa', initial: 'T', colour: 'lime' as const },
  { email: 'friend@seed.test', displayName: 'Friend', initial: 'F', colour: 'butter' as const },
];

export class SeedRefused extends Error {
  override name = 'SeedRefused';
}

export interface SeedOptions {
  seed: string;
  days?: number;
  now?: Date;
  /** For the demo accounts; they sign in with it directly. */
  password: string;
}

export interface SeedSummary {
  users: { email: string; studyDays: number; lessonsRead: number; attempts: number }[];
}

const MINUTE = 60 * 1000;

export async function seedActivity(
  db: Db,
  content: LoadedContent,
  { seed, days = 60, now = new Date(), password }: SeedOptions,
): Promise<SeedSummary> {
  const emails = SEED_USERS.map((user) => user.email);
  const strangers = await db.user.count({ where: { email: { notIn: emails } } });
  if (strangers > 0) {
    throw new SeedRefused(
      'This database has real accounts. The seed writes made-up activity, so run it on an empty database.',
    );
  }
  const order = await readingOrder(db);
  if (!order.length) throw new SeedRefused('Ingest the book first: pnpm content:ingest.');

  const passwordHash = await hashPassword(password);
  const users = [];
  for (const spec of SEED_USERS) {
    users.push(
      await db.user.upsert({
        where: { email: spec.email },
        create: { ...spec, passwordHash },
        update: { passwordHash, mustChangePassword: false, longestUptime: 0 },
      }),
    );
  }
  const ids = users.map((user) => user.id);
  const mine = { userId: { in: ids } };
  const attemptIds = (await db.attempt.findMany({ where: mine, select: { id: true } })).map(
    (row) => row.id,
  );
  await db.$transaction([
    db.attemptHint.deleteMany({ where: { attemptId: { in: attemptIds } } }),
    db.answer.deleteMany({ where: mine }),
    db.attempt.deleteMany({ where: mine }),
    db.readingEvent.deleteMany({ where: mine }),
    db.lessonProgress.deleteMany({ where: mine }),
    db.confidenceRating.deleteMany({ where: mine }),
    db.note.deleteMany({ where: mine }),
    db.studyDay.deleteMany({ where: mine }),
  ]);

  const today = studyDate(now);
  const summary: SeedSummary = { users: [] };
  for (const user of users) {
    const random = seededRandom(`${seed}:${user.email}`);
    const between = (low: number, high: number) => low + random() * (high - low);
    // Each learner gets a habit: how often they study and how fast they move.
    const studyChance = between(0.55, 0.9);
    const finishChance = between(0.3, 0.6);
    const skill = between(0.55, 0.9);

    let next = 0;
    let lastStudy: Date | null = null;
    let studyDays = 0;
    let attempts = 0;
    for (let back = days - 1; back >= 0; back--) {
      const date = addDays(today, -back);
      if (random() > studyChance) continue;
      studyDays++;
      const dayStart = startOfStudyDay(date).getTime();
      // One or two sessions between 07:00 and 21:00, ending before now.
      let clock = dayStart + between(7, 12) * 60 * MINUTE;
      for (let session = random() < 0.35 ? 2 : 1; session > 0; session--) {
        const minutes = Math.round(between(12, 55));
        const startedAt = new Date(clock);
        const endedAt = new Date(clock + minutes * MINUTE);
        if (endedAt > now) break;
        await db.readingEvent.create({
          data: {
            userId: user.id,
            lessonId: order[next]?.id ?? order.at(-1)!.id,
            startedAt,
            endedAt,
            maxScrollPct: 100,
          },
        });
        clock = endedAt.getTime() + between(2, 6) * 60 * MINUTE;
        lastStudy = endedAt;
      }

      if (next >= order.length || random() > finishChance) continue;
      const lesson = order[next]!;
      next++;
      const readAt = new Date(Math.min(clock, now.getTime() - MINUTE));
      await db.lessonProgress.create({
        data: {
          userId: user.id,
          lessonId: lesson.id,
          maxScrollPct: 100,
          readAt,
          updatedAt: readAt,
        },
      });
      const roll = random();
      const level: Confidence = roll < 0.2 ? 'shaky' : roll < 0.6 ? 'okay' : 'solid';
      await db.confidenceRating.create({
        data: { userId: user.id, lessonId: lesson.id, level, createdAt: readAt },
      });

      const digest = content.digests.get(lesson.id);
      if (digest) {
        await db.answer.create({
          data: {
            userId: user.id,
            lessonId: lesson.id,
            questionId: digest.checkQuestion.id,
            context: 'check',
            answer: { kind: 'text', text: 'seeded' },
            accepted: random() < skill,
            firstTry: true,
            createdAt: readAt,
          },
        });
      }

      const bank = content.banks.get(lesson.id);
      if (bank && random() < 0.85) {
        const questionIds = sampleQuestions(bank.questions, {
          seed: `${seed}:${user.email}:${lesson.id}`,
        });
        const takenAt = new Date(readAt.getTime() + 10 * MINUTE);
        if (takenAt > now) continue;
        const results = questionIds.map(() => random() < skill);
        const firstTryAccepted = results.filter(Boolean).length;
        const attempt = await db.attempt.create({
          data: {
            userId: user.id,
            sectionNumber: lesson.id,
            seed: `${seed}:${lesson.id}`,
            questionIds,
            startedAt: takenAt,
            completedAt: new Date(takenAt.getTime() + 12 * MINUTE),
            firstTryAccepted,
            hints: Math.round(between(0, 2)),
            passed: firstTryAccepted >= CHECKPOINT_PASS,
          },
        });
        await db.answer.createMany({
          data: questionIds.map((questionId, index) => ({
            userId: user.id,
            lessonId: lesson.id,
            questionId,
            context: 'checkpoint',
            attemptId: attempt.id,
            answer: { kind: 'text', text: 'seeded' },
            accepted: results[index]!,
            firstTry: true,
            feedback: results[index] ? 'Accepted.' : 'Not accepted.',
            createdAt: new Date(takenAt.getTime() + index * MINUTE),
          })),
        });
        attempts++;
      }
    }

    // Leave the next lesson part-read, so Home has something to continue.
    const current = order[next];
    if (current) {
      await db.lessonProgress.create({
        data: {
          userId: user.id,
          lessonId: current.id,
          maxScrollPct: Math.round(between(15, 70)),
          updatedAt: lastStudy ?? now,
        },
      });
    }
    await rebuildStudyDays(db, user.id);
    summary.users.push({ email: user.email, studyDays, lessonsRead: next, attempts });
  }
  return summary;
}
