import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Db } from '../db';
import { sendError } from '../http';
import { resolveSession, SESSION_COOKIE, type SessionSettings } from './sessions';

export interface AuthLocals {
  userId?: string;
  sessionToken?: string;
}

export function authLocals(res: Response): AuthLocals {
  return res.locals as AuthLocals;
}

/** Reads the session cookie on every request and records the user id, if any. */
export function loadSession(db: Db, settings: SessionSettings): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token.length > 0) {
      const userId = await resolveSession(db, settings, token, res);
      if (userId) {
        authLocals(res).userId = userId;
        authLocals(res).sessionToken = token;
      }
    }
    next();
  };
}

/** 401 unless a valid session was loaded. */
export const requireAuth: RequestHandler = (_req, res, next) => {
  if (!authLocals(res).userId) {
    sendError(res, 401, 'unauthenticated', 'Sign in to continue.');
    return;
  }
  next();
};
