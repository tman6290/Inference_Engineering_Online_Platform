import express, { type Express } from 'express';

// Job execution (one throwaway container per check, no network, CPU only, hard timeout)
// lands with the project-check feature. For now the service only reports that it is up.
export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}
