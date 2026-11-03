import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../node_modules/.prisma-client/client';

export type Db = PrismaClient;
export { Prisma };
export type {
  Answer as AnswerRow,
  Attempt as AttemptRow,
} from '../node_modules/.prisma-client/client';

export function createDb(connectionString: string): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** True when a write failed on a unique constraint. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
