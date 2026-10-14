import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { z } from 'zod';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
config({ path: path.join(repoRoot, '.env'), quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().optional(),
  APP_URL: z.string().default('http://localhost:5173'),
});

export const env = envSchema.parse(process.env);
