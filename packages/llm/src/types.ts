import type { z } from 'zod';

export type ProviderName = 'anthropic' | 'openai-compatible';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompleteParams<S extends z.ZodType> {
  system: string;
  messages: ChatMessage[];
  /** Output schema. The reply must be JSON that parses against it. */
  schema: S;
  /** Grading calls pass 0. */
  temperature: number;
  /** Output token budget per attempt. */
  maxTokens: number;
  /** Short tag for the call log, e.g. `critique:03-batching`. */
  label?: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /** Null when no pricing is configured. */
  costUsd: number | null;
}

export interface CompleteResult<T> {
  data: T;
  usage: Usage;
  model: string;
  attempts: number;
}

export interface LlmClient {
  readonly provider: ProviderName;
  readonly model: string;
  complete<S extends z.ZodType>(params: CompleteParams<S>): Promise<CompleteResult<z.infer<S>>>;
}

/** What an adapter sends to its vendor for one attempt. */
export interface GenerateRequest {
  system: string;
  messages: ChatMessage[];
  schema: z.ZodType;
  temperature: number;
  maxTokens: number;
}

/** What an adapter hands back: raw text plus token counts. Validation happens in the client. */
export interface RawCompletion {
  text: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}

export interface ProviderAdapter {
  readonly name: ProviderName;
  readonly model: string;
  generate(request: GenerateRequest): Promise<RawCompletion>;
}

export interface Pricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

export interface LlmCallLog {
  event: 'llm_call';
  provider: ProviderName;
  model: string;
  label: string | null;
  attempt: number;
  ok: boolean;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  ms: number;
  stopReason: string | null;
  error?: string;
}

export type LlmLogger = (entry: LlmCallLog) => void;
