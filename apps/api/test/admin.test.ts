import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { listUsers, resetPassword, revokeSessions } from '../src/admin';
import { noTestDatabase, registeredAgent, resetDatabase, testApp, testDb } from './helpers';

describe.skipIf(noTestDatabase)('admin', () => {
  beforeEach(() => resetDatabase());

  it('lists users with their active sessions', async () => {
    await registeredAgent(testApp());
    const users = await listUsers(testDb());
    expect(users).toEqual([
      expect.objectContaining({ email: 'tofa@example.com', colour: 'lime', activeSessions: 1 }),
    ]);
  });

  it('resets a password, signs the user out, and the new password works', async () => {
    const app = testApp();
    const agent = await registeredAgent(app);

    const password = await resetPassword(testDb(), 'TOFA@example.com');

    expect((await agent.get('/api/me')).status).toBe(401);
    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'tofa@example.com', password: 'correct horse battery' });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'tofa@example.com', password });
    expect(newLogin.status).toBe(200);
  });

  it('revokes every session for a user', async () => {
    const app = testApp();
    const agent = await registeredAgent(app);
    expect(await revokeSessions(testDb(), 'tofa@example.com')).toBe(1);
    expect((await agent.get('/api/me')).status).toBe(401);
  });

  it('fails clearly for an unknown email', async () => {
    await expect(resetPassword(testDb(), 'nobody@example.com')).rejects.toThrow(
      'No user with email nobody@example.com',
    );
  });
});
