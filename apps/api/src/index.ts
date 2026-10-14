import { createApp } from './app';
import { env } from './env';

createApp().listen(env.API_PORT, () => {
  console.info(`api listening on http://localhost:${env.API_PORT}`);
});
