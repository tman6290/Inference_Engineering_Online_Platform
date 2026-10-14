import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createLlmClient } from './client';
import { LlmSchemaError } from './errors';
import type { GenerateRequest, LlmCallLog, ProviderAdapter, RawCompletion } from './types';

const verdict = z.object({ score: z.number().int().min(0).max(4), notes: z.string() });

function fakeAdapter(replies: string[]): ProviderAdapter & { requests: GenerateRequest[] } {
  const requests: GenerateRequest[] = [];
  return {
    name: 'openai-compatible',
    model: 'test-model',
    requests,
    async generate(request): Promise<RawCompletion> {
      requests.push({ ...request, messages: [...request.messages] });
      const text = replies.shift();
      if (text === undefined) throw new Error('no reply queued');
      return { text, inputTokens: 1000, outputTokens: 200, stopReason: 'stop' };
    },
  };
}

const params = {
  system: 'Grade it.',
  messages: [{ role: 'user' as const, content: 'answer' }],
  schema: verdict,
  temperature: 0,
  maxTokens: 512,
  label: 'test',
};

describe('createLlmClient', () => {
  it('returns validated data and logs tokens and cost', async () => {
    const logs: LlmCallLog[] = [];
    const client = createLlmClient({
      adapter: fakeAdapter(['{"score":3,"notes":"good"}']),
      pricing: { inputPerMTok: 2, outputPerMTok: 10 },
      logger: (entry) => logs.push(entry),
    });

    const result = await client.complete(params);

    expect(result.data).toEqual({ score: 3, notes: 'good' });
    expect(result.attempts).toBe(1);
    expect(result.usage).toEqual({ inputTokens: 1000, outputTokens: 200, costUsd: 0.004 });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ ok: true, label: 'test', costUsd: 0.004, model: 'test-model' });
  });

  it('accepts JSON wrapped in a code fence', async () => {
    const client = createLlmClient({
      adapter: fakeAdapter(['```json\n{"score":1,"notes":"x"}\n```']),
      logger: vi.fn(),
    });
    await expect(client.complete(params)).resolves.toMatchObject({ data: { score: 1 } });
  });

  it('retries once on schema failure and feeds the error back', async () => {
    const adapter = fakeAdapter(['{"score":9,"notes":"x"}', '{"score":2,"notes":"fixed"}']);
    const logs: LlmCallLog[] = [];
    const client = createLlmClient({ adapter, logger: (entry) => logs.push(entry) });

    const result = await client.complete(params);

    expect(result.data.score).toBe(2);
    expect(result.attempts).toBe(2);
    expect(result.usage.inputTokens).toBe(2000);
    expect(result.usage.costUsd).toBeNull();
    expect(logs.map((entry) => entry.ok)).toEqual([false, true]);
    const retry = adapter.requests[1]!;
    expect(retry.messages).toHaveLength(3);
    expect(retry.messages[2]!.content).toContain('score');
  });

  it('throws LlmSchemaError when every attempt fails', async () => {
    const client = createLlmClient({
      adapter: fakeAdapter(['not json', '{"score":"high"}']),
      logger: vi.fn(),
    });
    await expect(client.complete(params)).rejects.toBeInstanceOf(LlmSchemaError);
  });
});
