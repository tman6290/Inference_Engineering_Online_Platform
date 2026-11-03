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
import { lessonRouter } from './routes/lessons';
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
  /** Authored digests and banks, loaded at start-up. Defaults to none. */
  content?: LoadedContent;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  if (deps.trustProxy) app.set('trust proxy', deps.trustProxy);
  app.use(express.json({ limit: '1mb' }));
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
    }),
  );
  app.use('/api', lessonRouter({ db: deps.db, content: deps.content ?? emptyContent() }));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    console.error(error);
    if (res.headersSent) return;
    sendError(res, 500, 'internal', 'Something went wrong on the server.');
  };
  app.use(onError);

  return app;
}
