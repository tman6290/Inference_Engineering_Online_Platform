import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { loadConfig } from '@forward-pass/api/config';
import { loadContent } from '@forward-pass/api/content';
import { createDb } from '@forward-pass/api/db';
import { SEED_USERS, SeedRefused, seedActivity } from '@forward-pass/api/dev/seed';
import { repoRoot } from './lib/env';

const usage = `Usage: pnpm db:seed [--seed <text>] [--days <n>] [--password <password>]

  Writes 60 days of made-up study for two demo learners (${SEED_USERS.map((u) => u.email).join(', ')}),
  so Home and Progress have data. Run it on a database with no real accounts, with the book
  ingested. The same --seed always gives the same history; change it to get another.`;

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<number> {
  if (process.argv.includes('--help')) {
    console.info(usage);
    return 0;
  }
  const seed = option('seed') ?? 'forward-pass';
  const days = Number(option('days') ?? 60);
  const password = option('password') ?? randomBytes(9).toString('base64url');
  const db = createDb(loadConfig().databaseUrl);
  try {
    const content = loadContent(path.join(repoRoot, 'content'));
    const summary = await seedActivity(db, content, { seed, days, password });
    console.table(summary.users);
    console.info(`Seed "${seed}". Both demo accounts sign in with the password: ${password}`);
    return 0;
  } catch (error) {
    if (error instanceof SeedRefused) {
      console.error(error.message);
      return 1;
    }
    throw error;
  } finally {
    await db.$disconnect();
  }
}

process.exitCode = await main();
