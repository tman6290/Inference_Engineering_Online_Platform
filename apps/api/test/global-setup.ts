import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import pg from 'pg';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotenv({ path: path.resolve(apiRoot, '../../.env'), quiet: true });

/**
 * Creates the test database if needed and applies migrations once per run.
 * Without DATABASE_URL_TEST the integration tests skip locally and fail in CI.
 */
export default async function setup(): Promise<void> {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    if (process.env.CI) throw new Error('DATABASE_URL_TEST must be set in CI.');
    console.warn('DATABASE_URL_TEST is not set; API integration tests will be skipped.');
    return;
  }

  const target = new URL(url);
  const dbName = target.pathname.slice(1);
  if (!/^[a-z0-9_]+$/i.test(dbName) || !dbName.includes('test')) {
    throw new Error(
      `Refusing to use "${dbName}" as a test database; its name must contain "test".`,
    );
  }

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }

  execFileSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['exec', 'prisma', 'migrate', 'deploy'],
    {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
      shell: process.platform === 'win32',
    },
  );
}
