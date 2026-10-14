import type { HealthResponse } from '@forward-pass/shared';
import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  const body: HealthResponse = { ok: true };
  res.json(body);
});
