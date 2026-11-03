import { randomUUID } from 'node:crypto';
import {
  attemptAnswerRequestSchema,
  grade,
  MAX_TRIES,
  sectionNumberSchema,
  type AttemptAnswerResponse,
  type AttemptResponse,
  type CheckpointBank,
  type CheckpointSectionResponse,
  type CheckpointsResponse,
} from '@forward-pass/shared';
import { Router, type Response } from 'express';
import { authLocals, requireAuth } from '../auth/middleware';
import { sampleQuestions } from '../checkpoints/sample';
import { answersByQuestion, questionState, summarize, tally } from '../checkpoints/state';
import type { LoadedContent } from '../content/load';
import type { AttemptRow, Db } from '../db';
import { sendError, sendValidationError } from '../http';
import { readingOrder } from '../lessons/progress';

interface CheckpointRouterDeps {
  db: Db;
  content: LoadedContent;
}

/** A question answered right first try is left out of new attempts for this long. */
const RECENT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Recall queue thresholds, in days since the rating. */
const RECALL_AFTER_DAYS = { solid: 21, okay: 10 } as const;

export function checkpointRouter({ db, content }: CheckpointRouterDeps): Router {
  const router = Router();
  router.use(['/checkpoints', '/attempts'], requireAuth);

  async function sectionOf(number: string) {
    const section = await db.section.findUnique({
      where: { number },
      include: { chapter: true },
    });
    if (!section) return null;
    const last = await db.section.findFirst({
      where: { chapterNumber: section.chapterNumber },
      orderBy: { orderIndex: 'desc' },
    });
    return { section, isLastInChapter: last?.number === number };
  }

  async function projectFor(number: string, userId: string): Promise<AttemptResponse['project']> {
    const found = await sectionOf(number);
    if (!found?.isLastInChapter) return null;
    const passed = await db.attempt.findFirst({
      where: { userId, sectionNumber: number, passed: true },
    });
    return {
      chapterNumber: found.section.chapterNumber,
      chapterTitle: found.section.chapter.title,
      unlocked: Boolean(passed),
    };
  }

  async function hintedIds(attemptId: string): Promise<Set<string>> {
    const rows = await db.attemptHint.findMany({ where: { attemptId } });
    return new Set(rows.map((row) => row.questionId));
  }

  /** Stamps the result. Unanswered questions count as missed. Safe to call twice. */
  async function finish(attempt: AttemptRow): Promise<void> {
    const answers = await db.answer.findMany({ where: { attemptId: attempt.id } });
    const counts = tally(attempt, answers, await hintedIds(attempt.id));
    await db.attempt.updateMany({
      where: { id: attempt.id, completedAt: null },
      data: { completedAt: new Date(), ...counts },
    });
  }

  async function attemptState(attempt: AttemptRow, bank: CheckpointBank): Promise<AttemptResponse> {
    const [answers, hinted, found, order] = await Promise.all([
      db.answer.findMany({ where: { attemptId: attempt.id } }),
      hintedIds(attempt.id),
      sectionOf(attempt.sectionNumber),
      readingOrder(db),
    ]);
    const grouped = answersByQuestion(answers);
    const done = attempt.completedAt !== null;
    const questions = attempt.questionIds.flatMap((id) => {
      const question = bank.questions.find((entry) => entry.id === id);
      return question ? [questionState(question, grouped.get(id) ?? [], hinted.has(id), done)] : [];
    });
    const position = order.findIndex((lesson) => lesson.id === attempt.sectionNumber);
    return {
      attempt: summarize(attempt, tally(attempt, answers, hinted)),
      section: {
        number: attempt.sectionNumber,
        title: found?.section.title ?? attempt.sectionNumber,
        chapterNumber: found?.section.chapterNumber ?? 0,
      },
      questions,
      project: await projectFor(attempt.sectionNumber, attempt.userId),
      next: position >= 0 ? (order[position + 1] ?? null) : null,
    };
  }

  /** The signed-in learner's attempt with its bank, or null after sending a 404. */
  async function ownAttempt(res: Response, id: string) {
    const attempt = await db.attempt.findUnique({ where: { id } });
    const bank = attempt ? content.banks.get(attempt.sectionNumber) : undefined;
    if (!attempt || attempt.userId !== authLocals(res).userId || !bank) {
      sendError(res, 404, 'not_found', 'No such attempt.');
      return null;
    }
    return { attempt, bank };
  }

  async function summaries(userId: string, sectionNumber?: string) {
    const attempts = await db.attempt.findMany({
      where: { userId, kind: 'solo', ...(sectionNumber ? { sectionNumber } : {}) },
      orderBy: { startedAt: 'desc' },
    });
    const open = attempts.filter((attempt) => !attempt.completedAt).map((attempt) => attempt.id);
    const [answers, hints] = open.length
      ? await Promise.all([
          db.answer.findMany({ where: { attemptId: { in: open } } }),
          db.attemptHint.findMany({ where: { attemptId: { in: open } } }),
        ])
      : [[], []];
    return attempts.map((attempt) =>
      summarize(
        attempt,
        tally(
          attempt,
          answers.filter((answer) => answer.attemptId === attempt.id),
          new Set(hints.filter((hint) => hint.attemptId === attempt.id).map((h) => h.questionId)),
        ),
      ),
    );
  }

  router.get('/checkpoints', async (_req, res) => {
    const userId = authLocals(res).userId!;
    const [sections, all, ratings, order] = await Promise.all([
      db.section.findMany({
        where: { number: { in: [...content.banks.keys()] } },
        include: { chapter: true },
        orderBy: { orderIndex: 'asc' },
      }),
      summaries(userId),
      db.confidenceRating.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      readingOrder(db),
    ]);

    const latestRating = new Map<string, (typeof ratings)[number]>();
    for (const rating of ratings)
      if (!latestRating.has(rating.lessonId)) latestRating.set(rating.lessonId, rating);
    const now = Date.now();
    const recall = [...latestRating.values()]
      .filter((rating) => {
        if (rating.level === 'shaky') return false;
        return now - rating.createdAt.getTime() >= RECALL_AFTER_DAYS[rating.level] * DAY_MS;
      })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((rating) => ({
        lessonId: rating.lessonId,
        title: order.find((lesson) => lesson.id === rating.lessonId)?.title ?? rating.lessonId,
        confidence: rating.level,
        ratedAt: rating.createdAt.toISOString(),
      }));

    const body: CheckpointsResponse = {
      sections: sections.map((section) => {
        const mine = all.filter((attempt) => attempt.sectionNumber === section.number);
        const finished = mine.filter((attempt) => attempt.completedAt);
        return {
          number: section.number,
          title: section.title,
          chapterNumber: section.chapterNumber,
          chapterTitle: section.chapter.title,
          openAttemptId: mine.find((attempt) => !attempt.completedAt)?.id ?? null,
          attempts: finished.length,
          best: finished.length ? Math.max(...finished.map((attempt) => attempt.acceptance)) : null,
          latest: finished[0] ?? null,
          passed: finished.some((attempt) => attempt.passed),
        };
      }),
      recall,
    };
    res.json(body);
  });

  function parseSection(res: Response, raw: string): string | null {
    const parsed = sectionNumberSchema.safeParse(raw);
    if (!parsed.success) {
      sendError(res, 400, 'invalid_section', 'Use a section number like 5.2.');
      return null;
    }
    if (!content.banks.has(parsed.data)) {
      sendError(res, 404, 'not_found', `Section ${parsed.data} has no checkpoint yet.`);
      return null;
    }
    return parsed.data;
  }

  router.get('/checkpoints/:section', async (req, res) => {
    const number = parseSection(res, req.params.section);
    if (!number) return;
    const userId = authLocals(res).userId!;
    const found = await sectionOf(number);
    if (!found) return sendError(res, 404, 'not_found', `No section ${number}.`);
    const attempts = await summaries(userId, number);
    const body: CheckpointSectionResponse = {
      section: {
        number,
        title: found.section.title,
        chapterNumber: found.section.chapterNumber,
      },
      bankSize: content.banks.get(number)!.questions.length,
      openAttemptId: attempts.find((attempt) => !attempt.completedAt)?.id ?? null,
      attempts: attempts.filter((attempt) => attempt.completedAt),
      project: await projectFor(number, userId),
    };
    res.json(body);
  });

  // Starts an attempt, or returns the open one: a learner has at most one per section.
  router.post('/checkpoints/:section/attempts', async (req, res) => {
    const number = parseSection(res, req.params.section);
    if (!number) return;
    const userId = authLocals(res).userId!;
    if (!(await sectionOf(number)))
      return sendError(res, 404, 'not_found', `No section ${number}.`);
    const bank = content.banks.get(number)!;

    const open = await db.attempt.findFirst({
      where: { userId, sectionNumber: number, kind: 'solo', completedAt: null },
    });
    if (open) return res.json(await attemptState(open, bank));

    const recent = await db.answer.findMany({
      where: {
        userId,
        context: 'checkpoint',
        lessonId: number,
        firstTry: true,
        accepted: true,
        createdAt: { gte: new Date(Date.now() - RECENT_DAYS * DAY_MS) },
      },
      select: { questionId: true },
    });
    const seed = randomUUID();
    const attempt = await db.attempt.create({
      data: {
        userId,
        sectionNumber: number,
        seed,
        questionIds: sampleQuestions(bank.questions, {
          seed,
          exclude: new Set(recent.map((row) => row.questionId)),
        }),
      },
    });
    res.status(201).json(await attemptState(attempt, bank));
  });

  router.get('/attempts/:id', async (req, res) => {
    const found = await ownAttempt(res, req.params.id);
    if (!found) return;
    res.json(await attemptState(found.attempt, found.bank));
  });

  /** Logs the hint and returns the attempt with its text filled in. */
  router.post('/attempts/:id/questions/:questionId/hint', async (req, res) => {
    const found = await ownAttempt(res, req.params.id);
    if (!found) return;
    const { attempt, bank } = found;
    const questionId = req.params.questionId;
    if (!attempt.questionIds.includes(questionId)) {
      return sendError(res, 400, 'not_in_attempt', 'That question is not part of this attempt.');
    }
    if (attempt.completedAt) {
      return sendError(res, 409, 'attempt_complete', 'This attempt is finished.');
    }
    await db.attemptHint.upsert({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId } },
      create: { attemptId: attempt.id, questionId },
      update: {},
    });
    res.json(await attemptState(attempt, bank));
  });

  router.post('/attempts/:id/answers', async (req, res) => {
    const found = await ownAttempt(res, req.params.id);
    if (!found) return;
    const { attempt, bank } = found;
    if (attempt.completedAt) {
      return sendError(res, 409, 'attempt_complete', 'This attempt is finished.');
    }
    const parsed = attemptAnswerRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const { questionId, answer, usedHint } = parsed.data;
    const question = bank.questions.find((entry) => entry.id === questionId);
    if (!question || !attempt.questionIds.includes(questionId)) {
      return sendError(res, 400, 'not_in_attempt', 'That question is not part of this attempt.');
    }

    const previous = await db.answer.findMany({ where: { attemptId: attempt.id, questionId } });
    if (previous.some((row) => row.accepted) || previous.length >= MAX_TRIES) {
      return sendError(res, 409, 'question_closed', 'That question is already closed.');
    }
    const hinted = await db.attemptHint.findUnique({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId } },
    });
    const result = grade(question, answer);
    await db.answer.create({
      data: {
        userId: attempt.userId,
        lessonId: attempt.sectionNumber,
        questionId,
        context: 'checkpoint',
        attemptId: attempt.id,
        answer,
        accepted: result.accepted,
        firstTry: previous.length === 0,
        usedHint: usedHint || Boolean(hinted),
        feedback: result.feedback,
      },
    });

    // The attempt finishes itself once every question is closed.
    const answers = await db.answer.findMany({ where: { attemptId: attempt.id } });
    const grouped = answersByQuestion(answers);
    const allClosed = attempt.questionIds.every((id) => {
      const rows = grouped.get(id) ?? [];
      return rows.some((row) => row.accepted) || rows.length >= MAX_TRIES;
    });
    if (allClosed) await finish(attempt);
    const fresh = await db.attempt.findUniqueOrThrow({ where: { id: attempt.id } });

    const body: AttemptAnswerResponse = {
      result: { questionId, accepted: result.accepted, feedback: result.feedback },
      state: await attemptState(fresh, bank),
    };
    res.json(body);
  });

  /** Ends the attempt now; questions still open count as missed. */
  router.post('/attempts/:id/finish', async (req, res) => {
    const found = await ownAttempt(res, req.params.id);
    if (!found) return;
    await finish(found.attempt);
    const fresh = await db.attempt.findUniqueOrThrow({ where: { id: found.attempt.id } });
    res.json(await attemptState(fresh, found.bank));
  });

  return router;
}
