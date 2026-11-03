import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import type { Express } from 'express';
import request from 'supertest';
import { createApp, type AppDeps } from '../src/app';
import { createDb, type Db } from '../src/db';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotenv({ path: path.resolve(apiRoot, '../../.env'), quiet: true });

export const testDatabaseUrl = process.env.DATABASE_URL_TEST;
/** Use with describe.skipIf: integration tests need the test database. */
export const noTestDatabase = !testDatabaseUrl;

export const INVITE_1 = 'invite-one-for-tests';
export const INVITE_2 = 'invite-two-for-tests';
export const SESSION_SECRET = 'test-session-secret-that-is-long-enough-1234';

let shared: Db | undefined;
export function testDb(): Db {
  if (!testDatabaseUrl) throw new Error('DATABASE_URL_TEST is not set');
  shared ??= createDb(testDatabaseUrl);
  return shared;
}

export async function resetDatabase(db: Db = testDb()): Promise<void> {
  await db.$executeRawUnsafe(
    'TRUNCATE "InviteCode", "Session", "User", "Figure", "Subsection", "Section", "Chapter", "BookPage", "GlossaryTerm", "LessonProgress", "ReadingEvent", "ConfidenceRating", "Note", "Answer", "Attempt", "AttemptHint", "ExerciseReveal", "StudyDay" RESTART IDENTITY CASCADE',
  );
}

export function testApp(overrides: Partial<AppDeps> = {}): Express {
  return createApp({
    db: testDb(),
    sessions: { secret: SESSION_SECRET, secureCookies: false },
    inviteCodes: [INVITE_1, INVITE_2],
    authRateLimit: 1000,
    ...overrides,
  });
}

export const validRegistration = (overrides: Record<string, string> = {}) => ({
  email: 'tofa@example.com',
  password: 'correct horse battery',
  displayName: 'Tofa',
  inviteCode: INVITE_1,
  ...overrides,
});

/** Registers and returns an agent that carries the session cookie. */
export async function registeredAgent(app: Express, overrides: Record<string, string> = {}) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send(validRegistration(overrides));
  if (res.status !== 201)
    throw new Error(`registration failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}
