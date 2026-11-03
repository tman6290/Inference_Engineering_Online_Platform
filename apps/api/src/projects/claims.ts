// README claims checked against results.json, without a model (hard rule 4: the grader never
// trusts claims). A number with a unit in the README counts as a claim; it is backed when
// results.json holds that number, that number as a fraction for a percentage, or that ratio
// between two of its numbers for an "x" speedup.

export interface Claim {
  claim: string;
  why: string;
}

const UNIT =
  '(%|x|×|ms|s|sec|seconds|min|minutes|tok/s|tokens/s|tokens per second|tps|rps|qps|gb|mb|gib|mib|tokens|requests|users|gpus?|\\$|usd)';
const CLAIM = new RegExp(`(\\$\\s?)?(\\d+(?:[.,]\\d+)?)\\s?${UNIT}(?![a-z])`, 'gi');

/** Every number anywhere in a JSON value. */
export function numbersIn(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number' && Number.isFinite(value)) out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => numbersIn(item, out));
  else if (value && typeof value === 'object')
    Object.values(value).forEach((item) => numbersIn(item, out));
  return out;
}

/** Equal up to the rounding a README would apply: 2% or the last written digit. */
function close(claimed: number, actual: number, decimals: number): boolean {
  const step = 10 ** -decimals;
  return Math.abs(claimed - actual) <= Math.max(Math.abs(claimed) * 0.02, step / 2 + 1e-9);
}

/** README prose only: code blocks and inline code hold commands and examples, not claims. */
function prose(readme: string): string[] {
  return readme
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('|') && !/^#+\s/.test(line));
}

export function findUnsupportedClaims(readme: string | null, results: unknown): Claim[] {
  if (!readme) return [];
  const values = numbersIn(results);
  const sample = values.slice(0, 400);
  const claims: Claim[] = [];
  for (const sentence of prose(readme)) {
    for (const match of sentence.matchAll(CLAIM)) {
      const written = match[2]!.replace(',', '.');
      const number = Number(written);
      const unit = match[3]!.toLowerCase();
      const decimals = written.includes('.') ? written.split('.')[1]!.length : 0;
      // Small counts like "3 charts" or "1 GPU" are descriptions, not measurements.
      if (Number.isInteger(number) && number <= 4 && !['%', 'x', '×', 'ms', 's'].includes(unit))
        continue;

      let backed = values.some((value) => close(number, value, decimals));
      if (!backed && unit === '%')
        backed = values.some((value) => close(number, value * 100, decimals));
      if (!backed && (unit === 'x' || unit === '×')) {
        backed = sample.some((a) => sample.some((b) => b !== 0 && close(number, a / b, decimals)));
      }
      if (!backed) {
        claims.push({
          claim: sentence.length > 200 ? `${sentence.slice(0, 197)}…` : sentence,
          why: `results.json has no value matching ${match[0].trim()}.`,
        });
        break;
      }
    }
  }
  return claims;
}
