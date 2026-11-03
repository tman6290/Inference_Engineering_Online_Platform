import { randomBytes } from 'node:crypto';
import { POD_SIZE } from '@forward-pass/shared';
import { hashInviteCode } from './auth/invites';
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

export interface CreateUserInput {
  email: string;
  displayName: string;
  /** A temporary password. Omit it to generate one. The user must change it at first sign-in. */
  password?: string;
}

/**
 * Creates an account in the next free seat without an invite link, with a temporary password the
 * user must change after signing in. Claims that seat's invite code, so the two-seat limit holds.
 * Returns the temporary password.
 */
export async function createUser(db: Db, input: CreateUserInput): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error(`Not a valid email: ${input.email}`);
  if (!displayName) throw new Error('A display name is required');
  if (await db.user.findUnique({ where: { email } })) {
    throw new Error(`An account with email ${email} already exists`);
  }
  const taken = new Set(
    (await db.inviteCode.findMany({ select: { slot: true } })).map((row) => row.slot),
  );
  const slot = [1, 2].find((candidate) => !taken.has(candidate));
  if (!slot || (await db.user.count()) >= POD_SIZE) throw new Error('Both seats are taken');

  const password = input.password ?? randomBytes(12).toString('base64url');
  await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        displayName,
        initial: (Array.from(displayName)[0] ?? '?').toLocaleUpperCase(),
        colour: slot === 1 ? 'lime' : 'butter',
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
      },
    });
    await tx.inviteCode.create({
      data: { slot, codeHash: hashInviteCode(`created-by-admin:${slot}`), userId: user.id },
    });
  });
  return password;
}

/**
 * Sets a new random password, signs the user out everywhere, and asks them to choose their own
 * at next sign-in. Returns the password so the admin can pass it on; it is not stored anywhere else.
 */
export async function resetPassword(db: Db, email: string, temporary?: string): Promise<string> {
  const userId = await findUserId(db, email);
  const password = temporary ?? randomBytes(12).toString('base64url');
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), mustChangePassword: true },
  });
  await revokeUserSessions(db, userId);
  return password;
}

export async function revokeSessions(db: Db, email: string): Promise<number> {
  return revokeUserSessions(db, await findUserId(db, email));
}
