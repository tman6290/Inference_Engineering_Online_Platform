import type { z } from 'zod';
import { costUsd } from './cost';
import { LlmSchemaError } from './errors';
import { extractJson } from './json';
import type {
  ChatMessage,
  CompleteParams,
  CompleteResult,
  LlmClient,
  LlmLogger,
  Pricing,
  ProviderAdapter,
} from './types';

export interface LlmClientOptions {
  adapter: ProviderAdapter;
  pricing?: Pricing | null;
  logger?: LlmLogger;
  /** Total attempts per call, including the first. A schema failure triggers the next one. */
  maxAttempts?: number;
}

export const consoleLogger: LlmLogger = (entry) => {
  console.info(JSON.stringify(entry));
};

export function createLlmClient(options: LlmClientOptions): LlmClient {
  const { adapter, pricing = null, logger = consoleLogger, maxAttempts = 2 } = options;

  async function complete<S extends z.ZodType>(
    params: CompleteParams<S>,
  ): Promise<CompleteResult<z.infer<S>>> {
    const messages: ChatMessage[] = [...params.messages];
    let inputTokens = 0;
    let outputTokens = 0;
    let lastText = '';
    let lastError = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const started = Date.now();
      const raw = await adapter.generate({
        system: params.system,
        messages,
        schema: params.schema,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
      });
      inputTokens += raw.inputTokens;
      outputTokens += raw.outputTokens;
      lastText = raw.text;

      const parsed = parse(params.schema, raw.text);
      logger({
        event: 'llm_call',
        provider: adapter.name,
        model: adapter.model,
        label: params.label ?? null,
        attempt,
        ok: parsed.ok,
        inputTokens: raw.inputTokens,
        outputTokens: raw.outputTokens,
        costUsd: costUsd(pricing, raw.inputTokens, raw.outputTokens),
        ms: Date.now() - started,
        stopReason: raw.stopReason,
        ...(parsed.ok ? {} : { error: parsed.error }),
      });

      if (parsed.ok) {
        return {
          data: parsed.data,
          usage: {
            inputTokens,
            outputTokens,
            costUsd: costUsd(pricing, inputTokens, outputTokens),
          },
          model: adapter.model,
          attempts: attempt,
        };
      }

      lastError = parsed.error;
      messages.push(
        { role: 'assistant', content: raw.text },
        {
          role: 'user',
          content: `That reply did not match the required JSON schema: ${parsed.error}\nReply again with only the corrected JSON.`,
        },
      );
    }

    throw new LlmSchemaError(
      `LLM output failed schema validation after ${maxAttempts} attempts: ${lastError}`,
      maxAttempts,
      lastText,
    );
  }

  return { provider: adapter.name, model: adapter.model, complete };
}

type ParseOutcome<T> = { ok: true; data: T } | { ok: false; error: string };

function parse<S extends z.ZodType>(schema: S, text: string): ParseOutcome<z.infer<S>> {
  let value: unknown;
  try {
    value = extractJson(text);
  } catch {
    return { ok: false, error: 'reply was not valid JSON' };
  }
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  const issues = result.error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  return { ok: false, error: issues };
}
