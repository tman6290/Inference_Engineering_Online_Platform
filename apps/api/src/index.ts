import path from 'node:path';
import { createApp } from './app';
import { loadConfig, repoRoot } from './config';
import { loadContent } from './content/load';
import { watchContent } from './content/watch';
import { createDb } from './db';
import { scheduleNightlyRebuild } from './progress/store';
import { syncProjects } from './projects/sync';
import { createLlm } from '@forward-pass/llm';
import { createCritiqueRunner } from './projects/critique';

const config = loadConfig();
const db = createDb(config.databaseUrl);
// Refuses to start on invalid authored content, naming the file.
const content = loadContent(path.join(repoRoot, 'content'));
// Critiques need LLM_* in .env; without them, checked submissions fail with that reason.
let critique: ReturnType<typeof createCritiqueRunner> | undefined;
try {
  critique = createCritiqueRunner(db, content, createLlm(process.env));
} catch (error) {
  console.info(`critiques off: ${(error as Error).message}`);
}
console.info(
  `content: ${content.digests.size} digest(s), ${content.banks.size} checkpoint bank(s), ${content.projects.size} project(s)`,
);

createApp({
  db,
  sessions: { secret: config.sessionSecret, secureCookies: config.secureCookies },
  inviteCodes: config.inviteCodes,
  trustProxy: config.trustProxy,
  content,
  devRoutes: config.nodeEnv !== 'production',
  runnerToken: config.runnerToken,
  critique,
}).listen(config.port, () => {
  console.info(`api listening on http://localhost:${config.port}`);
});

// In development, edits under content/ (and a re-ingest) show up without a restart.
if (config.nodeEnv !== 'production') {
  watchContent(path.join(repoRoot, 'content'), content, console.info, () =>
    syncProjects(db, content).then(() => undefined),
  );
}
// Project rows mirror content/projects so submissions can reference them.
void syncProjects(db, content).then(
  (count) => console.info(`projects: synced ${count} spec(s)`),
  (error: unknown) => console.error('projects: sync failed', error),
);

// Study days refresh on every read of progress; the nightly pass recomputes them in full.
scheduleNightlyRebuild(db);
