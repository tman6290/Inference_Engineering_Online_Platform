import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { loadConfig } from '@forward-pass/api/config';
import { loadContent } from '@forward-pass/api/content';
import { createDb } from '@forward-pass/api/db';
import { SEED_USERS, SeedRefused, seedActivity } from '@forward-pass/api/dev/seed';
import { syncProjects } from '@forward-pass/api/projects/sync';
import { repoRoot } from './lib/env';

const usage = `Usage: pnpm db:seed [--demo [--seed <text>] [--days <n>] [--password <password>]]

  With no flags: copies every project spec in content/projects into the database, updating
  rows in place. Safe on any database; the API also does this when it starts.

  --demo also writes 60 days of made-up study for two demo learners
  (${SEED_USERS.map((u) => u.email).join(', ')}), so Home and Progress have data. It refuses a
  database with real accounts. The same --seed always gives the same history.`;

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<number> {
  if (process.argv.includes('--help')) {
    console.info(usage);
    return 0;
  }
  const db = createDb(loadConfig().databaseUrl);
  try {
    const content = loadContent(path.join(repoRoot, 'content'));
    console.info(`projects: synced ${await syncProjects(db, content)} spec(s)`);
    if (!process.argv.includes('--demo')) return 0;

    const seed = option('seed') ?? 'forward-pass';
    const days = Number(option('days') ?? 60);
    const password = option('password') ?? randomBytes(9).toString('base64url');
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
