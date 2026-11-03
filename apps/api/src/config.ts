import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  appUrl: string;
  databaseUrl: string;
  /** HMAC key for session ids. */
  sessionSecret: string;
  /** INVITE_CODE_1 and INVITE_CODE_2; a missing code means that seat can't be claimed. */
  inviteCodes: [string | undefined, string | undefined];
  secureCookies: boolean;
  /** Hops of reverse proxy to trust for the client IP (rate limiting). */
  trustProxy: number;
  /** Shared secret the runner sends to the internal job routes. */
  runnerToken: string | undefined;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  INVITE_CODE_1: z.string().optional(),
  INVITE_CODE_2: z.string().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  RUNNER_TOKEN: z.string().optional(),
});

const blankToUndefined = (value: string | undefined) => (value ? value : undefined);

/** Reads the repo-root .env (if present) and validates the API's settings. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  loadDotenv({ path: path.join(repoRoot, '.env'), quiet: true });
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const detail = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid API configuration:\n  ${detail.join('\n  ')}`);
  }
  const parsed = result.data;
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.API_PORT,
    appUrl: parsed.APP_URL,
    databaseUrl: parsed.DATABASE_URL,
    sessionSecret: parsed.SESSION_SECRET,
    inviteCodes: [blankToUndefined(parsed.INVITE_CODE_1), blankToUndefined(parsed.INVITE_CODE_2)],
    secureCookies: parsed.NODE_ENV === 'production',
    trustProxy: parsed.TRUST_PROXY,
    runnerToken: blankToUndefined(parsed.RUNNER_TOKEN),
  };
}
