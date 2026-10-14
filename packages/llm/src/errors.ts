export class LlmConfigError extends Error {
  override name = 'LlmConfigError';
}

export class LlmSchemaError extends Error {
  override name = 'LlmSchemaError';
  constructor(
    message: string,
    readonly attempts: number,
    readonly lastText: string,
  ) {
    super(message);
  }
}
