import { describe, expect, it } from 'vitest';
import { ApiRequestError, isTransient, MAX_RETRIES, retryDelay, retryTransient } from './client';

describe('retrying a sleeping API host', () => {
  it('retries no answer and host or proxy failures, never the API’s own answers', () => {
    expect(isTransient(new TypeError('Failed to fetch'))).toBe(true);
    for (const status of [502, 503, 504, 500, 408]) {
      expect(isTransient(new ApiRequestError(status, 'x', 'x'))).toBe(true);
    }
    for (const status of [400, 401, 403, 404, 409, 429]) {
      expect(isTransient(new ApiRequestError(status, 'x', 'x'))).toBe(false);
    }
  });

  it('waits about a minute in all before giving up', () => {
    const waits = Array.from({ length: MAX_RETRIES }, (_, attempt) => retryDelay(attempt));
    expect(waits).toEqual([1000, 2000, 4000, 8000, 15_000, 15_000]);
    expect(retryTransient(MAX_RETRIES - 1, new TypeError('x'))).toBe(true);
    expect(retryTransient(MAX_RETRIES, new TypeError('x'))).toBe(false);
  });
});
