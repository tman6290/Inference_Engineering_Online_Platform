import { spawn } from 'node:child_process';
import { CHECK_LOG_BYTES } from '@forward-pass/shared';

export interface ExecResult {
  code: number | null;
  /** stdout and stderr interleaved, keeping the last CHECK_LOG_BYTES. */
  output: string;
  stdout: string;
  timedOut: boolean;
  durationMs: number;
}

/** Keeps the tail of a growing buffer once it passes `limit` bytes. */
function capped(limit: number) {
  let chunks: Buffer[] = [];
  let size = 0;
  let dropped = false;
  return {
    push(chunk: Buffer) {
      chunks.push(chunk);
      size += chunk.length;
      while (size > limit && chunks.length > 1) {
        size -= chunks.shift()!.length;
        dropped = true;
      }
      if (size > limit) {
        const last = chunks[0]!;
        chunks = [last.subarray(last.length - limit)];
        size = limit;
        dropped = true;
      }
    },
    text() {
      const body = Buffer.concat(chunks).toString('utf8');
      return dropped ? `… output cut to the last ${Math.round(limit / 1024)} KB\n${body}` : body;
    },
  };
}

/**
 * Runs a program with arguments (never through a shell), killing it after `timeoutMs`. On a
 * timeout `onTimeout` runs first, e.g. to `docker kill` a container the process was attached to.
 */
export function exec(
  command: string,
  args: string[],
  {
    timeoutMs,
    cwd,
    env,
    onTimeout,
  }: {
    timeoutMs: number;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    onTimeout?: () => Promise<unknown>;
  },
): Promise<ExecResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const both = capped(CHECK_LOG_BYTES);
    const out = capped(CHECK_LOG_BYTES);
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      void Promise.resolve(onTimeout?.())
        .catch(() => undefined)
        .finally(() => child.kill('SIGKILL'));
    }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      both.push(chunk);
      out.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => both.push(chunk));
    const finish = (code: number | null, extra = '') => {
      clearTimeout(timer);
      resolve({
        code,
        output: both.text() + extra,
        stdout: out.text(),
        timedOut,
        durationMs: Date.now() - started,
      });
    };
    child.on('error', (error) => finish(null, `\n${error.message}`));
    child.on('close', (code) => finish(code));
  });
}
