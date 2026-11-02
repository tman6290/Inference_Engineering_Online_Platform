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
