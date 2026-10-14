import { z } from 'zod';
import { LlmConfigError } from './errors';
import type { Pricing, ProviderName } from './types';

const envSchema = z
  .object({
    LLM_PROVIDER: z.enum(['anthropic', 'openai-compatible']),
    LLM_MODEL: z.string().min(1),
    LLM_API_KEY: z.string().optional(),
    LLM_BASE_URL: z.url().optional(),
    LLM_PRICE_INPUT_PER_MTOK: z.coerce.number().nonnegative().optional(),
    LLM_PRICE_OUTPUT_PER_MTOK: z.coerce.number().nonnegative().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.LLM_PROVIDER === 'anthropic' && !env.LLM_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['LLM_API_KEY'], message: 'required for anthropic' });
    }
    if (env.LLM_PROVIDER === 'openai-compatible' && !env.LLM_BASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['LLM_BASE_URL'],
        message: 'required for openai-compatible',
      });
    }
  });

export interface LlmConfig {
  provider: ProviderName;
  model: string;
  apiKey: string | undefined;
  baseUrl: string | undefined;
  pricing: Pricing | null;
}

export function loadLlmConfig(env: Record<string, string | undefined> = process.env): LlmConfig {
  // Empty strings from a half-filled .env count as unset.
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([key, value]) => key.startsWith('LLM_') && value !== ''),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new LlmConfigError(`Invalid LLM configuration: ${detail}`);
  }
  const parsed = result.data;
  const input = parsed.LLM_PRICE_INPUT_PER_MTOK;
  const output = parsed.LLM_PRICE_OUTPUT_PER_MTOK;
  return {
    provider: parsed.LLM_PROVIDER,
    model: parsed.LLM_MODEL,
    apiKey: parsed.LLM_API_KEY,
    baseUrl: parsed.LLM_BASE_URL,
    pricing:
      input !== undefined && output !== undefined
        ? { inputPerMTok: input, outputPerMTok: output }
        : null,
  };
}
