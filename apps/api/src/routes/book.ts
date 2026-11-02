import {
  figureNumberSchema,
  sectionNumberSchema,
  type BookResponse,
  type GlossaryResponse,
  type SectionResponse,
} from '@forward-pass/shared';
import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import type { Db } from '../db';
import { sendError } from '../http';

interface BookRouterDeps {
  db: Db;
  /** content/figures */
  figuresDir: string;
}

const figureUrl = (number: string) => `/api/figures/${number}`;

/** Book text is for the two signed-in learners only; every route here requires a session. */
export function bookRouter({ db, figuresDir }: BookRouterDeps): Router {
  const router = Router();
  router.use(['/book', '/glossary', '/figures'], requireAuth);

  router.get('/book', async (_req, res) => {
    const [pages, chapters] = await Promise.all([
      db.bookPage.findMany({ where: { placement: 'front' }, orderBy: { orderIndex: 'asc' } }),
      db.chapter.findMany({
        orderBy: { number: 'asc' },
        include: { sections: { orderBy: { orderIndex: 'asc' } } },
      }),
    ]);
    const body: BookResponse = {
      frontMatter: pages.map(({ slug, title, summary }) => ({ slug, title, summary })),
      chapters: chapters.map((chapter) => ({
        number: chapter.number,
        slug: chapter.slug,
        title: chapter.title,
        summary: chapter.summary,
        sections: chapter.sections.map((section) => ({
          number: section.number,
          slug: section.slug,
          title: section.title,
          summary: section.summary,
          readingMinutes: section.readingMinutes,
          readState: 'unread',
        })),
      })),
    };
    res.json(body);
  });

  router.get('/book/sections/:number', async (req, res) => {
    const parsed = sectionNumberSchema.safeParse(req.params.number);
    if (!parsed.success)
      return sendError(res, 400, 'invalid_section', 'Use a section number like 5.2.');

    const section = await db.section.findUnique({
      where: { number: parsed.data },
      include: {
        chapter: true,
        subsections: { orderBy: { orderIndex: 'asc' } },
        figures: { orderBy: { number: 'asc' } },
      },
    });
    if (!section) return sendError(res, 404, 'not_found', `No section ${parsed.data}.`);

    const [previous, next] = await Promise.all([
      db.section.findFirst({
        where: { orderIndex: { lt: section.orderIndex } },
        orderBy: { orderIndex: 'desc' },
        select: { number: true, title: true },
      }),
      db.section.findFirst({
        where: { orderIndex: { gt: section.orderIndex } },
        orderBy: { orderIndex: 'asc' },
        select: { number: true, title: true },
      }),
    ]);

    const body: SectionResponse = {
      number: section.number,
      slug: section.slug,
      title: section.title,
      summary: section.summary,
      readingMinutes: section.readingMinutes,
      readState: 'unread',
      chapter: {
        number: section.chapter.number,
        slug: section.chapter.slug,
        title: section.chapter.title,
      },
      intro: section.intro,
      subsections: section.subsections.map(({ number, title, markdown }) => ({
        number,
        title,
        markdown,
      })),
      figures: section.figures
        // Figure numbers sort as text ("5.10" < "5.3"); order them numerically.
        .sort((a, b) => Number(a.number.split('.')[1]) - Number(b.number.split('.')[1]))
        .map((figure) => ({
          number: figure.number,
          caption: figure.caption,
          url: figureUrl(figure.number),
          subsectionNumber: figure.subsectionNumber,
        })),
      wordCount: section.wordCount,
      previous,
      next,
    };
    res.json(body);
  });

  router.get('/glossary', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    const terms = await db.glossaryTerm.findMany({
      where: q
        ? {
            OR: [
              { term: { contains: q, mode: 'insensitive' } },
              { definition: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { term: 'asc' },
    });
    // Matches on the term itself first, then matches in the definition.
    const needle = q.toLowerCase();
    const ranked = q
      ? [...terms].sort(
          (a, b) =>
            Number(!a.term.toLowerCase().includes(needle)) -
            Number(!b.term.toLowerCase().includes(needle)),
        )
      : terms;
    const body: GlossaryResponse = {
      terms: ranked.map(({ term, slug, definition, sectionNumber }) => ({
        term,
        slug,
        definition,
        sectionNumber,
      })),
    };
    res.json(body);
  });

  router.get('/figures/:number', async (req, res) => {
    const parsed = figureNumberSchema.safeParse(req.params.number);
    if (!parsed.success)
      return sendError(res, 400, 'invalid_figure', 'Use a figure number like 5.3.');

    const figure = await db.figure.findUnique({ where: { number: parsed.data } });
    if (!figure) return sendError(res, 404, 'not_found', `No figure ${parsed.data}.`);

    // fileName comes from the ingest, never from the request; `root` keeps it inside figuresDir.
    res.sendFile(
      figure.fileName,
      { root: figuresDir, maxAge: '1d', headers: { 'X-Content-Type-Options': 'nosniff' } },
      (error) => {
        if (error && !res.headersSent) {
          sendError(
            res,
            404,
            'not_found',
            `Figure ${parsed.data} has not been downloaded. Run pnpm content:ingest.`,
          );
        }
      },
    );
  });

  return router;
}
