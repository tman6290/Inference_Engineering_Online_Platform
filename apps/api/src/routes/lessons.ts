import {
  checkAnswerRequestSchema,
  confidenceRequestSchema,
  grade,
  lessonIdSchema,
  noteRequestSchema,
  READ_AT_SCROLL_PCT,
  readingEventRequestSchema,
  sectionNumberSchema,
  toPublicDigest,
  type CheckResult,
  type DigestResponse,
  type LessonResponse,
} from '@forward-pass/shared';
import { Router, type Response } from 'express';
import { authLocals, requireAuth } from '../auth/middleware';
import { countWords, readingMinutes, slugify, stripPageHeader } from '../book/parse';
import type { LoadedContent } from '../content/load';
import type { Db } from '../db';
import { sendError, sendValidationError } from '../http';
import { exerciseSummaries } from './exercises';
import {
  confidenceByLesson,
  progressByLesson,
  readingOrder,
  readStateOf,
} from '../lessons/progress';

interface LessonRouterDeps {
  db: Db;
  content: LoadedContent;
}

/** After this many misses the check question shows its explanation anyway. */
const REVEAL_AFTER_ATTEMPTS = 3;

const figureUrl = (number: string) => `/api/figures/${number}`;

/** Figure numbers sort as text ("5.10" < "5.3"); order them by their second part. */
const byFigureNumber = (a: { number: string }, b: { number: string }) =>
  Number(a.number.split('.')[1]) - Number(b.number.split('.')[1]);

function parseLessonId(res: Response, raw: string): string | null {
  const parsed = lessonIdSchema.safeParse(raw);
  if (!parsed.success) {
    sendError(res, 400, 'invalid_lesson', 'Use a lesson id like 5.2, 0 or preface.');
    return null;
  }
  return parsed.data;
}

