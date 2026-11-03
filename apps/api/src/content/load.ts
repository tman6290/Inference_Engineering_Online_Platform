import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  checkpointBankSchema,
  digestSchema,
  type CheckpointBank,
  type Digest,
  type LessonId,
} from '@forward-pass/shared';
import type { z } from 'zod';

/** Authored content, loaded once at start-up. Answer keys stay in here, on the server. */
export interface LoadedContent {
  digests: Map<LessonId, Digest>;
  banks: Map<string, CheckpointBank>;
}

export const emptyContent = (): LoadedContent => ({ digests: new Map(), banks: new Map() });

export class ContentError extends Error {
  override name = 'ContentError';
}

function parseFile<T>(file: string, schema: z.ZodType<T>): T {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new ContentError(`${file} is not valid JSON: ${(error as Error).message}`);
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    throw new ContentError(
      `${file} is invalid at ${issue.path.join('.') || '(root)'}: ${issue.message}. Run pnpm content:validate.`,
    );
  }
  return result.data;
}

const jsonIn = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => path.join(dir, name))
    : [];

/**
 * Reads every digest and checkpoint bank under content/chapters/. Throws on the first invalid
 * file, naming it, so the API refuses to start with broken content.
 */
export function loadContent(contentDir: string): LoadedContent {
  const content = emptyContent();
  const chaptersDir = path.join(contentDir, 'chapters');
  if (!existsSync(chaptersDir)) return content;

  for (const chapter of readdirSync(chaptersDir, { withFileTypes: true })) {
    if (!chapter.isDirectory()) continue;
    const dir = path.join(chaptersDir, chapter.name);
    for (const file of jsonIn(path.join(dir, 'digests'))) {
      const digest = parseFile(file, digestSchema);
      if (content.digests.has(digest.lesson)) {
        throw new ContentError(`${file}: a second digest for lesson ${digest.lesson}`);
      }
      content.digests.set(digest.lesson, digest);
    }
    for (const file of jsonIn(path.join(dir, 'checkpoints'))) {
      const bank = parseFile(file, checkpointBankSchema);
      content.banks.set(bank.sectionNumber, bank);
    }
  }
  return content;
}
