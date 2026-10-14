import { z } from 'zod';
import type { GenerateRequest, ProviderAdapter, RawCompletion } from '../types';

export interface OpenAiCompatibleAdapterOptions {
  /** Base URL up to and including the version segment, e.g. `http://localhost:8000/v1`. */
  baseUrl: string;
  apiKey?: string | undefined;
  model: string;
  fetch?: typeof fetch;
}

const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).optional(),
});

export function createOpenAiCompatibleAdapter(
  options: OpenAiCompatibleAdapterOptions,
): ProviderAdapter {
  const doFetch = options.fetch ?? fetch;
  const url = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const model = options.model;

  async function generate(request: GenerateRequest): Promise<RawCompletion> {
    const jsonSchema = z.toJSONSchema(request.schema);
    const res = await doFetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        messages: [
          {
            role: 'system',
            content: `${request.system}\n\nReply with a single JSON value that matches this JSON Schema, and nothing else:\n${JSON.stringify(jsonSchema)}`,
          },
          ...request.messages,
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'output', schema: jsonSchema },
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`openai-compatible request failed: ${res.status} ${detail.slice(0, 500)}`);
    }

    const payload = responseSchema.parse(await res.json());
    const choice = payload.choices[0]!;
    return {
      text: choice.message.content ?? '',
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
      stopReason: choice.finish_reason ?? null,
    };
  }

  return { name: 'openai-compatible', model, generate };
}
