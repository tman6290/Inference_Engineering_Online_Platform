import { chmod, mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { githubRepoUrlSchema, type RunnerJob, type RunnerReport } from '@forward-pass/shared';
import {
  checkFiles,
  checkReadme,
  checkResults,
  findReadme,
  listFiles,
  pickSources,
} from './checks';
import { exec } from './exec';

// One submission's checks. Learner code only ever runs inside the sandbox container: no network,
// 2 CPUs, 4 GB, the repo read-only, a writable /out, and a hard timeout.

export interface JobOptions {
  /** Where job folders are made; each is deleted when the job ends. */
  jobsDir: string;
  /** The same folder as the Docker daemon sees it, when the runner itself runs in a container. */
  hostJobsDir?: string;
  /** Built from docker/sandbox/Dockerfile. */
  image: string;
  /** Tests clone local fixture repos; real jobs take GitHub https URLs only. */
  allowLocalRepos?: boolean;
  docker?: string;
  git?: string;
  log?: (message: string) => void;
}

const CLONE_TIMEOUT_MS = 120_000;
const INSTALL_TIMEOUT_MS = 300_000;
const DEFAULT_RUN_TIMEOUT_S = 480;

type Check = RunnerReport['checks'][number];

async function clone(job: RunnerJob, dir: string, options: JobOptions): Promise<string> {
  const git = options.git ?? 'git';
  const local = options.allowLocalRepos && /^file:\/\//.test(job.repoUrl);
  if (!local && !githubRepoUrlSchema.safeParse(job.repoUrl).success) {
    throw new Error('Only GitHub https repositories can be checked.');
  }
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1' };
  const run = async (args: string[], cwd?: string) => {
    const result = await exec(git, args, { timeoutMs: CLONE_TIMEOUT_MS, cwd, env });
    if (result.code !== 0) {
      throw new Error(
        `git ${args[0]} failed${result.timedOut ? ' (timed out)' : ''}: ${result.output.trim().slice(-500)}`,
      );
    }
    return result.stdout.trim();
  };
  if (job.commitSha) {
    // Fetch just that commit, one level deep.
    await mkdir(dir, { recursive: true });
    await run(['init', '--quiet'], dir);
    await run(['remote', 'add', 'origin', job.repoUrl], dir);
    await run(['fetch', '--quiet', '--depth', '1', 'origin', job.commitSha], dir);
    await run(['-c', 'advice.detachedHead=false', 'checkout', '--quiet', 'FETCH_HEAD'], dir);
  } else {
    await run(['clone', '--quiet', '--depth', '1', '--no-tags', job.repoUrl, dir]);
  }
  return run(['rev-parse', 'HEAD'], dir);
}

/** The Docker flags that make the sandbox: no network, capped CPU, memory and processes. */
export function sandboxArgs({
  name,
  repo,
  out,
  deps,
  image,
  cmd,
}: {
  name: string;
  repo: string;
  out: string;
  deps: string | null;
  image: string;
  cmd: string;
}): string[] {
  return [
    'run',
    '--rm',
    '--name',
    name,
    '--network',
    'none',
    '--cpus',
    '2',
    '--memory',
    '4g',
    '--memory-swap',
    '4g',
    '--pids-limit',
    '512',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,size=512m',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--user',
    '1000:1000',
    '-v',
    `${repo}:/work:ro`,
    '-v',
    `${out}:/out:rw`,
    ...(deps ? ['-v', `${deps}:/deps:ro`, '-e', 'PYTHONPATH=/deps'] : []),
    '-e',
    'OUT_DIR=/out',
    '-e',
    'HOME=/tmp',
    '-w',
    '/work',
    image,
    'sh',
    '-c',
    cmd,
  ];
}

/** Runs every check in the spec's order and gathers what the critique reads. Never throws. */
export async function runJob(job: RunnerJob, options: JobOptions): Promise<RunnerReport> {
  const log = options.log ?? (() => undefined);
  const docker = options.docker ?? 'docker';
  const dir = path.join(options.jobsDir, job.submissionId);
  const hostDir = path.join(options.hostJobsDir ?? options.jobsDir, job.submissionId);
  const repo = path.join(dir, 'repo');
  const empty: RunnerReport['artifacts'] = {
    fileTree: [],
    readme: null,
    results: null,
    sources: [],
  };
  // Set once any container has run as the sandbox user, so cleanup knows to release its files.
  let sandboxed = false;

  try {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    let commitSha: string;
    try {
      commitSha = await clone(job, repo, options);
    } catch (error) {
      return {
        commitSha: job.commitSha,
        checks: [],
        artifacts: empty,
        error: `Could not clone the repo. ${(error as Error).message}`,
      };
    }
    log(`job ${job.submissionId}: cloned ${commitSha}`);

    const files = listFiles(repo);
    const readme = findReadme(repo, files);
    const results = checkResults(repo, files, job.project.resultsSchema);
    const checks: Check[] = [];
    let deps: string | null | undefined;
    let installError: string | null = null;

    for (const check of job.project.checks) {
      const started = Date.now();
      const done = (passed: boolean, text: string) =>
        checks.push({
          checkId: check.id,
          kind: check.kind,
          passed,
          log: text,
          durationMs: Date.now() - started,
        });

      if (check.kind === 'files') {
        const outcome = checkFiles(files, job.project.requiredFiles);
        done(outcome.passed, outcome.log);
      } else if (check.kind === 'readme') {
        const outcome = checkReadme(readme?.text ?? null, job.project.readmeSections);
        done(outcome.passed, outcome.log);
      } else if (check.kind === 'results') {
        done(results.passed, results.log);
      } else {
        // Requirements install once, wheels only, before the network is cut for the run.
        if (deps === undefined) {
          sandboxed = true;
          try {
            deps = await installRequirements(repo, dir, hostDir, options, docker);
          } catch (error) {
            installError = (error as Error).message;
            deps = null;
          }
        }
        if (installError) {
          done(
            false,
            `Could not install requirements.txt (wheels only, no source builds).\n${installError}`,
          );
          continue;
        }
        const out = path.join(dir, `out-${check.id}`);
        await mkdir(out, { recursive: true });
        await chmod(out, 0o777);
        const name = `fp-job-${job.submissionId.slice(0, 12)}-${check.id}`.slice(0, 60);
        const timeoutSec = check.timeoutSec ?? DEFAULT_RUN_TIMEOUT_S;
        sandboxed = true;
        const result = await exec(
          docker,
          sandboxArgs({
            name,
            repo: path.join(hostDir, 'repo'),
            out: path.join(hostDir, `out-${check.id}`),
            deps: deps ? path.join(hostDir, 'deps') : null,
            image: options.image,
            cmd: check.cmd!,
          }),
          {
            timeoutMs: timeoutSec * 1000,
            onTimeout: () => exec(docker, ['kill', name], { timeoutMs: 20_000 }),
          },
        );
        const expect = check.expect ?? { exitCode: 0, stdoutIncludes: [] };
        const missing = (expect.stdoutIncludes ?? []).filter(
          (marker) => !result.stdout.includes(marker),
        );
        const passed =
          !result.timedOut && result.code === (expect.exitCode ?? 0) && missing.length === 0;
        const verdict = result.timedOut
          ? `Timed out after ${timeoutSec} s; the container was killed.`
          : [
              `exit code ${result.code}${result.code === (expect.exitCode ?? 0) ? '' : `, expected ${expect.exitCode ?? 0}`}`,
              ...missing.map((marker) => `stdout never printed "${marker}"`),
            ].join('\n');
        done(passed, `$ ${check.cmd}\n${result.output.trimEnd()}\n\n${verdict}`);
      }
    }

    return {
      commitSha,
      checks,
      artifacts: {
        fileTree: files.slice(0, 2000),
        readme: readme ? readme.text.slice(0, 100_000) : null,
        results: results.results ?? null,
        sources: pickSources(repo, files, readme?.text ?? null),
      },
      error: null,
    };
  } catch (error) {
    return {
      commitSha: job.commitSha,
      checks: [],
      artifacts: empty,
      error: `The runner failed: ${(error as Error).message}`,
    };
  } finally {
    if (sandboxed) await releaseSandboxFiles(hostDir, options, docker);
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Sandbox containers write as uid 1000. When the runner is another non-root user (CI, or a
 * runner started outside its root container on Linux), it cannot delete what they left in out-*
 * and deps, e.g. a charts/ folder made with mode 755. Only the owner can loosen those modes, so
 * one more container, as that user and with no network, opens them up before the folder is removed.
 */
async function releaseSandboxFiles(
  hostDir: string,
  options: JobOptions,
  docker: string,
): Promise<void> {
  await exec(
    docker,
    [
      'run',
      '--rm',
      '--network',
      'none',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--user',
      '1000:1000',
      '-v',
      `${hostDir}:/job:rw`,
      options.image,
      // Files the runner owns stay as they are; chmod reports those, and that is expected.
      'sh',
      '-c',
      'chmod -R a+rwX /job 2>/dev/null; true',
    ],
    { timeoutMs: 60_000 },
  ).catch(() => undefined);
}

/** pip installs requirements.txt into a deps folder from wheels only; null when there are none. */
async function installRequirements(
  repo: string,
  dir: string,
  hostDir: string,
  options: JobOptions,
  docker: string,
): Promise<string | null> {
  const file = path.join(repo, 'requirements.txt');
  if (!existsSync(file)) return null;
  const wanted = (await readFile(file, 'utf8'))
    .split('\n')
    .map((line) => line.replace(/#.*/, '').trim())
    .filter(Boolean);
  if (!wanted.length) return null;
  const deps = path.join(dir, 'deps');
  await mkdir(deps, { recursive: true });
  await chmod(deps, 0o777);
  const result = await exec(
    docker,
    [
      'run',
      '--rm',
      '--cpus',
      '2',
      '--memory',
      '4g',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--user',
      '1000:1000',
      '-e',
      'HOME=/tmp',
      '-v',
      `${path.join(hostDir, 'repo', 'requirements.txt')}:/req.txt:ro`,
      '-v',
      `${path.join(hostDir, 'deps')}:/deps:rw`,
      options.image,
      'pip',
      'install',
      '--no-cache-dir',
      '--only-binary=:all:',
      '--target',
      '/deps',
      '-r',
      '/req.txt',
    ],
    { timeoutMs: INSTALL_TIMEOUT_MS },
  );
  if (result.code !== 0)
    throw new Error(`installing requirements failed: ${result.output.trim().slice(-800)}`);
  return deps;
}
