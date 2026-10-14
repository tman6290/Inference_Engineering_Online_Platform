import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { loadLlmConfig } from './config';
import { LlmConfigError } from './errors';
import { createAdapter } from './index';
import { createAnthropicAdapter } from './providers/anthropic';
import { createOpenAiCompatibleAdapter } from './providers/openai-compatible';

const schema = z.object({ ok: z.boolean() });
const request = {
  system: 'sys',
  messages: [{ role: 'user' as const, content: 'hi' }],
  schema,
  temperature: 0,
  maxTokens: 64,
};

describe('loadLlmConfig', () => {
  it('selects the provider from LLM_PROVIDER', () => {
    const anthropic = createAdapter(
      loadLlmConfig({ LLM_PROVIDER: 'anthropic', LLM_API_KEY: 'k', LLM_MODEL: 'm' }),
    );
    const compatible = createAdapter(
      loadLlmConfig({
        LLM_PROVIDER: 'openai-compatible',
        LLM_BASE_URL: 'http://localhost:8000/v1',
        LLM_MODEL: 'm',
      }),
    );
    expect(anthropic.name).toBe('anthropic');
    expect(compatible.name).toBe('openai-compatible');
  });

  it('reads optional pricing', () => {
    const config = loadLlmConfig({
      LLM_PROVIDER: 'anthropic',
      LLM_API_KEY: 'k',
      LLM_MODEL: 'm',
      LLM_PRICE_INPUT_PER_MTOK: '2',
      LLM_PRICE_OUTPUT_PER_MTOK: '10',
    });
    expect(config.pricing).toEqual({ inputPerMTok: 2, outputPerMTok: 10 });
  });

  it('rejects a missing base URL for openai-compatible', () => {
    expect(() =>
      loadLlmConfig({ LLM_PROVIDER: 'openai-compatible', LLM_MODEL: 'm', LLM_BASE_URL: '' }),
    ).toThrow(LlmConfigError);
  });

  it('rejects an unknown provider', () => {
    expect(() => loadLlmConfig({ LLM_PROVIDER: 'other', LLM_MODEL: 'm' })).toThrow(LlmConfigError);
  });
});

describe('openai-compatible adapter', () => {
  it('posts to /chat/completions and returns text and usage', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 12, completion_tokens: 3 },
          }),
          { status: 200 },
        ),
    );
    const adapter = createOpenAiCompatibleAdapter({
      baseUrl: 'http://localhost:8000/v1/',
      apiKey: 'secret',
      model: 'local-model',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await adapter.generate(request);

    expect(result).toEqual({
      text: '{"ok":true}',
      inputTokens: 12,
      outputTokens: 3,
      stopReason: 'stop',
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:8000/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: 'local-model', temperature: 0, max_tokens: 64 });
    expect(body.response_format.type).toBe('json_schema');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret');
  });

  it('throws on a non-2xx response', async () => {
    const adapter = createOpenAiCompatibleAdapter({
      baseUrl: 'http://localhost:8000/v1',
      model: 'm',
      fetch: (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch,
    });
    await expect(adapter.generate(request)).rejects.toThrow('500');
  });
});

describe('anthropic adapter', () => {
  const message = {
    content: [{ type: 'text', text: '{"ok":true}' }],
    usage: {
      input_tokens: 10,
      output_tokens: 4,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 5,
    },
    stop_reason: 'end_turn',
  };

  it('sends a structured output format and counts cached input', async () => {
    const create = vi.fn(async () => message);
    const adapter = createAnthropicAdapter({
      apiKey: 'k',
      model: 'm',
      client: { messages: { create } } as never,
    });

    const result = await adapter.generate(request);

    expect(result).toEqual({
      text: '{"ok":true}',
      inputTokens: 15,
      outputTokens: 4,
      stopReason: 'end_turn',
    });
    const body = (create.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(body).toMatchObject({ model: 'm', max_tokens: 64, temperature: 0, system: 'sys' });
    expect(body.output_config).toMatchObject({ format: { type: 'json_schema' } });
  });

  it('drops temperature after the model rejects it', async () => {
    const rejection = new Anthropic.BadRequestError(
      400,
      { error: { message: 'temperature is not supported for this model' } },
      'temperature is not supported for this model',
      new Headers(),
    );
    const create = vi.fn().mockRejectedValueOnce(rejection).mockResolvedValue(message);
    const adapter = createAnthropicAdapter({
      apiKey: 'k',
      model: 'm',
      client: { messages: { create } } as never,
    });

    await adapter.generate(request);
    await adapter.generate(request);

    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls[1]![0]).not.toHaveProperty('temperature');
    expect(create.mock.calls[2]![0]).not.toHaveProperty('temperature');
  });
});
