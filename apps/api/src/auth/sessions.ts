import { createHmac, randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import type { Db } from '../db';

export const SESSION_COOKIE = 'fp_session';
const SESSION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SessionSettings {
  secret: string;
  secureCookies: boolean;
}

/** The database stores an HMAC of the token, never the token itself. */
export function sessionId(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}

function baseCookieOptions(settings: SessionSettings): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: settings.secureCookies, path: '/' };
}

function cookieOptions(settings: SessionSettings, maxAgeMs: number): CookieOptions {
  return { ...baseCookieOptions(settings), maxAge: maxAgeMs };
}

export async function startSession(
  db: Db,
  settings: SessionSettings,
  userId: string,
  res: Response,
): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
  await db.session.create({ data: { id: sessionId(token, settings.secret), userId, expiresAt } });
  res.cookie(SESSION_COOKIE, token, cookieOptions(settings, SESSION_DAYS * DAY_MS));
}

export function clearSessionCookie(settings: SessionSettings, res: Response): void {
  res.clearCookie(SESSION_COOKIE, baseCookieOptions(settings));
}

/**
 * Resolves a cookie token to its user id. Expired sessions are deleted. Sessions past
 * half their lifetime are extended, and the cookie is re-sent with the new expiry.
 */
export async function resolveSession(
  db: Db,
  settings: SessionSettings,
  token: string,
  res: Response,
): Promise<string | null> {
  const id = sessionId(token, settings.secret);
  const session = await db.session.findUnique({ where: { id } });
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await db.session.delete({ where: { id } }).catch(() => undefined);
    return null;
  }

  if (session.expiresAt.getTime() - now < (SESSION_DAYS / 2) * DAY_MS) {
    const expiresAt = new Date(now + SESSION_DAYS * DAY_MS);
    await db.session.update({ where: { id }, data: { expiresAt, lastSeenAt: new Date(now) } });
    res.cookie(SESSION_COOKIE, token, cookieOptions(settings, SESSION_DAYS * DAY_MS));
  }
  return session.userId;
}

export async function endSession(db: Db, settings: SessionSettings, token: string): Promise<void> {
  await db.session.deleteMany({ where: { id: sessionId(token, settings.secret) } });
}

export async function revokeUserSessions(db: Db, userId: string): Promise<number> {
  const { count } = await db.session.deleteMany({ where: { userId } });
  return count;
}
