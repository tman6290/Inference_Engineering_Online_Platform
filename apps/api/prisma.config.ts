import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Read leniently so `prisma generate` works without a database (CI, fresh clones).
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
