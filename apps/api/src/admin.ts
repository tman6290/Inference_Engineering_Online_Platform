import { randomBytes } from 'node:crypto';
import { hashPassword } from './auth/password';
import { revokeUserSessions } from './auth/sessions';
import type { Db } from './db';

export interface UserSummary {
  email: string;
  displayName: string;
  colour: string;
  createdAt: Date;
  activeSessions: number;
}

export async function listUsers(db: Db): Promise<UserSummary[]> {
  const users = await db.user.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { sessions: { where: { expiresAt: { gt: new Date() } } } } } },
  });
  return users.map((user) => ({
    email: user.email,
    displayName: user.displayName,
    colour: user.colour,
    createdAt: user.createdAt,
    activeSessions: user._count.sessions,
  }));
}

async function findUserId(db: Db, email: string): Promise<string> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) throw new Error(`No user with email ${email}`);
  return user.id;
}

/**
 * Sets a new random password and signs the user out everywhere.
 * Returns the password so the admin can pass it on; it is not stored anywhere else.
 */
export async function resetPassword(db: Db, email: string): Promise<string> {
  const userId = await findUserId(db, email);
  const password = randomBytes(12).toString('base64url');
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password) },
  });
  await revokeUserSessions(db, userId);
  return password;
}

export async function revokeSessions(db: Db, email: string): Promise<number> {
  return revokeUserSessions(db, await findUserId(db, email));
}
