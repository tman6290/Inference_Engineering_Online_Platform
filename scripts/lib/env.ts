import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

config({ path: path.join(repoRoot, '.env'), quiet: true });
