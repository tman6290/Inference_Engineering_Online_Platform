import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

describe('runner', () => {
  it('GET /health returns { ok: true }', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
