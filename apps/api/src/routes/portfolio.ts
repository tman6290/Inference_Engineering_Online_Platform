import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import {
  portfolioSettingsRequestSchema,
  visibilityRequestSchema,
  type PortfolioResponse,
} from '@forward-pass/shared';
import { Router, type Response } from 'express';
import { authLocals, requireAuth } from '../auth/middleware';
import type { LoadedContent } from '../content/load';
import type { Db } from '../db';
import { sendError, sendValidationError } from '../http';
import { caseStudyHtml, PdfUnavailableError, renderPdf } from '../portfolio/pdf';
import {
  caseStudyOf,
  chartDataUri,
  chartsOf,
  critiqueOf,
  liveOwner,
  profileOf,
  publicSubmission,
  shippedProjects,
  submissionFilesDir,
} from '../portfolio/views';

interface PortfolioRouterDeps {
  db: Db;
  content: LoadedContent;
  uploadsDir: string;
  /** Turns HTML into PDF bytes. Defaults to headless Chromium. */
  pdf?: (html: string) => Promise<Buffer>;
}

const enc = encodeURIComponent;
const NOT_FOUND = 'There is no public page here.';

export function portfolioRouter({
  db,
  content,
  uploadsDir,
  pdf = renderPdf,
}: PortfolioRouterDeps): Router {
  const router = Router();

  // ---------------------------------------------------------------------------------------------
  // The owner's side: settings, what is public, and the PDF.

  async function portfolio(userId: string): Promise<PortfolioResponse> {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      username: user.username,
      pageLive: user.pageLive,
      shipped: await shippedProjects(db, content, userId),
    };
  }

  router.get('/portfolio', requireAuth, async (_req, res) => {
    res.json(await portfolio(authLocals(res).userId!));
  });

  router.put('/portfolio/settings', requireAuth, async (req, res) => {
    const parsed = portfolioSettingsRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const userId = authLocals(res).userId!;
    const { username, pageLive } = parsed.data;
    if (username) {
      const taken = await db.user.findFirst({ where: { username, id: { not: userId } } });
      if (taken) return sendError(res, 409, 'username_taken', 'That username is taken.');
    }
    await db.user.update({ where: { id: userId }, data: { username, pageLive } });
    res.json(await portfolio(userId));
  });

  /** The signed-in learner's own submission, or null after a 404. */
  async function own(res: Response, id: string) {
    const row = await db.submission.findUnique({ where: { id }, include: { critique: true } });
    if (!row || row.userId !== authLocals(res).userId) {
      sendError(res, 404, 'not_found', 'No such submission.');
      return null;
    }
    return row;
  }

  router.post('/submissions/:id/visibility', requireAuth, async (req, res) => {
    const parsed = visibilityRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const row = await own(res, String(req.params.id));
    if (!row) return;
    if (parsed.data.public && !(row.status === 'graded' && critiqueOf(row)?.portfolioReady)) {
      return sendError(
        res,
        409,
        'not_ready',
        'Only a graded, portfolio-ready version (80 or more) can be made public.',
      );
    }
    // At most one public version per project: making this one public hides the others.
    await db.$transaction([
      ...(parsed.data.public
        ? [
            db.submission.updateMany({
              where: { userId: row.userId, projectSlug: row.projectSlug, id: { not: row.id } },
              data: { public: false },
            }),
          ]
        : []),
      db.submission.update({ where: { id: row.id }, data: { public: parsed.data.public } }),
    ]);
    res.json(await portfolio(row.userId));
  });

  router.get('/submissions/:id/case-study.pdf', requireAuth, async (req, res) => {
    const row = await own(res, String(req.params.id));
    if (!row) return;
    if (!(row.status === 'graded' && critiqueOf(row)?.portfolioReady)) {
      return sendError(res, 409, 'not_ready', 'The PDF opens once a version scores 80 or more.');
    }
    const user = await db.user.findUniqueOrThrow({ where: { id: row.userId } });
    const study = await caseStudyOf(db, content, user, row, (name) => name);
    if (!study) return sendError(res, 404, 'not_found', 'No such project.');
    const charts = await Promise.all(
      study.charts.map(async (chart) => ({
        name: chart.name,
        src: await chartDataUri(uploadsDir, row.id, chart.name),
      })),
    );
    try {
      const bytes = await pdf(caseStudyHtml(study, charts));
      res.type('application/pdf');
      res.attachment(`${study.slug}-v${study.version}.pdf`);
      res.send(bytes);
    } catch (error) {
      if (error instanceof PdfUnavailableError) {
        return sendError(res, 503, 'pdf_unavailable', error.message);
      }
      throw error;
    }
  });

  // ---------------------------------------------------------------------------------------------
  // The public side: no session. Everything answers 404 unless the owner's page is live.

  router.get('/public/:username', async (req, res) => {
    const user = await liveOwner(db, req.params.username);
    if (!user) return sendError(res, 404, 'not_found', NOT_FOUND);
    res.json(await profileOf(db, content, user));
  });

  router.get('/public/:username/:slug', async (req, res) => {
    const user = await liveOwner(db, req.params.username);
    const row = user ? await publicSubmission(db, user.id, req.params.slug) : null;
    if (!user || !row) return sendError(res, 404, 'not_found', NOT_FOUND);
    const study = await caseStudyOf(
      db,
      content,
      user,
      row,
      (name) => `/api/public/${enc(user.username!)}/${enc(row.projectSlug)}/charts/${enc(name)}`,
    );
    if (!study) return sendError(res, 404, 'not_found', NOT_FOUND);
    res.json(study);
  });

  router.get('/public/:username/:slug/charts/:name', async (req, res) => {
    const user = await liveOwner(db, req.params.username);
    const row = user ? await publicSubmission(db, user.id, req.params.slug) : null;
    const chart = row
      ? (await chartsOf(db, row.id)).find((file) => file.name === req.params.name)
      : undefined;
    const full =
      row && chart ? path.join(submissionFilesDir(uploadsDir, row.id), chart.name) : null;
    if (!full || !existsSync(full)) return sendError(res, 404, 'not_found', NOT_FOUND);
    res.type('image/png');
    res.setHeader('cache-control', 'public, max-age=300');
    createReadStream(full).pipe(res);
  });

  return router;
}
