import { randomUUID } from 'node:crypto';
import {
  attemptAnswerRequestSchema,
  CONFIDENCE_LEVELS,
  grade,
  MAX_TRIES,
  RECALL_QUESTIONS_PER_SECTION,
  RECALL_SECTIONS,
  sectionNumberSchema,
  type AttemptAnswerResponse,
  type AttemptResponse,
  type CheckpointBank,
  type CheckpointSectionResponse,
  type CheckpointsResponse,
} from '@forward-pass/shared';
import { Router, type Response } from 'express';
import { authLocals, requireAuth } from '../auth/middleware';
import { sampleQuestions, seededRandom } from '../checkpoints/sample';
import { answersByQuestion, questionState, summarize, tally } from '../checkpoints/state';
import type { LoadedContent } from '../content/load';
import type { AnswerRow, AttemptRow, Db } from '../db';
import { sendError, sendValidationError } from '../http';
import { readingOrder } from '../lessons/progress';
import { latestRatings, recallQueue } from '../progress/store';

interface CheckpointRouterDeps {
  db: Db;
  content: LoadedContent;
}

/** A question answered right first try is left out of new attempts for this long. */
const RECENT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function checkpointRouter({ db, content }: CheckpointRouterDeps): Router {
  const router = Router();
  router.use(['/checkpoints', '/attempts', '/recall'], requireAuth);

  /** A solo attempt's bank, or for a recall attempt every covered section's questions together. */
  function bankFor(attempt: AttemptRow): CheckpointBank | undefined {
    if (attempt.kind !== 'recall') return content.banks.get(attempt.sectionNumber);
    const banks = attempt.sectionNumbers.map((number) => content.banks.get(number));
    if (banks.some((bank) => !bank)) return undefined;
    return {
      sectionNumber: attempt.sectionNumber,
      questions: banks.flatMap((bank) => bank!.questions),
    };
  }

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
      where: { userId, sectionNumber: number, kind: 'solo', passed: true },
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
    const stamped = await db.attempt.updateMany({
      where: { id: attempt.id, completedAt: null },
      data: { completedAt: new Date(), ...counts },
    });
    if (stamped.count === 1 && attempt.kind === 'recall') await settleRecall(attempt, answers);
  }

  /**
   * After a recall attempt each section gets a fresh rating, which takes it off the queue. Two
   * misses in a row on a section (first tries, in the order asked) drop it one level.
   */
  async function settleRecall(attempt: AttemptRow, answers: AnswerRow[]) {
    const grouped = answersByQuestion(answers);
    const ratings = await latestRatings(db, attempt.userId);
    for (const number of attempt.sectionNumbers) {
      const asked = attempt.questionIds.filter((id) =>
        content.banks.get(number)?.questions.some((question) => question.id === id),
      );
      const missed = asked.map((id) => !grouped.get(id)?.[0]?.accepted);
      const twoInARow = missed.some((miss, index) => miss && missed[index + 1]);
      const current = ratings.get(number)?.level ?? 'okay';
      const index = CONFIDENCE_LEVELS.indexOf(current);
      const level = twoInARow ? CONFIDENCE_LEVELS[Math.max(0, index - 1)]! : current;
      await db.confidenceRating.create({
        data: { userId: attempt.userId, lessonId: number, level },
      });
    }
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
    const recall = attempt.kind === 'recall';
    return {
      attempt: summarize(attempt, tally(attempt, answers, hinted)),
      section: {
        number: attempt.sectionNumber,
        title: recall
          ? `Recall: ${attempt.sectionNumbers.join(', ')}`
          : (found?.section.title ?? attempt.sectionNumber),
        chapterNumber: found?.section.chapterNumber ?? 0,
      },
      questions,
      project: recall ? null : await projectFor(attempt.sectionNumber, attempt.userId),
      next: !recall && position >= 0 ? (order[position + 1] ?? null) : null,
    };
  }

  /** The signed-in learner's attempt with its bank, or null after sending a 404. */
  async function ownAttempt(res: Response, id: string) {
    const attempt = await db.attempt.findUnique({ where: { id } });
    const bank = attempt ? bankFor(attempt) : undefined;
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
    const [sections, all, recall] = await Promise.all([
      db.section.findMany({
        where: { number: { in: [...content.banks.keys()] } },
        include: { chapter: true },
        orderBy: { orderIndex: 'asc' },
      }),
      summaries(userId),
      recallQueue(db, userId),
    ]);

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

  // Spaced review: three questions from each due section, at most four sections. Resumes an open one.
  router.post('/recall/attempts', async (_req, res) => {
    const userId = authLocals(res).userId!;
    const open = await db.attempt.findFirst({
      where: { userId, kind: 'recall', completedAt: null },
    });
    const openBank = open ? bankFor(open) : undefined;
    if (open && openBank) return res.json(await attemptState(open, openBank));

    const due = (await recallQueue(db, userId))
      .filter((item) => content.banks.has(item.lessonId))
      .slice(0, RECALL_SECTIONS);
    if (!due.length) return sendError(res, 409, 'nothing_due', 'Nothing is due for recall yet.');
    const seed = randomUUID();
    const random = seededRandom(seed);
    const questionIds = due.flatMap((item) =>
      content.banks
        .get(item.lessonId)!
        .questions.map((question) => ({ id: question.id, order: random() }))
        .sort((a, b) => a.order - b.order)
        .slice(0, RECALL_QUESTIONS_PER_SECTION)
        .map((question) => question.id),
    );
    const attempt = await db.attempt.create({
      data: {
        userId,
        kind: 'recall',
        sectionNumber: due[0]!.lessonId,
        sectionNumbers: due.map((item) => item.lessonId),
        seed,
        questionIds,
      },
    });
    res.status(201).json(await attemptState(attempt, bankFor(attempt)!));
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
