import { healthResponseSchema } from '@forward-pass/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createDb } from './db';

describe('api', () => {
  // The client connects lazily, and neither route below touches the database.
  const app = createApp({
    db: createDb('postgresql://unused:unused@127.0.0.1:1/unused'),
    sessions: { secret: 'x'.repeat(32), secureCookies: false },
    inviteCodes: [undefined, undefined],
  });

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
