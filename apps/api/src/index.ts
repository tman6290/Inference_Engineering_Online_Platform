import path from 'node:path';
import { createApp } from './app';
import { loadConfig, repoRoot } from './config';
import { loadContent } from './content/load';
import { createDb } from './db';
import { scheduleNightlyRebuild } from './progress/store';

const config = loadConfig();
const db = createDb(config.databaseUrl);
// Refuses to start on invalid authored content, naming the file.
const content = loadContent(path.join(repoRoot, 'content'));
console.info(
  `content: ${content.digests.size} digest(s), ${content.banks.size} checkpoint bank(s)`,
);

createApp({
  db,
  sessions: { secret: config.sessionSecret, secureCookies: config.secureCookies },
  inviteCodes: config.inviteCodes,
  trustProxy: config.trustProxy,
  content,
  devRoutes: config.nodeEnv !== 'production',
}).listen(config.port, () => {
  console.info(`api listening on http://localhost:${config.port}`);
});

// Study days refresh on every read of progress; the nightly pass recomputes them in full.
scheduleNightlyRebuild(db);
