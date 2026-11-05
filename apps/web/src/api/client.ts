import { apiErrorSchema } from '@forward-pass/shared';
import type { z } from 'zod';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/**
 * A failure worth retrying: no answer at all, or the host or its proxy failing (a sleeping API
 * host takes up to a minute to wake). Answers the API itself gave, like 401 or 429, are final.
 */
export function isTransient(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) return true;
  return error.status === 408 || error.status >= 500;
}

/** Retry delays for transient failures: 1, 2, 4, 8, then 15 s, about a minute in all. */
export const retryDelay = (attempt: number): number => Math.min(1000 * 2 ** attempt, 15_000);
export const MAX_RETRIES = 6;

export const retryTransient = (failureCount: number, error: unknown): boolean =>
  failureCount < MAX_RETRIES && isTransient(error);

interface RequestOptions<S extends z.ZodType | undefined> {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Parses the JSON response. Omit for empty responses. */
  schema?: S;
}

/** Calls the API on the same origin with the session cookie, and turns error bodies into ApiRequestError. */
export async function api<S extends z.ZodType | undefined = undefined>(
  path: string,
  { method = 'GET', body, schema }: RequestOptions<S> = {},
): Promise<S extends z.ZodType ? z.infer<S> : void> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(await res.json().catch(() => null));
    const error = parsed.success ? parsed.data : null;
    throw new ApiRequestError(
      res.status,
      error?.error ?? 'request_failed',
      error?.message ?? `Request failed (${res.status}).`,
      error?.fields,
    );
  }

  if (!schema) return undefined as never;
  return schema.parse(await res.json()) as never;
}
