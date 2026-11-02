import type { ApiError } from '@forward-pass/shared';
import type { Response } from 'express';
import type { ZodError } from 'zod';

export function sendError(res: Response, status: number, error: string, message?: string): void {
  const body: ApiError = { error, ...(message ? { message } : {}) };
  res.status(status).json(body);
}

/** 400 with one message per field, ready to show under each input. */
export function sendValidationError(res: Response, zodError: ZodError): void {
  const fields: Record<string, string> = {};
  for (const issue of zodError.issues) {
    const key = issue.path.join('.') || 'body';
    fields[key] ??= issue.message;
  }
  const body: ApiError = {
    error: 'validation_failed',
    message: 'Check the highlighted fields.',
    fields,
  };
  res.status(400).json(body);
}
