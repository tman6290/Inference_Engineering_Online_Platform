import { createApp } from './app';

const port = Number(process.env.RUNNER_PORT ?? 4100);

createApp().listen(port, () => {
  console.info(`runner listening on http://localhost:${port}`);
});
