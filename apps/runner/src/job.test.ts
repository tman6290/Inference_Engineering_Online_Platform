import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RunnerJob } from '@forward-pass/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkFiles, checkReadme, globToRegExp, pickSources } from './checks';
import { runJob, sandboxArgs } from './job';

const IMAGE = 'forward-pass-sandbox:py312';
const repoRoot = path.resolve(import.meta.dirname, '../../..');

describe('in-process checks', () => {
  it('matches globs the way requiredFiles are written', () => {
    expect(globToRegExp('charts/*.png').test('charts/p95.png')).toBe(true);
    expect(globToRegExp('charts/*.png').test('charts/sub/p95.png')).toBe(false);
    expect(globToRegExp('**/*.py').test('bench/run.py')).toBe(true);
    expect(globToRegExp('**/*.py').test('run.py')).toBe(true);
    expect(globToRegExp('README.md').test('README.mdx')).toBe(false);
  });

  it('reports each required file as found or missing', () => {
    const outcome = checkFiles(
      ['README.md', 'bench/run.py'],
      ['README.md', 'bench/*.py', 'results.json'],
    );
    expect(outcome.passed).toBe(false);
    expect(outcome.log).toContain('missing results.json');
    expect(outcome.log).toContain('ok      bench/*.py (1 match: bench/run.py)');
  });

  it('finds README headings regardless of case, level and numbering', () => {
    const readme = '# Spec bench\n\n## 1. Decision\n\nUse EAGLE.\n\n### results:\n';
    expect(checkReadme(readme, ['Decision', 'Results']).passed).toBe(true);
    expect(checkReadme(readme, ['Method']).log).toBe('missing Method');
    expect(checkReadme(null, ['Decision']).passed).toBe(false);
  });

  it('picks entry points and README-named files first for the critique', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fp-sources-'));
    mkdirSync(path.join(dir, 'bench'));
    writeFileSync(path.join(dir, 'Makefile'), 'check:\n\tpython -m bench --dry-run\n');
    writeFileSync(path.join(dir, 'bench', 'big.py'), 'x = 1\n'.repeat(900));
    writeFileSync(path.join(dir, 'bench', 'tiny.py'), 'y = 2\n');
    const files = ['Makefile', 'bench/big.py', 'bench/tiny.py'];
    const picked = pickSources(dir, files, 'See bench/tiny.py for the timer.');
    expect(picked.map((file) => file.path)).toEqual(['Makefile', 'bench/tiny.py', 'bench/big.py']);
    expect(picked[2]!.content).toMatch(/cut at 400 of 901 lines$/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('runs learner code with no network, capped resources and a read-only repo', () => {
    const args = sandboxArgs({
      name: 'x',
      repo: '/jobs/1/repo',
      out: '/jobs/1/out',
      deps: null,
      image: IMAGE,
      cmd: 'make check',
    });
    const flag = (name: string) => args[args.indexOf(name) + 1];
    expect(flag('--network')).toBe('none');
    expect(flag('--cpus')).toBe('2');
    expect(flag('--memory')).toBe('4g');
    expect(args).toContain('--read-only');
    expect(args).toContain('/jobs/1/repo:/work:ro');
    expect(args).toContain('/jobs/1/out:/out:rw');
    expect(args.slice(-3)).toEqual(['sh', '-c', 'make check']);
  });
});

function dockerReady(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
}

const noDocker = !dockerReady();

/** Commits a folder into a fresh git repo and returns its file:// URL. */
function gitRepo(source: (dir: string) => void): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'fp-repo-'));
  source(dir);
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: dir,
      stdio: 'ignore',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@t',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t',
      },
    });
  git('init', '--quiet');
  git('add', '-A');
  git('commit', '--quiet', '-m', 'fixture');
  return pathToFileURL(dir).href;
}

const job = (
  repoUrl: string,
  checks: RunnerJob['project']['checks'],
  extra: Partial<RunnerJob['project']> = {},
): RunnerJob => ({
  submissionId: `test-${Math.random().toString(36).slice(2, 10)}`,
  repoUrl,
  commitSha: null,
  project: {
    slug: '05-speculation-benchmark',
    requiredFiles: [],
    readmeSections: [],
    resultsSchema: null,
    checks,
    ...extra,
  },
});

