import type { Pricing } from './types';

export function costUsd(
  pricing: Pricing | null,
  inputTokens: number,
  outputTokens: number,
): number | null {
  if (!pricing) return null;
  const usd =
    (inputTokens * pricing.inputPerMTok + outputTokens * pricing.outputPerMTok) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
