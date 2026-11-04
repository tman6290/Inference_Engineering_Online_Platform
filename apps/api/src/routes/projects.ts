import { timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createSubmissionRequestSchema,
  CRITIQUES_PER_HOUR,
  critiqueOutputSchema,
  runnerReportSchema,
  SUBMISSION_FILE_TYPES,
  SUBMISSION_FILES_MAX_BYTES,
  type ProjectCard,
  type ProjectDetail,
  type ProjectSpec,
  type RunnerJob,
  type SubmissionDetail,
  type SubmissionSummary,
} from '@forward-pass/shared';
import express, { Router, type RequestHandler, type Response } from 'express';
import { authLocals, requireAuth } from '../auth/middleware';
import type { LoadedContent } from '../content/load';
import type { Db } from '../db';
import { sendError, sendValidationError } from '../http';

/** Runs the critique for a checked submission. Injected so tests can fake the model. */
export type CritiqueRunner = (submissionId: string) => Promise<void>;

interface ProjectRouterDeps {
  db: Db;
  content: LoadedContent;
  uploadsDir: string;
  /** Shared secret for the runner's internal routes; they answer 503 without one. */
  runnerToken?: string;
  critique?: CritiqueRunner;
}

const HOUR = 60 * 60 * 1000;
/** A claim older than this is treated as a crashed runner and handed out again. */
const STALE_CLAIM_MS = 30 * 60 * 1000;
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

type SubmissionRow = NonNullable<Awaited<ReturnType<Db['submission']['findUnique']>>>;

