import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { createApp } from './app';
import { startWorker } from './worker';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
loadDotenv({ path: path.join(repoRoot, '.env'), quiet: true });

const port = Number(process.env.RUNNER_PORT ?? 4100);
const apiUrl = process.env.RUNNER_API_URL ?? 'http://localhost:4000';
const token = process.env.RUNNER_TOKEN;
const jobsDir = process.env.RUNNER_JOBS_DIR ?? path.join(repoRoot, 'runner-jobs');

createApp().listen(port, () => {
  console.info(`runner listening on http://localhost:${port}`);
});

if (token) {
  startWorker({
    apiUrl,
    token,
    jobsDir,
    hostJobsDir: process.env.RUNNER_HOST_JOBS_DIR || undefined,
    image: process.env.RUNNER_IMAGE ?? 'forward-pass-sandbox:py312',
  });
  console.info(`runner polling ${apiUrl} for jobs`);
} else {
  console.info('runner: RUNNER_TOKEN is not set, so no jobs run.');
}
