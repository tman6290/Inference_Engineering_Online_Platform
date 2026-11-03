import Ajv2020 from 'ajv/dist/2020';

// JSON Schema validation for a learner's results.json. Server and scripts only: import it from
// "@forward-pass/shared/results" so the web bundle never pulls in ajv.

const ajv = new Ajv2020({ allErrors: true, strict: false });

/** Whether a spec's resultsSchema is itself a valid JSON Schema; returns the problem if not. */
export function schemaProblem(schema: Record<string, unknown>): string | null {
  try {
    ajv.compile(schema);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

/** Validates data against a results schema. Errors read like "/runs/0/p95_ms: must be number". */
export function validateResults(
  schema: Record<string, unknown>,
  data: unknown,
): { ok: true } | { ok: false; errors: string[] } {
  const validate = ajv.compile(schema);
  if (validate(data)) return { ok: true };
  return {
    ok: false,
    errors: (validate.errors ?? []).slice(0, 20).map((error) => {
      const where = error.instancePath || '(root)';
      return `${where}: ${error.message ?? 'is invalid'}`;
    }),
  };
}
