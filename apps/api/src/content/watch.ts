import { watch } from 'node:fs';
import { loadContent, type LoadedContent } from './load';

/** Edits arrive in bursts (an editor saving, an ingest writing many files); wait for quiet. */
const SETTLE_MS = 300;

/**
 * Development only: reloads content/ whenever a file under it changes, swapping the new digests,
 * banks and exercises into `content` in place so every router sees them. A broken file keeps the
 * previous version and logs why, the same message the API would refuse to start with.
 * Returns a function that stops watching.
 */
export function watchContent(
  contentDir: string,
  content: LoadedContent,
  log: (message: string) => void = console.info,
  /** Runs after each successful reload, e.g. to sync project rows. */
  onReload: () => void | Promise<void> = () => undefined,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reload = () => {
    try {
      const fresh = loadContent(contentDir);
      content.digests = fresh.digests;
      content.banks = fresh.banks;
      content.exercises = fresh.exercises;
      content.projects = fresh.projects;
      content.revision++;
      void Promise.resolve(onReload()).catch((error: unknown) =>
        log(`content: after reload: ${(error as Error).message}`),
      );
      log(
        `content: reloaded ${content.digests.size} digest(s), ${content.banks.size} bank(s), ${content.exercises.size} exercise(s), ${content.projects.size} project(s)`,
      );
    } catch (error) {
      log(`content: kept the previous version. ${(error as Error).message}`);
    }
  };
  const watcher = watch(contentDir, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(reload, SETTLE_MS);
  });
  return () => {
    clearTimeout(timer);
    watcher.close();
  };
}
