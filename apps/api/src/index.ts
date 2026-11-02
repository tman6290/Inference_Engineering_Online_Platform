import { createApp } from './app';
import { loadConfig } from './config';
import { createDb } from './db';

const config = loadConfig();
const db = createDb(config.databaseUrl);

createApp({
  db,
  sessions: { secret: config.sessionSecret, secureCookies: config.secureCookies },
  inviteCodes: config.inviteCodes,
  trustProxy: config.trustProxy,
}).listen(config.port, () => {
  console.info(`api listening on http://localhost:${config.port}`);
});
