import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  chapterManifestSchema,
  checkpointBankSchema,
  digestSchema,
  exerciseSchema,
  type CheckpointBank,
  type Digest,
  type Exercise,
  type LessonId,
} from '@forward-pass/shared';
import type { z } from 'zod';

export interface LoadedExercise {
  exercise: Exercise;
  /** The exercise folder; downloads are served from inside it only. */
  dir: string;
  /** Reference files under solution/, relative to the folder. */
  solutionFiles: string[];
}

/** Authored content, loaded once at start-up. Answer keys stay in here, on the server. */
export interface LoadedContent {
  digests: Map<LessonId, Digest>;
  banks: Map<string, CheckpointBank>;
  /** By id, in chapter.json order. */
  exercises: Map<string, LoadedExercise>;
  /** Goes up each time the files are reloaded, so caches built from them know to rebuild. */
  revision: number;
}

export const emptyContent = (): LoadedContent => ({
  digests: new Map(),
  banks: new Map(),
  exercises: new Map(),
  revision: 0,
});

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

/** Files under `dir`, as forward-slash paths relative to `root`. */
function filesUnder(root: string, dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(root, full);
    return entry.isFile() ? [path.relative(root, full).split(path.sep).join('/')] : [];
  });
}

const jsonIn = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => path.join(dir, name))
    : [];

/**
 * Reads every digest, checkpoint bank and exercise under content/chapters/. Throws on the first invalid
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
    const manifestFile = path.join(dir, 'chapter.json');
    const manifest = existsSync(manifestFile)
      ? parseFile(manifestFile, chapterManifestSchema)
      : null;
    for (const id of manifest?.exercises ?? []) {
      const exerciseDir = path.join(dir, 'exercises', id);
      const exercise = parseFile(path.join(exerciseDir, 'exercise.json'), exerciseSchema);
      if (content.exercises.has(exercise.id)) {
        throw new ContentError(`${exerciseDir}: a second exercise with id ${exercise.id}`);
      }
      content.exercises.set(exercise.id, {
        exercise,
        dir: exerciseDir,
        solutionFiles: filesUnder(exerciseDir, path.join(exerciseDir, 'solution')),
      });
    }
  }
  return content;
}