export function projectRouter({
  db,
  content,
  uploadsDir,
  runnerToken,
  critique,
}: ProjectRouterDeps): Router {
  const router = Router();
  router.use(['/projects', '/submissions'], requireAuth);
  const filesDir = (id: string) => path.join(uploadsDir, 'submissions', id);

  /** Whether the learner passed the checkpoint that opens a project. */
  async function unlocked(userId: string, spec: ProjectSpec) {
    const passed = await db.attempt.findFirst({
      where: { userId, kind: 'solo', sectionNumber: spec.unlockAfterSection, passed: true },
    });
    return Boolean(passed);
  }

  async function summaryOf(row: SubmissionRow): Promise<SubmissionSummary> {
    const critiqueRow = await db.critique.findUnique({ where: { submissionId: row.id } });
    const output = critiqueRow ? critiqueOutputSchema.safeParse(critiqueRow.json) : null;
    return {
      id: row.id,
      version: row.version,
      status: row.status as SubmissionSummary['status'],
      repoUrl: row.repoUrl,
      commitSha: row.commitSha,
      createdAt: row.createdAt.toISOString(),
      gradedAt: row.gradedAt?.toISOString() ?? null,
      total: output?.success ? output.data.total : null,
      portfolioReady: output?.success ? output.data.portfolioReady : null,
      public: row.public,
    };
  }

  /** The partner's latest version and its score; nothing about the work itself. */
  async function partnerLine(userId: string, slug: string) {
    const partner = await db.user.findFirst({ where: { id: { not: userId } } });
    if (!partner) return null;
    const latest = await db.submission.findFirst({
      where: { userId: partner.id, projectSlug: slug },
      orderBy: { version: 'desc' },
      include: { critique: true },
    });
    if (!latest) return null;
    const output = latest.critique ? critiqueOutputSchema.safeParse(latest.critique.json) : null;
    return {
      displayName: partner.displayName,
      version: latest.version,
      total: output?.success ? output.data.total : null,
    };
  }

  async function cardOf(userId: string, spec: ProjectSpec): Promise<ProjectCard> {
    const [chapter, latest, open] = await Promise.all([
      db.chapter.findUnique({ where: { number: spec.chapter } }),
      db.submission.findFirst({
        where: { userId, projectSlug: spec.slug },
        orderBy: { version: 'desc' },
      }),
      unlocked(userId, spec),
    ]);
    return {
      slug: spec.slug,
      number: spec.number,
      title: spec.title,
      chapter: { number: spec.chapter, title: chapter?.title ?? `Chapter ${spec.chapter}` },
      summary: spec.summary,
      estimatedHours: spec.estimatedHours,
      needsGpu: spec.needsGpu,
      skills: spec.skills,
      unlockAfter: spec.unlockAfterSection,
      unlocked: open,
      mine: latest ? await summaryOf(latest) : null,
      partner: await partnerLine(userId, spec.slug),
    };
  }

  async function critiquesLeft(userId: string) {
    const recent = await db.submission.count({
      where: { userId, createdAt: { gte: new Date(Date.now() - HOUR) } },
    });
    return Math.max(0, CRITIQUES_PER_HOUR - recent);
  }

  router.get('/projects', async (_req, res) => {
    const userId = authLocals(res).userId!;
    const projects = await Promise.all(
      [...content.projects.values()].map(({ spec }) => cardOf(userId, spec)),
    );
    res.json({ projects });
  });

  router.get('/projects/:slug', async (req, res) => {
    const loaded = content.projects.get(req.params.slug);
    if (!loaded) return sendError(res, 404, 'not_found', 'No such project.');
    const userId = authLocals(res).userId!;
    const { spec, brief } = loaded;
    const [card, rows, sections, left] = await Promise.all([
      cardOf(userId, spec),
      db.submission.findMany({
        where: { userId, projectSlug: spec.slug },
        orderBy: { version: 'desc' },
      }),
      db.section.findMany({
        where: { number: { in: spec.bookSections } },
        orderBy: { orderIndex: 'asc' },
      }),
      critiquesLeft(userId),
    ]);
    const body: ProjectDetail = {
      ...card,
      brief,
      deliverables: spec.deliverables,
      constraints: spec.constraints,
      rubric: spec.rubric,
      requiredFiles: spec.requiredFiles,
      readmeSections: spec.readmeSections,
      checks: spec.checks.map(({ id, kind, label }) => ({ id, kind, label })),
      hasResultsSchema: spec.resultsSchema !== null,
      bookSections: sections.map((section) => ({ number: section.number, title: section.title })),
      submissions: await Promise.all(rows.map(summaryOf)),
      critiquesLeftThisHour: left,
    };
    res.json(body);
  });

  router.post('/projects/:slug/submissions', async (req, res) => {
    const loaded = content.projects.get(req.params.slug);
    if (!loaded) return sendError(res, 404, 'not_found', 'No such project.');
    const parsed = createSubmissionRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const userId = authLocals(res).userId!;
    if (!(await unlocked(userId, loaded.spec))) {
      return sendError(
        res,
        403,
        'locked',
        `Pass the ${loaded.spec.unlockAfterSection} checkpoint to open this project.`,
      );
    }
    if ((await critiquesLeft(userId)) === 0) {
      return sendError(
        res,
        429,
        'rate_limited',
        `Each critique costs a model call, so submissions are capped at ${CRITIQUES_PER_HOUR} an hour. Try again later.`,
      );
    }
    const last = await db.submission.findFirst({
      where: { userId, projectSlug: loaded.spec.slug },
      orderBy: { version: 'desc' },
    });
    const row = await db.submission.create({
      data: {
        userId,
        projectSlug: loaded.spec.slug,
        version: (last?.version ?? 0) + 1,
        repoUrl: parsed.data.repoUrl.replace(/\/$/, ''),
        commitSha: parsed.data.commitSha ?? null,
        noteToGrader: parsed.data.noteToGrader || null,
      },
    });
    res.status(201).json(await summaryOf(row));
  });

  /** The learner's own submission, or null after a 404. Partners never get one. */
  async function own(res: Response, id: string) {
    const row = await db.submission.findUnique({ where: { id } });
    if (!row || row.userId !== authLocals(res).userId) {
      sendError(res, 404, 'not_found', 'No such submission.');
      return null;
    }
    return row;
  }

  router.get('/submissions/:id', async (req, res) => {
    const row = await own(res, req.params.id);
    if (!row) return;
    const [checks, files, critiqueRow] = await Promise.all([
      db.checkResult.findMany({ where: { submissionId: row.id }, orderBy: { position: 'asc' } }),
      db.submissionFile.findMany({
        where: { submissionId: row.id },
        orderBy: { createdAt: 'asc' },
      }),
      db.critique.findUnique({ where: { submissionId: row.id } }),
    ]);
    const spec = content.projects.get(row.projectSlug)?.spec;
    const output = critiqueRow ? critiqueOutputSchema.safeParse(critiqueRow.json) : null;
    const body: SubmissionDetail = {
      ...(await summaryOf(row)),
      projectSlug: row.projectSlug,
      noteToGrader: row.noteToGrader,
      failure: row.failure,
      checks: checks.map((check) => ({
        checkId: check.checkId,
        kind: check.kind as SubmissionDetail['checks'][number]['kind'],
        label: spec?.checks.find((entry) => entry.id === check.checkId)?.label ?? check.checkId,
        passed: check.passed,
        log: check.log,
        durationMs: check.durationMs,
      })),
      files: files.map(({ name, mime, size }) => ({ name, mime, size })),
      critique:
        critiqueRow && output?.success
          ? {
              ...output.data,
              model: critiqueRow.model,
              costUsd: critiqueRow.costUsd,
              createdAt: critiqueRow.createdAt.toISOString(),
            }
          : null,
    };
    res.json(body);
  });

  // Uploads beside the repo (charts, a PDF write-up, a notebook), 50 MB in all per submission.
  router.put(
    '/submissions/:id/files/:name',
    express.raw({ type: () => true, limit: SUBMISSION_FILES_MAX_BYTES }),
    async (req, res) => {
      const row = await own(res, req.params.id);
      if (!row) return;
      const name = req.params.name;
      const mime = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
      const extension = SUBMISSION_FILE_TYPES[mime as keyof typeof SUBMISSION_FILE_TYPES];
      if (!extension) {
        return sendError(
          res,
          415,
          'unsupported_file',
          'Upload a PDF, PNG, notebook (.ipynb) or zip.',
        );
      }
      if (!FILE_NAME.test(name) || !name.toLowerCase().endsWith(extension)) {
        return sendError(res, 400, 'bad_name', `Use a plain file name ending in ${extension}.`);
      }
      if (['graded', 'failed'].includes(row.status)) {
        return sendError(res, 409, 'closed', 'This submission is already graded.');
      }
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!body.length) return sendError(res, 400, 'empty_file', 'The file is empty.');
      const others = await db.submissionFile.aggregate({
        where: { submissionId: row.id, name: { not: name } },
        _sum: { size: true },
      });
      if ((others._sum.size ?? 0) + body.length > SUBMISSION_FILES_MAX_BYTES) {
        return sendError(res, 413, 'too_large', 'Uploads are capped at 50 MB per submission.');
      }
      await mkdir(filesDir(row.id), { recursive: true });
      await writeFile(path.join(filesDir(row.id), name), body);
      await db.submissionFile.upsert({
        where: { submissionId_name: { submissionId: row.id, name } },
        create: { submissionId: row.id, name, mime, size: body.length },
        update: { mime, size: body.length },
      });
      res.status(204).end();
    },
  );

  router.get('/submissions/:id/files/:name', async (req, res) => {
    const row = await own(res, req.params.id);
    if (!row) return;
    const file = await db.submissionFile.findUnique({
      where: { submissionId_name: { submissionId: row.id, name: req.params.name } },
    });
    const full = file ? path.join(filesDir(row.id), file.name) : null;
    if (!file || !full || !existsSync(full))
      return sendError(res, 404, 'not_found', 'No such file.');
    res.type(file.mime);
    res.attachment(file.name);
    createReadStream(full).pipe(res);
  });

  // ---------------------------------------------------------------------------------------------
  // Internal: the runner claims queued jobs and reports results. Token-authenticated, no session.

  const requireRunner: RequestHandler = (req, res, next) => {
    if (!runnerToken) return sendError(res, 503, 'runner_disabled', 'RUNNER_TOKEN is not set.');
    const given = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer /, ''));
    const expected = Buffer.from(runnerToken);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return sendError(res, 401, 'unauthenticated', 'Bad runner token.');
    }
    next();
  };
  router.use('/internal', requireRunner);

  /** Hands out the oldest queued submission (or one a crashed runner left behind), once. */
  router.post('/internal/jobs/claim', async (_req, res) => {
    const stale = new Date(Date.now() - STALE_CLAIM_MS);
    const candidates = await db.submission.findMany({
      where: {
        OR: [{ status: 'queued' }, { status: 'checking', claimedAt: { lt: stale } }],
      },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });
    for (const candidate of candidates) {
      const loaded = content.projects.get(candidate.projectSlug);
      if (!loaded) continue;
      const claimed = await db.submission.updateMany({
        where: { id: candidate.id, status: candidate.status, claimedAt: candidate.claimedAt },
        data: { status: 'checking', claimedAt: new Date() },
      });
      if (claimed.count !== 1) continue;
      const { spec } = loaded;
      const job: RunnerJob = {
        submissionId: candidate.id,
        repoUrl: candidate.repoUrl,
        commitSha: candidate.commitSha,
        project: {
          slug: spec.slug,
          requiredFiles: spec.requiredFiles,
          readmeSections: spec.readmeSections,
          resultsSchema: spec.resultsSchema,
          checks: spec.checks,
        },
      };
      return res.json(job);
    }
    res.status(204).end();
  });

  router.post(
    '/internal/submissions/:id/report',
    express.json({ limit: '8mb' }),
    async (req, res) => {
      const row = await db.submission.findUnique({ where: { id: req.params.id } });
      if (!row) return sendError(res, 404, 'not_found', 'No such submission.');
      if (row.status !== 'checking') {
        return sendError(res, 409, 'not_checking', `This submission is ${row.status}.`);
      }
      const parsed = runnerReportSchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(res, parsed.error);
      const report = parsed.data;
      const order =
        content.projects.get(row.projectSlug)?.spec.checks.map((check) => check.id) ?? [];

      await db.$transaction([
        db.checkResult.deleteMany({ where: { submissionId: row.id } }),
        db.checkResult.createMany({
          data: report.checks.map((check) => ({
            submissionId: row.id,
            checkId: check.checkId,
            kind: check.kind,
            passed: check.passed,
            log: check.log,
            durationMs: check.durationMs,
            position: Math.max(0, order.indexOf(check.checkId)),
          })),
        }),
        db.submission.update({
          where: { id: row.id },
          data: {
            commitSha: report.commitSha ?? row.commitSha,
            artifacts: report.artifacts as object,
            status: report.error ? 'failed' : 'critiquing',
            failure: report.error,
          },
        }),
      ]);
      res.status(204).end();

      // The critique runs after the runner has its answer; it can take a minute.
      if (report.error) return;
      if (!critique) {
        await db.submission.update({
          where: { id: row.id },
          data: {
            status: 'failed',
            failure: 'Checks ran, but critiques are not configured: set LLM_* in .env.',
          },
        });
        return;
      }
      critique(row.id).catch((error: unknown) => console.error('critique failed', error));
    },
  );

  return router;
}