describe.skipIf(noDocker)('sandbox', () => {
  let jobsDir: string;
  const options = () => ({ jobsDir, image: IMAGE, allowLocalRepos: true });

  beforeAll(() => {
    execFileSync('docker', ['build', '-q', '-t', IMAGE, path.join(repoRoot, 'docker', 'sandbox')], {
      stdio: 'ignore',
      timeout: 600_000,
    });
    jobsDir = mkdtempSync(path.join(tmpdir(), 'fp-jobs-'));
  }, 600_000);
  afterAll(() => rmSync(jobsDir, { recursive: true, force: true }));

  const run = (cmd: string, timeoutSec = 60) => ({
    id: 'run',
    kind: 'run' as const,
    label: 'run',
    cmd,
    timeoutSec,
  });

  it('has no network, runs as an unprivileged user and cannot write the repo', async () => {
    const url = gitRepo((dir) =>
      writeFileSync(
        path.join(dir, 'probe.py'),
        [
          'import os, socket, sys',
          'try:',
          '    socket.create_connection(("1.1.1.1", 53), timeout=3); print("network: yes")',
          'except OSError: print("network: no")',
          'print("uid:", os.getuid())',
          'try:',
          '    open("/work/x", "w"); print("repo: writable")',
          'except OSError: print("repo: read-only")',
          'open(os.environ["OUT_DIR"] + "/ok", "w").write("1"); print("out: writable")',
        ].join('\n'),
      ),
    );
    const report = await runJob(job(url, [run('python probe.py')]), options());
    expect(report.error).toBeNull();
    const log = report.checks[0]!.log;
    expect(log).toContain('network: no');
    expect(log).toContain('uid: 1000');
    expect(log).toContain('repo: read-only');
    expect(log).toContain('out: writable');
    expect(report.checks[0]!.passed).toBe(true);
  }, 120_000);

  it('kills a run that passes its timeout and cleans up the job folder', async () => {
    const url = gitRepo((dir) => writeFileSync(path.join(dir, 'README.md'), '# x\n'));
    const spec = job(url, [run('sleep 60', 10)]);
    const report = await runJob(spec, options());
    expect(report.checks[0]).toMatchObject({ passed: false });
    expect(report.checks[0]!.log).toContain('Timed out after 10 s');
    expect(existsSync(path.join(jobsDir, spec.submissionId))).toBe(false);
  }, 120_000);

  it('passes the spec-bench-sample fixture: files, README, results and make check', async () => {
    const fixture = path.join(repoRoot, 'tests', 'fixtures', 'spec-bench-sample');
    const specFile = path.join(
      repoRoot,
      'content',
      'projects',
      '05-speculation-benchmark',
      'project.json',
    );
    expect(existsSync(fixture) && existsSync(specFile)).toBe(true);
    const { readFileSync } = await import('node:fs');
    const spec = JSON.parse(readFileSync(specFile, 'utf8'));
    const url = gitRepo((dir) => cpSync(fixture, dir, { recursive: true }));
    const sample = job(url, spec.checks, {
      requiredFiles: spec.requiredFiles,
      readmeSections: spec.readmeSections,
      resultsSchema: spec.resultsSchema,
    });
    const report = await runJob(sample, options());
    expect(report.error).toBeNull();
    for (const check of report.checks)
      expect([check.checkId, check.passed, check.log]).toEqual([check.checkId, true, check.log]);
    expect(report.artifacts.readme).not.toBeNull();
    expect(report.artifacts.sources.length).toBeGreaterThan(0);
    // make check writes charts/ as the sandbox user; the job folder must still be removable.
    expect(existsSync(path.join(jobsDir, sample.submissionId))).toBe(false);
  }, 600_000);

  it('reports a clone failure as an error, not a crash', async () => {
    const report = await runJob(
      job(pathToFileURL(path.join(tmpdir(), 'no-such-repo-xyz')).href, [run('true')]),
      options(),
    );
    expect(report.error).toMatch(/^Could not clone the repo/);
    expect(report.checks).toEqual([]);
  }, 60_000);
});
