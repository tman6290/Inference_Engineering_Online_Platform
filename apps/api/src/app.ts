import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { loadSession } from './auth/middleware';
import type { SessionSettings } from './auth/sessions';
import type { Db } from './db';
import { sendError } from './http';
import path from 'node:path';
import { repoRoot } from './config';
import { authRouter } from './routes/auth';
import { bookRouter } from './routes/book';
import { checkpointRouter } from './routes/checkpoints';
import { exerciseRouter } from './routes/exercises';
import { lessonRouter } from './routes/lessons';
import { podRouter } from './routes/pod';
import { progressRouter } from './routes/progress';
import { projectRouter, type CritiqueRunner } from './routes/projects';
import { searchRouter } from './routes/search';
import { emptyContent, type LoadedContent } from './content/load';
import { healthRouter } from './routes/health';

export interface AppDeps {
  db: Db;
  sessions: SessionSettings;
  inviteCodes: readonly [string | undefined, string | undefined];
  trustProxy?: number;
  /** Login and register attempts per IP per minute. */
  authRateLimit?: number;
  /** Where ingested figures live. Defaults to content/figures. */
  figuresDir?: string;
  /** Authored digests, banks and exercises, loaded at start-up. Defaults to none. */
  content?: LoadedContent;
  /** Mounts development-only routes such as POST /api/progress/rebuild. */
  devRoutes?: boolean;
  /** Where uploads (teach-back audio, submission files) are stored. Defaults to uploads/. */
  uploadsDir?: string;
  /** Shared secret for the runner's internal routes. */
  runnerToken?: string;
  /** Critiques a checked submission. Without one, checked submissions fail with a clear reason. */
  critique?: CritiqueRunner;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  if (deps.trustProxy) app.set('trust proxy', deps.trustProxy);
  // The runner's reports carry logs and source files, so internal routes parse their own bodies.
  const json = express.json({ limit: '1mb' });
  app.use((req, res, next) =>
    req.path.startsWith('/api/internal/') ? next() : json(req, res, next),
  );
  app.use(cookieParser());

  // Each app gets its own limiter, so tests don't share counters.
  const limiter: RequestHandler = rateLimit({
    windowMs: 60_000,
    limit: deps.authRateLimit ?? 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      sendError(res, 429, 'rate_limited', 'Too many attempts. Wait a minute.'),
  });

  app.use('/api', healthRouter);
  app.use('/api', loadSession(deps.db, deps.sessions));
  app.use(
    '/api',
    authRouter({ db: deps.db, sessions: deps.sessions, inviteCodes: deps.inviteCodes, limiter }),
  );
  app.use(
    '/api',
    bookRouter({
      db: deps.db,
      figuresDir: deps.figuresDir ?? path.join(repoRoot, 'content', 'figures'),
      content: deps.content,
    }),
  );
  const content = deps.content ?? emptyContent();
  app.use('/api', lessonRouter({ db: deps.db, content }));
  app.use('/api', checkpointRouter({ db: deps.db, content }));
  app.use('/api', exerciseRouter({ db: deps.db, content }));
  app.use('/api', searchRouter({ db: deps.db, content }));
  const uploadsDir = deps.uploadsDir ?? path.join(repoRoot, 'uploads');
  app.use('/api', podRouter({ db: deps.db, content, uploadsDir }));
  app.use(
    '/api',
    projectRouter({
      db: deps.db,
      content,
      uploadsDir,
      runnerToken: deps.runnerToken,
      critique: deps.critique,
    }),
  );
  app.use('/api', progressRouter({ db: deps.db, content, devRoutes: deps.devRoutes ?? false }));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) return;
    // Body-parser errors carry their own status: a body over its size limit is 413.
    if ((error as { status?: number }).status === 413) {
      return sendError(res, 413, 'too_large', 'That upload is too large.');
    }
    console.error(error);
    sendError(res, 500, 'internal', 'Something went wrong on the server.');
  };
  app.use(onError);

  return app;
}
