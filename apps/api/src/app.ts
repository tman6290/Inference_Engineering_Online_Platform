import express, { type Express } from 'express';
import { healthRouter } from './routes/health';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', healthRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}