export function lessonRouter({ db, content }: LessonRouterDeps): Router {
  const router = Router();
  router.use(['/lessons', '/sections'], requireAuth);
  router.use('/book/sections/:number/digest', requireAuth);

  /** Whether a lesson exists in the ingested book. */
  async function lessonExists(id: string): Promise<boolean> {
    if (id === 'preface')
      return Boolean(await db.bookPage.findUnique({ where: { slug: 'preface' } }));
    if (id === '0') return Boolean(await db.chapter.findUnique({ where: { number: 0 } }));
    return Boolean(await db.section.findUnique({ where: { number: id } }));
  }

  router.get('/book/sections/:number/digest', (req, res) => {
    const parsed = sectionNumberSchema.safeParse(req.params.number);
    if (!parsed.success)
      return sendError(res, 400, 'invalid_section', 'Use a section number like 5.2.');
    const digest = content.digests.get(parsed.data);
    const body: DigestResponse = { digest: digest ? toPublicDigest(digest) : null };
    res.json(body);
  });

  router.get('/lessons/:id', async (req, res) => {
    const id = parseLessonId(res, req.params.id);
    if (!id) return;
    const userId = authLocals(res).userId!;

    // Book text, figures and the chapter outline differ by lesson kind; the rest is shared.
    let kind: LessonResponse['kind'];
    let number: string | null = null;
    let title: string;
    let summary: string;
    let intro: string;
    let subsections: LessonResponse['subsections'] = [];
    let figures: LessonResponse['figures'];
    let chapterNumber: number | null = null;
    let boldTerms: string[] = [];

    if (id === 'preface') {
      const page = await db.bookPage.findUnique({ where: { slug: 'preface' } });
      if (!page) return sendError(res, 404, 'not_found', 'The Preface has not been ingested.');
      const rows = await db.figure.findMany({ where: { pageSlug: 'preface' } });
      kind = 'page';
      title = page.title;
      summary = page.summary;
      intro = stripPageHeader(page.markdown).body;
      figures = rows.sort(byFigureNumber).map((figure) => ({
        number: figure.number,
        caption: figure.caption,
        url: figureUrl(figure.number),
        subsectionNumber: null,
      }));
    } else if (id === '0') {
      const chapter = await db.chapter.findUnique({
        where: { number: 0 },
        include: { figures: { where: { sectionNumber: null } } },
      });
      if (!chapter) return sendError(res, 404, 'not_found', 'Chapter 0 has not been ingested.');
      kind = 'chapter';
      title = chapter.title;
      summary = chapter.summary;
      intro = chapter.intro;
      chapterNumber = 0;
      figures = chapter.figures.sort(byFigureNumber).map((figure) => ({
        number: figure.number,
        caption: figure.caption,
        url: figureUrl(figure.number),
        subsectionNumber: null,
      }));
    } else {
      const section = await db.section.findUnique({
        where: { number: id },
        include: { subsections: { orderBy: { orderIndex: 'asc' } }, figures: true },
      });
      if (!section) return sendError(res, 404, 'not_found', `No section ${id}.`);
      kind = 'section';
      number = section.number;
      title = section.title;
      summary = section.summary;
      intro = section.intro;
      chapterNumber = section.chapterNumber;
      boldTerms = section.boldTerms;
      subsections = section.subsections.map((sub) => ({
        number: sub.number,
        title: sub.title,
        markdown: sub.markdown,
        readingMinutes: readingMinutes(countWords(sub.markdown)),
      }));
      figures = section.figures.sort(byFigureNumber).map((figure) => ({
        number: figure.number,
        caption: figure.caption,
        url: figureUrl(figure.number),
        subsectionNumber: figure.subsectionNumber,
      }));
    }

    const wordCount =
      countWords(intro) + subsections.reduce((sum, sub) => sum + countWords(sub.markdown), 0);
    const [order, progress, confidence, users, notes, answers, chapter, exercises] =
      await Promise.all([
        readingOrder(db),
        progressByLesson(db, userId),
        confidenceByLesson(db, userId),
        db.user.findMany({ orderBy: { createdAt: 'asc' } }),
        db.note.findMany({ where: { lessonId: id } }),
        db.answer.findMany({
          where: { userId, lessonId: id, context: 'check' },
          orderBy: { createdAt: 'asc' },
        }),
        chapterNumber === null
          ? null
          : db.chapter.findUnique({
              where: { number: chapterNumber },
              include: {
                sections: {
                  orderBy: { orderIndex: 'asc' },
                  include: { subsections: { orderBy: { orderIndex: 'asc' } } },
                },
              },
            }),
        exerciseSummaries(db, content, userId, id),
      ]);

    // Glossary terms for the right rail: the digest's list, else bold phrases that are glossary terms.
    const digest = content.digests.get(id) ?? null;
    const wanted = (digest?.terms ?? boldTerms).map(slugify);
    const glossary = wanted.length
      ? await db.glossaryTerm.findMany({ where: { slug: { in: wanted } } })
      : [];
    const terms = wanted
      .map((slug) => glossary.find((term) => term.slug === slug))
      .filter((term): term is NonNullable<typeof term> => Boolean(term))
      .slice(0, 5)
      .map(({ term, slug, definition }) => ({ term, slug, definition }));

    const partnerUser = users.find((user) => user.id !== userId) ?? null;
    const partnerConfidence = partnerUser
      ? await db.confidenceRating.findFirst({
          where: { userId: partnerUser.id, lessonId: id },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    const noteOf = (ownerId: string) => {
      const note = notes.find((row) => row.userId === ownerId);
      return note && note.body.trim()
        ? { body: note.body, updatedAt: note.updatedAt.toISOString() }
        : null;
    };

    const lastAnswer = answers.at(-1);
    const check: CheckResult | null =
      digest && lastAnswer
        ? {
            accepted: answers.some((answer) => answer.accepted),
            attempts: answers.length,
            feedback: '',
            explanation:
              answers.some((answer) => answer.accepted) || answers.length >= REVEAL_AFTER_ATTEMPTS
                ? digest.checkQuestion.explanation
                : null,
            choice:
              (lastAnswer.answer as { kind?: string; choice?: number }).kind === 'scenario_mc'
                ? ((lastAnswer.answer as { choice: number }).choice ?? null)
                : null,
          }
        : null;

    const position = order.findIndex((lesson) => lesson.id === id);
    const own = progress.get(id);
    const body: LessonResponse = {
      id,
      kind,
      number,
      title,
      summary,
      readingMinutes: readingMinutes(wordCount),
      hasCheckpoint: kind === 'section' && content.banks.has(id),
      chapter: chapter
        ? {
            number: chapter.number,
            slug: chapter.slug,
            title: chapter.title,
            summary: chapter.summary,
            lessons:
              chapter.number === 0
                ? [
                    {
                      id: '0',
                      title: chapter.title,
                      readState: readStateOf(progress.get('0')),
                      subsections: [],
                    },
                  ]
                : chapter.sections.map((section) => ({
                    id: section.number,
                    title: section.title,
                    readState: readStateOf(progress.get(section.number)),
                    subsections: section.subsections.map(({ number: sub, title: subTitle }) => ({
                      number: sub,
                      title: subTitle,
                    })),
                  })),
          }
        : null,
      intro,
      subsections,
      figures,
      digest: digest ? toPublicDigest(digest) : null,
      terms,
      exercises,
      progress: {
        readState: readStateOf(own),
        maxScrollPct: own?.maxScrollPct ?? 0,
        confidence: confidence.get(id) ?? null,
      },
      check,
      note: noteOf(userId),
      partner: partnerUser
        ? {
            displayName: partnerUser.displayName,
            initial: partnerUser.initial,
            colour: partnerUser.colour,
            confidence: partnerConfidence?.level ?? null,
            note: noteOf(partnerUser.id),
          }
        : null,
      previous: position > 0 ? order[position - 1]! : null,
      next: position >= 0 && position < order.length - 1 ? order[position + 1]! : null,
    };
    res.json(body);
  });

  /** Upserts progress: keeps the furthest scroll, and stamps readAt once the lesson counts as read. */
  async function recordProgress(
    userId: string,
    lessonId: string,
    scrollPct: number,
    markRead: boolean,
  ) {
    const existing = await db.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });
    const maxScrollPct = Math.max(existing?.maxScrollPct ?? 0, scrollPct);
    const readAt =
      existing?.readAt ?? (markRead || maxScrollPct >= READ_AT_SCROLL_PCT ? new Date() : null);
    return db.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: { userId, lessonId, maxScrollPct, readAt },
      update: { maxScrollPct, readAt },
    });
  }

  router.post('/lessons/:id/reading', async (req, res) => {
    const id = parseLessonId(res, req.params.id);
    if (!id) return;
    const parsed = readingEventRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    if (!(await lessonExists(id))) return sendError(res, 404, 'not_found', `No lesson ${id}.`);
    const userId = authLocals(res).userId!;

    await db.readingEvent.create({
      data: {
        userId,
        lessonId: id,
        startedAt: new Date(parsed.data.startedAt),
        endedAt: new Date(parsed.data.endedAt),
        maxScrollPct: parsed.data.maxScrollPct,
      },
    });
    const progress = await recordProgress(userId, id, parsed.data.maxScrollPct, false);
    const latest = (await confidenceByLesson(db, userId)).get(id) ?? null;
    res.json({
      readState: readStateOf(progress),
      maxScrollPct: progress.maxScrollPct,
      confidence: latest,
    });
  });

  // Rating confidence also marks the lesson read.
  router.put('/sections/:id/confidence', async (req, res) => {
    const id = parseLessonId(res, req.params.id);
    if (!id) return;
    const parsed = confidenceRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    if (!(await lessonExists(id))) return sendError(res, 404, 'not_found', `No lesson ${id}.`);
    const userId = authLocals(res).userId!;

    await db.confidenceRating.create({ data: { userId, lessonId: id, level: parsed.data.level } });
    const progress = await recordProgress(userId, id, 0, true);
    res.json({
      readState: readStateOf(progress),
      maxScrollPct: progress.maxScrollPct,
      confidence: parsed.data.level,
    });
  });

  router.put('/lessons/:id/note', async (req, res) => {
    const id = parseLessonId(res, req.params.id);
    if (!id) return;
    const parsed = noteRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    if (!(await lessonExists(id))) return sendError(res, 404, 'not_found', `No lesson ${id}.`);
    const userId = authLocals(res).userId!;

    const note = await db.note.upsert({
      where: { userId_lessonId: { userId, lessonId: id } },
      create: { userId, lessonId: id, body: parsed.data.body },
      update: { body: parsed.data.body },
    });
    res.json({ body: note.body, updatedAt: note.updatedAt.toISOString() });
  });

  // The lesson's "Check yourself" question, graded against its key. Counts toward acceptance rate.
  router.post('/lessons/:id/check', async (req, res) => {
    const id = parseLessonId(res, req.params.id);
    if (!id) return;
    const digest = content.digests.get(id);
    if (!digest) return sendError(res, 404, 'not_found', `Lesson ${id} has no check question.`);
    const parsed = checkAnswerRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const userId = authLocals(res).userId!;
    const question = digest.checkQuestion;

    const previous = await db.answer.findMany({
      where: { userId, questionId: question.id, context: 'check' },
    });
    const result = grade(question, parsed.data);
    await db.answer.create({
      data: {
        userId,
        lessonId: id,
        questionId: question.id,
        context: 'check',
        answer: parsed.data,
        accepted: result.accepted,
        firstTry: previous.length === 0,
      },
    });
    const attempts = previous.length + 1;
    const accepted = result.accepted || previous.some((answer) => answer.accepted);
    const body: CheckResult = {
      accepted: result.accepted,
      attempts,
      feedback: result.feedback,
      explanation: accepted || attempts >= REVEAL_AFTER_ATTEMPTS ? question.explanation : null,
      choice: parsed.data.kind === 'scenario_mc' ? parsed.data.choice : null,
    };
    res.json(body);
  });

  return router;
}
