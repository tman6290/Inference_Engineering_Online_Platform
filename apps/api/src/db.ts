import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../node_modules/.prisma-client/client';
import { env } from './env';

let client: PrismaClient | undefined;

/** One Prisma client per process, created on first use. */
export function db(): PrismaClient {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  return client;
}
