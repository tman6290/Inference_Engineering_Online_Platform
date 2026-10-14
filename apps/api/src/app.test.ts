import { healthResponseSchema } from '@forward-pass/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

describe('api', () => {
  const app = createApp();

  it('GET /api/health returns { ok: true }', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(healthResponseSchema.parse(res.body)).toEqual({ ok: true });
  });

  it('unknown /api routes return a JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});
