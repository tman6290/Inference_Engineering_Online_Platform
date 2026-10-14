import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health';

describe('healthResponseSchema', () => {
  it('accepts { ok: true }', () => {
    expect(healthResponseSchema.parse({ ok: true })).toEqual({ ok: true });
  });

  it('rejects anything else', () => {
    expect(healthResponseSchema.safeParse({ ok: false }).success).toBe(false);
  });
});
