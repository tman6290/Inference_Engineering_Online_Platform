import { runnerJobSchema, type RunnerJob, type RunnerReport } from '@forward-pass/shared';
import { runJob, type JobOptions } from './job';

// Polls the API for queued submissions, one at a time, and reports each job's results back.

export interface WorkerOptions extends JobOptions {
  apiUrl: string;
  token: string;
  /** Wait between polls when nothing is queued. */
  pollMs?: number;
  /** Injected in tests. */
  run?: (job: RunnerJob, options: JobOptions) => Promise<RunnerReport>;
}

export function startWorker(options: WorkerOptions): () => void {
  const { apiUrl, token, pollMs = 5000, run = runJob } = options;
  const log = options.log ?? console.info;
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async () => {
    let busy = false;
    try {
      const res = await fetch(`${apiUrl}/api/internal/jobs/claim`, { method: 'POST', headers });
      if (res.status === 200) {
        busy = true;
        const job = runnerJobSchema.parse(await res.json());
        log(`job ${job.submissionId}: ${job.project.slug} from ${job.repoUrl}`);
        const report = await run(job, { ...options, log });
        const sent = await fetch(`${apiUrl}/api/internal/submissions/${job.submissionId}/report`, {
          method: 'POST',
          headers,
          body: JSON.stringify(report),
        });
        log(
          `job ${job.submissionId}: reported (${sent.status})${report.error ? `, ${report.error}` : ''}`,
        );
      } else if (res.status !== 204) {
        log(`claim failed: ${res.status} ${await res.text()}`);
      }
    } catch (error) {
      log(`worker: ${(error as Error).message}`);
    }
    // Straight on to the next job after one finishes; otherwise wait.
    if (!stopped) timer = setTimeout(() => void tick(), busy ? 0 : pollMs);
  };
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
