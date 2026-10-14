import { createLlmClient, type LlmClientOptions } from './client';
import { loadLlmConfig, type LlmConfig } from './config';
import { createAnthropicAdapter } from './providers/anthropic';
import { createOpenAiCompatibleAdapter } from './providers/openai-compatible';
import type { LlmClient, ProviderAdapter } from './types';

export { createLlmClient, consoleLogger } from './client';
export type { LlmClientOptions } from './client';
export { loadLlmConfig } from './config';
export type { LlmConfig } from './config';
export { LlmConfigError, LlmSchemaError } from './errors';
export type * from './types';

export function createAdapter(config: LlmConfig): ProviderAdapter {
  switch (config.provider) {
    case 'anthropic':
      return createAnthropicAdapter({ apiKey: config.apiKey!, model: config.model });
    case 'openai-compatible':
      return createOpenAiCompatibleAdapter({
        baseUrl: config.baseUrl!,
        apiKey: config.apiKey,
        model: config.model,
      });
  }
}

/** Builds the client from LLM_* environment variables. Server side only. */
export function createLlm(
  env: Record<string, string | undefined> = process.env,
  options: Omit<LlmClientOptions, 'adapter' | 'pricing'> = {},
): LlmClient {
  const config = loadLlmConfig(env);
  return createLlmClient({ ...options, adapter: createAdapter(config), pricing: config.pricing });
}
