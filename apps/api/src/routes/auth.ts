import {
  loginRequestSchema,
  POD_SIZE,
  registerRequestSchema,
  type MeResponse,
  type PublicUser,
} from '@forward-pass/shared';
import { Router, type RequestHandler } from 'express';
import { hashInviteCode, matchInviteSlot } from '../auth/invites';
import { authLocals, requireAuth } from '../auth/middleware';
import { hashPassword, verifyPassword } from '../auth/password';
import {
  clearSessionCookie,
  endSession,
  startSession,
  type SessionSettings,
} from '../auth/sessions';
import { isUniqueViolation, type Db } from '../db';
import { sendError, sendValidationError } from '../http';

interface AuthRouterDeps {
  db: Db;
  sessions: SessionSettings;
  inviteCodes: readonly [string | undefined, string | undefined];
  /** Applied to login and register. */
  limiter: RequestHandler;
}

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  initial: string;
  colour: 'lime' | 'butter';
};

function toPublic(user: UserRow): PublicUser {
  return { id: user.id, displayName: user.displayName, initial: user.initial, colour: user.colour };
}

async function meResponse(db: Db, userId: string): Promise<MeResponse | null> {
  const users = await db.user.findMany({ orderBy: { createdAt: 'asc' } });
  const me = users.find((user) => user.id === userId);
  if (!me) return null;
  const others = users.filter((user) => user.id !== userId);
  return {
    user: { ...toPublic(me), email: me.email },
    pod: [toPublic(me), ...others.map(toPublic)],
  };
}

function initialOf(displayName: string): string {
  return (Array.from(displayName.trim())[0] ?? '?').toLocaleUpperCase();
}

export function authRouter({ db, sessions, inviteCodes, limiter }: AuthRouterDeps): Router {
  const router = Router();

  router.post('/auth/register', limiter, async (req, res) => {
    const parsed = registerRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const { email, password, displayName, inviteCode } = parsed.data;

    if ((await db.user.count()) >= POD_SIZE) {
      return sendError(res, 409, 'pod_full', 'Both seats are taken.');
    }
    const slot = matchInviteSlot(inviteCode, inviteCodes);
    if (slot === null) {
      return sendError(res, 400, 'invalid_invite', 'That invite code is not valid.');
    }
    if (await db.inviteCode.findUnique({ where: { slot } })) {
      return sendError(res, 409, 'invite_spent', 'That invite code has already been used.');
    }
    if (await db.user.findUnique({ where: { email } })) {
      return sendError(res, 409, 'email_taken', 'An account with that email already exists.');
    }

    const passwordHash = await hashPassword(password);
    let userId: string;
    try {
      const user = await db.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            displayName,
            initial: initialOf(displayName),
            colour: slot === 1 ? 'lime' : 'butter',
            passwordHash,
          },
        });
        await tx.inviteCode.create({
          data: { slot, codeHash: hashInviteCode(inviteCode), userId: created.id },
        });
        return created;
      });
      userId = user.id;
    } catch (error) {
      // A concurrent request claimed the seat or the email between the checks and the write.
      if (isUniqueViolation(error)) {
        return sendError(res, 409, 'invite_spent', 'That invite code has already been used.');
      }
      throw error;
    }

    await startSession(db, sessions, userId, res);
    res.status(201).json(await meResponse(db, userId));
  });

  router.post('/auth/login', limiter, async (req, res) => {
    const parsed = loginRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const { email, password } = parsed.data;

    const user = await db.user.findUnique({ where: { email } });
    if (!(await verifyPassword(password, user?.passwordHash ?? null)) || !user) {
      return sendError(res, 401, 'invalid_credentials', 'That email and password do not match.');
    }

    await startSession(db, sessions, user.id, res);
    res.json(await meResponse(db, user.id));
  });

  router.post('/auth/logout', async (_req, res) => {
    const { sessionToken } = authLocals(res);
    if (sessionToken) await endSession(db, sessions, sessionToken);
    clearSessionCookie(sessions, res);
    res.status(204).end();
  });

  router.get('/me', requireAuth, async (_req, res) => {
    const body = await meResponse(db, authLocals(res).userId!);
    if (!body) return sendError(res, 401, 'unauthenticated', 'Sign in to continue.');
    res.json(body);
  });

  return router;
}
