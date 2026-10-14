import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { GenerateRequest, ProviderAdapter, RawCompletion } from '../types';

export interface AnthropicAdapterOptions {
  apiKey: string;
  model: string;
  /** Injected in tests. */
  client?: Pick<Anthropic, 'messages'>;
}

export function createAnthropicAdapter(options: AnthropicAdapterOptions): ProviderAdapter {
  const client = options.client ?? new Anthropic({ apiKey: options.apiKey });
  const model = options.model;
  // Newer models reject sampling parameters. Learned from the first 400, then skipped.
  let sendTemperature = true;

  async function generate(request: GenerateRequest): Promise<RawCompletion> {
    const body: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: request.maxTokens,
      system: request.system,
      messages: request.messages,
      output_config: { format: zodOutputFormat(request.schema) },
    };

    let response: Anthropic.Message;
    try {
      response = await client.messages.create(
        sendTemperature ? { ...body, temperature: request.temperature } : body,
      );
    } catch (error) {
      if (!sendTemperature || !isTemperatureRejection(error)) throw error;
      sendTemperature = false;
      response = await client.messages.create(body);
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      text,
      inputTokens:
        response.usage.input_tokens +
        (response.usage.cache_creation_input_tokens ?? 0) +
        (response.usage.cache_read_input_tokens ?? 0),
      outputTokens: response.usage.output_tokens,
      stopReason: response.stop_reason,
    };
  }

  return { name: 'anthropic', model, generate };
}

function isTemperatureRejection(error: unknown): boolean {
  return error instanceof Anthropic.BadRequestError && /temperature/i.test(error.message);
}
