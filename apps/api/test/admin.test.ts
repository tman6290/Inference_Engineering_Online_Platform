import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createUser, listUsers, resetPassword, revokeSessions } from '../src/admin';
import {
  INVITE_1,
  noTestDatabase,
  registeredAgent,
  resetDatabase,
  testApp,
  testDb,
  validRegistration,
} from './helpers';

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

  it('creates an account in the first free seat that must change its temporary password', async () => {
    const app = testApp();
    await createUser(testDb(), {
      email: 'Tofa@Example.com',
      displayName: 'Tofa',
      password: 'password',
    });

    const agent = request.agent(app);
    const login = await agent
      .post('/api/auth/login')
      .send({ email: 'tofa@example.com', password: 'password' });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({
      colour: 'lime',
      initial: 'T',
      mustChangePassword: true,
    });

    // The seat's invite link no longer works, so the pod stays at two.
    const viaInvite = await request(app)
      .post('/api/auth/register')
      .send(validRegistration({ email: 'someone@example.com', inviteCode: INVITE_1 }));
    expect(viaInvite.body.error).toBe('invite_spent');

    const changed = await agent
      .post('/api/auth/password')
      .send({ currentPassword: 'password', newPassword: 'my own long passphrase' });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
    expect((await agent.get('/api/me')).status).toBe(200);
  });

  it('generates a temporary password when none is given, and fills the second seat', async () => {
    await registeredAgent(testApp());
    const password = await createUser(testDb(), {
      email: 'friend@example.com',
      displayName: 'Friend',
    });
    expect(password.length).toBeGreaterThanOrEqual(12);
    const friend = await testDb().user.findUnique({ where: { email: 'friend@example.com' } });
    expect(friend).toMatchObject({ colour: 'butter', mustChangePassword: true });
  });

  it('refuses a third account and a duplicate email', async () => {
    await createUser(testDb(), { email: 'one@example.com', displayName: 'One' });
    await expect(
      createUser(testDb(), { email: 'one@example.com', displayName: 'Again' }),
    ).rejects.toThrow('already exists');
    await createUser(testDb(), { email: 'two@example.com', displayName: 'Two' });
    await expect(
      createUser(testDb(), { email: 'three@example.com', displayName: 'Three' }),
    ).rejects.toThrow('Both seats are taken');
  });

  it('asks for a new password after a reset', async () => {
    await registeredAgent(testApp());
    await resetPassword(testDb(), 'tofa@example.com');
    const user = await testDb().user.findUnique({ where: { email: 'tofa@example.com' } });
    expect(user?.mustChangePassword).toBe(true);
  });

  it('fails clearly for an unknown email', async () => {
    await expect(resetPassword(testDb(), 'nobody@example.com')).rejects.toThrow(
      'No user with email nobody@example.com',
    );
  });
});
