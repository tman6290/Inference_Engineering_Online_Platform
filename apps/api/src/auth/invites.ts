import { createHash, timingSafeEqual } from 'node:crypto';

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code.trim()).digest('hex');
}

/**
 * Returns the seat (1 or 2) whose configured code matches, or null.
 * Compares fixed-length hashes so the check takes the same time whatever the input.
 */
export function matchInviteSlot(
  code: string,
  configured: readonly [string | undefined, string | undefined],
): 1 | 2 | null {
  const given = Buffer.from(hashInviteCode(code), 'hex');
  const slots = [1, 2] as const;
  let match: 1 | 2 | null = null;
  for (const slot of slots) {
    const candidate = configured[slot - 1];
    if (!candidate) continue;
    const expected = Buffer.from(hashInviteCode(candidate), 'hex');
    if (timingSafeEqual(given, expected) && match === null) match = slot;
  }
  return match;
}
