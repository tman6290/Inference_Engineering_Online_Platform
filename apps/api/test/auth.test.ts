import { meResponseSchema } from '@forward-pass/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { sessionId } from '../src/auth/sessions';
import {
  INVITE_1,
  INVITE_2,
  noTestDatabase,
  registeredAgent,
  resetDatabase,
  SESSION_SECRET,
  testApp,
  testDb,
  validRegistration,
} from './helpers';

function sessionCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((value) => value.startsWith('fp_session='));
  if (!cookie) throw new Error('no session cookie set');
  return cookie;
}

function tokenFrom(cookie: string): string {
  return cookie.split(';')[0]!.split('=')[1]!;
}

describe.skipIf(noTestDatabase)('auth', () => {
  beforeEach(() => resetDatabase());

  describe('POST /api/auth/register', () => {
    it('creates the first seat in lime, signs it in and returns the pod', async () => {
      const app = testApp();
      const res = await request(app).post('/api/auth/register').send(validRegistration());

      expect(res.status).toBe(201);
      const body = meResponseSchema.parse(res.body);
      expect(body.user).toMatchObject({
        email: 'tofa@example.com',
        displayName: 'Tofa',
        initial: 'T',
        colour: 'lime',
      });
      expect(body.pod).toHaveLength(1);

      const cookie = sessionCookie(res);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).not.toMatch(/Secure/i);
    });

    it('gives the second seat butter and lists the signed-in user first', async () => {
      const app = testApp();
      await registeredAgent(app);
      const partner = await registeredAgent(app, {
        email: 'friend@example.com',
        displayName: 'Friend',
        inviteCode: INVITE_2,
      });

      const res = await partner.get('/api/me');
      expect(res.status).toBe(200);
      const body = meResponseSchema.parse(res.body);
      expect(body.user.colour).toBe('butter');
      expect(body.pod.map((member) => member.displayName)).toEqual(['Friend', 'Tofa']);
    });

    it('normalises the email', async () => {
      const app = testApp();
      const res = await request(app)
        .post('/api/auth/register')
        .send(validRegistration({ email: '  Tofa@Example.COM ' }));
      expect(res.body.user.email).toBe('tofa@example.com');
    });

    it('rejects a bad invite code without creating a user', async () => {
      const app = testApp();
      const res = await request(app)
        .post('/api/auth/register')
        .send(validRegistration({ inviteCode: 'not-a-code' }));

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_invite');
      expect(await testDb().user.count()).toBe(0);
    });

    it('rejects a spent invite code', async () => {
      const app = testApp();
      await registeredAgent(app);
      const res = await request(app)
        .post('/api/auth/register')
        .send(validRegistration({ email: 'someone@example.com' }));

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('invite_spent');
    });

    it('rejects a third user, even with a re-issued code', async () => {
      const app = testApp();
      await registeredAgent(app);
      await registeredAgent(app, { email: 'friend@example.com', inviteCode: INVITE_2 });

      const reissued = testApp({ inviteCodes: ['a-brand-new-code', INVITE_2] });
      const res = await request(reissued)
        .post('/api/auth/register')
        .send(validRegistration({ email: 'third@example.com', inviteCode: 'a-brand-new-code' }));

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('pod_full');
      expect(await testDb().user.count()).toBe(2);
    });

    it('rejects an email that is already registered', async () => {
      const app = testApp();
      await registeredAgent(app);
      const res = await request(app)
        .post('/api/auth/register')
        .send(validRegistration({ inviteCode: INVITE_2 }));

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('email_taken');
    });

    it('returns field errors for invalid input', async () => {
      const app = testApp();
      const res = await request(app)
        .post('/api/auth/register')
        .send(validRegistration({ email: 'nope', password: 'short' }));

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_failed');
      expect(Object.keys(res.body.fields)).toEqual(expect.arrayContaining(['email', 'password']));
    });
  });

  describe('POST /api/auth/login', () => {
    it('signs in with the right password', async () => {
      const app = testApp();
      await registeredAgent(app);

      const agent = request.agent(app);
      const res = await agent
        .post('/api/auth/login')
        .send({ email: 'TOFA@example.com', password: 'correct horse battery' });
      expect(res.status).toBe(200);
      expect(res.body.user.displayName).toBe('Tofa');
      expect((await agent.get('/api/me')).status).toBe(200);
    });

    it('gives the same answer for a wrong password and an unknown email', async () => {
      const app = testApp();
      await registeredAgent(app);

      const wrong = await request(app)
        .post('/api/auth/login')
        .send({ email: 'tofa@example.com', password: 'wrong password!' });
      const unknown = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong password!' });

      for (const res of [wrong, unknown]) {
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('invalid_credentials');
        expect(res.headers['set-cookie']).toBeUndefined();
      }
    });

    it('rate-limits after 10 attempts a minute', async () => {
      const app = testApp({ authRateLimit: 10 });
      const attempt = () =>
        request(app)
          .post('/api/auth/login')
          .send({ email: 'x@example.com', password: 'whatever!' });

      for (let i = 0; i < 10; i++) expect((await attempt()).status).toBe(401);
      const blocked = await attempt();
      expect(blocked.status).toBe(429);
      expect(blocked.body.error).toBe('rate_limited');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('ends the session server side and clears the cookie', async () => {
      const app = testApp();
      const register = await request(app).post('/api/auth/register').send(validRegistration());
      const cookie = sessionCookie(register).split(';')[0]!;

      const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
      expect(res.status).toBe(204);
      expect(sessionCookie(res)).toMatch(/fp_session=;/);
      expect(await testDb().session.count()).toBe(0);

      // The old cookie no longer works, even if a client kept it.
      expect((await request(app).get('/api/me').set('Cookie', cookie)).status).toBe(401);
    });
  });

  describe('POST /api/auth/password', () => {
    const change = (agent: ReturnType<typeof request.agent>, body: Record<string, string>) =>
      agent.post('/api/auth/password').send(body);

    it('changes the password, keeps this session and signs out the others', async () => {
      const app = testApp();
      const here = await registeredAgent(app);
      const elsewhere = request.agent(app);
      await elsewhere
        .post('/api/auth/login')
        .send({ email: 'tofa@example.com', password: 'correct horse battery' });
      expect(await testDb().session.count()).toBe(2);

      const res = await change(here, {
        currentPassword: 'correct horse battery',
        newPassword: 'a much better passphrase',
      });
      expect(res.status).toBe(200);
      expect(meResponseSchema.parse(res.body).user.mustChangePassword).toBe(false);

      expect((await here.get('/api/me')).status).toBe(200);
      expect((await elsewhere.get('/api/me')).status).toBe(401);
      expect(await testDb().session.count()).toBe(1);

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'tofa@example.com', password: 'a much better passphrase' });
      expect(login.status).toBe(200);
    });

    it('clears the must-change flag', async () => {
      const app = testApp();
      const agent = await registeredAgent(app);
      await testDb().user.updateMany({ data: { mustChangePassword: true } });
      expect((await agent.get('/api/me')).body.user.mustChangePassword).toBe(true);

      await change(agent, {
        currentPassword: 'correct horse battery',
        newPassword: 'brand new phrase here',
      });
      expect((await agent.get('/api/me')).body.user.mustChangePassword).toBe(false);
    });

    it('rejects a wrong current password and leaves the old one working', async () => {
      const app = testApp();
      const agent = await registeredAgent(app);
      const res = await change(agent, {
        currentPassword: 'not my password',
        newPassword: 'brand new phrase here',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('wrong_password');
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'tofa@example.com', password: 'correct horse battery' });
      expect(login.status).toBe(200);
    });

    it('enforces the length rule and a different password', async () => {
      const agent = await registeredAgent(testApp());
      const short = await change(agent, {
        currentPassword: 'correct horse battery',
        newPassword: 'short',
      });
      expect(short.status).toBe(400);
      expect(short.body.fields.newPassword).toMatch(/at least 10/);
      const same = await change(agent, {
        currentPassword: 'correct horse battery',
        newPassword: 'correct horse battery',
      });
      expect(same.status).toBe(400);
      expect(same.body.fields.newPassword).toMatch(/different/);
    });

    it('requires a session', async () => {
      const res = await request(testApp())
        .post('/api/auth/password')
        .send({ currentPassword: 'x', newPassword: 'brand new phrase here' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/me', () => {
    it('returns 401 without a session', async () => {
      const res = await request(testApp()).get('/api/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('unauthenticated');
    });

    it('returns 401 for a forged cookie', async () => {
      const res = await request(testApp()).get('/api/me').set('Cookie', 'fp_session=forged-token');
      expect(res.status).toBe(401);
    });

    it('returns 401 for an expired session and deletes it', async () => {
      const app = testApp();
      const register = await request(app).post('/api/auth/register').send(validRegistration());
      const cookie = sessionCookie(register).split(';')[0]!;
      await testDb().session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

      expect((await request(app).get('/api/me').set('Cookie', cookie)).status).toBe(401);
      expect(await testDb().session.count()).toBe(0);
    });

    it('stores an HMAC of the session token, not the token', async () => {
      const app = testApp();
      const register = await request(app).post('/api/auth/register').send(validRegistration());
      const token = tokenFrom(sessionCookie(register));
      const [stored] = await testDb().session.findMany();

      expect(stored!.id).not.toBe(token);
      expect(stored!.id).toBe(sessionId(token, SESSION_SECRET));
    });

    it('extends a session past half its lifetime', async () => {
      const app = testApp();
      const register = await request(app).post('/api/auth/register').send(validRegistration());
      const cookie = sessionCookie(register).split(';')[0]!;
      const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      await testDb().session.updateMany({ data: { expiresAt: soon } });

      const res = await request(app).get('/api/me').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(sessionCookie(res)).toMatch(/Max-Age=2592000/);
      const [stored] = await testDb().session.findMany();
      expect(stored!.expiresAt.getTime()).toBeGreaterThan(soon.getTime());
    });
  });

  it('keeps invite codes out of the database', async () => {
    const app = testApp();
    await registeredAgent(app);
    const [invite] = await testDb().inviteCode.findMany();
    expect(invite!.codeHash).not.toContain(INVITE_1);
    expect(invite!.slot).toBe(1);
  });
});
