import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  projectDetailSchema,
  projectsResponseSchema,
  runnerJobSchema,
  submissionDetailSchema,
  submissionSummarySchema,
  type RunnerReport,
} from '@forward-pass/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ingestBook } from '../src/book/ingest';
import { loadContent, type LoadedContent } from '../src/content/load';
import { syncProjects } from '../src/projects/sync';
import { fixtureFetcher, INDEX_URL } from './fixtures/book';
import { bank11, digest11, project01, writeContent } from './fixtures/content';
import {
  INVITE_2,
  noTestDatabase,
  registeredAgent,
  resetDatabase,
  testApp,
  testDb,
} from './helpers';

type Agent = ReturnType<typeof request.agent>;
const TOKEN = 'runner-token-for-tests';
const REPO = 'https://github.com/tofa/toy-batching';

let dir: string;
let content: LoadedContent;

/** A passed 1.1 checkpoint, which opens the toy project. */
async function pass11(email: string) {
  const user = await testDb().user.findUniqueOrThrow({ where: { email } });
  await testDb().attempt.create({
    data: {
      userId: user.id,
      sectionNumber: '1.1',
      seed: 's',
      questionIds: [],
      completedAt: new Date(),
      firstTryAccepted: 9,
      passed: true,
    },
  });
}

const report = (overrides: Partial<RunnerReport> = {}): RunnerReport => ({
  commitSha: 'a'.repeat(40),
  checks: [
    { checkId: 'files', kind: 'files', passed: true, log: 'all present', durationMs: 3 },
    { checkId: 'dry-run', kind: 'run', passed: false, log: 'exit 2', durationMs: 900 },
  ],
  artifacts: { fileTree: ['README.md'], readme: '# Decision', results: { runs: [] }, sources: [] },
  error: null,
  ...overrides,
});

describe.skipIf(noTestDatabase)('projects and submissions', () => {
  beforeEach(async () => {
    await resetDatabase();
    dir = await mkdtemp(path.join(tmpdir(), 'fp-projects-'));
    await ingestBook({
      db: testDb(),
      fetcher: fixtureFetcher(),
      indexUrl: INDEX_URL,
      bookDir: path.join(dir, 'book'),
      figuresDir: path.join(dir, 'figures'),
      outlinePath: path.join(dir, 'outline.json'),
    });
    content = loadContent(writeContent(dir, digest11, { bank: bank11, project: project01 }));
    await syncProjects(testDb(), content);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const app = (critique?: (id: string) => Promise<void>) =>
    testApp({
      content,
      figuresDir: path.join(dir, 'figures'),
      uploadsDir: path.join(dir, 'uploads'),
      runnerToken: TOKEN,
      critique,
    });

  async function pod(critique?: (id: string) => Promise<void>) {
    const tofa = await registeredAgent(app(critique));
    const friend = await registeredAgent(app(critique), {
      email: 'friend@example.com',
      displayName: 'Friend',
      inviteCode: INVITE_2,
    });
    return { tofa, friend };
  }

  const submit = (agent: Agent, body: object = { repoUrl: REPO }) =>
    agent.post(`/api/projects/${project01.slug}/submissions`).send(body);

  it('syncs specs into project rows, updating in place', async () => {
    const edited = loadContent(
      writeContent(path.join(dir, 'again'), digest11, {
        project: { ...project01, title: 'Renamed' },
      }),
    );
    await syncProjects(testDb(), edited);
    const rows = await testDb().project.findMany();
    expect(rows.map((row) => [row.slug, row.title])).toEqual([[project01.slug, 'Renamed']]);
  });

  it('keeps a project locked until its checkpoint passes, then counts versions', async () => {
    const { tofa } = await pod();
    const list = projectsResponseSchema.parse((await tofa.get('/api/projects')).body);
    expect(list.projects[0]).toMatchObject({ slug: project01.slug, unlocked: false, mine: null });
    expect((await submit(tofa)).status).toBe(403);

    await pass11('tofa@example.com');
    expect((await submit(tofa, { repoUrl: 'http://github.com/tofa/x' })).status).toBe(400);
    expect((await submit(tofa, { repoUrl: 'https://gitlab.com/tofa/x' })).status).toBe(400);
    const first = submissionSummarySchema.parse((await submit(tofa)).body);
    expect(first).toMatchObject({ version: 1, status: 'queued', repoUrl: REPO });
    const second = submissionSummarySchema.parse(
      (
        await submit(tofa, {
          repoUrl: `${REPO}.git`,
          commitSha: 'b'.repeat(40),
          noteToGrader: 'Look at P95.',
        })
      ).body,
    );
    expect(second.version).toBe(2);
    expect(second.commitSha).toBe('b'.repeat(40));

    const detail = projectDetailSchema.parse(
      (await tofa.get(`/api/projects/${project01.slug}`)).body,
    );
    expect(detail.submissions.map((s) => s.version)).toEqual([2, 1]);
    expect(detail.critiquesLeftThisHour).toBe(1);
    expect(detail.checks.map((check) => check.id)).toEqual([
      'files',
      'readme',
      'results',
      'dry-run',
    ]);

    // Three an hour.
    expect((await submit(tofa)).status).toBe(201);
    expect((await submit(tofa)).status).toBe(429);
  });

  it('shows the partner only the version and score', async () => {
    const { tofa, friend } = await pod();
    await pass11('tofa@example.com');
    const mine = submissionSummarySchema.parse(
      (await submit(tofa, { repoUrl: REPO, noteToGrader: 'secret note' })).body,
    );

    expect((await friend.get(`/api/submissions/${mine.id}`)).status).toBe(404);
    expect((await friend.get(`/api/submissions/${mine.id}/files/a.png`)).status).toBe(404);
    const theirView = (await friend.get(`/api/projects/${project01.slug}`)).body;
    const parsed = projectDetailSchema.parse(theirView);
    expect(parsed.partner).toEqual({ displayName: 'Tofa', version: 1, total: null });
    expect(parsed.submissions).toEqual([]);
    const text =
      JSON.stringify(theirView) + JSON.stringify((await friend.get('/api/projects')).body);
    expect(text).not.toContain(REPO);
    expect(text).not.toContain('secret note');
  });

  it('takes PNG, PDF, notebook and zip uploads and nothing else', async () => {
    const { tofa } = await pod();
    await pass11('tofa@example.com');
    const { id } = submissionSummarySchema.parse((await submit(tofa)).body);
    const put = (name: string, type: string, body = Buffer.from('bytes')) =>
      tofa.put(`/api/submissions/${id}/files/${name}`).set('content-type', type).send(body);

    expect((await put('p95.png', 'image/png')).status).toBe(204);
    expect((await put('notes.pdf', 'application/pdf')).status).toBe(204);
    expect((await put('run.sh', 'text/x-sh')).status).toBe(415);
    expect((await put('chart.pdf', 'image/png')).status).toBe(400);
    const detail = submissionDetailSchema.parse((await tofa.get(`/api/submissions/${id}`)).body);
    expect(detail.files.map((file) => file.name)).toEqual(['p95.png', 'notes.pdf']);
    const download = await tofa.get(`/api/submissions/${id}/files/p95.png`);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toBe('image/png');
  });

  it('hands jobs to the runner once and stores what it reports', async () => {
    const critique = vi.fn(async () => undefined);
    const { tofa } = await pod(critique);
    await pass11('tofa@example.com');
    const { id } = submissionSummarySchema.parse((await submit(tofa)).body);
    const runner = request(app(critique));

    expect((await runner.post('/api/internal/jobs/claim')).status).toBe(401);
    const claimed = await runner
      .post('/api/internal/jobs/claim')
      .set('authorization', `Bearer ${TOKEN}`);
    const job = runnerJobSchema.parse(claimed.body);
    expect(job).toMatchObject({ submissionId: id, repoUrl: REPO, commitSha: null });
    expect(job.project.checks).toHaveLength(4);
    // Claimed once: nothing else waits.
    expect(
      (await runner.post('/api/internal/jobs/claim').set('authorization', `Bearer ${TOKEN}`))
        .status,
    ).toBe(204);

    const sent = await runner
      .post(`/api/internal/submissions/${id}/report`)
      .set('authorization', `Bearer ${TOKEN}`)
      .send(report());
    expect(sent.status).toBe(204);
    await vi.waitFor(() => expect(critique).toHaveBeenCalledWith(id));

    const detail = submissionDetailSchema.parse((await tofa.get(`/api/submissions/${id}`)).body);
    expect(detail).toMatchObject({ status: 'critiquing', commitSha: 'a'.repeat(40) });
    expect(detail.checks.map((check) => [check.checkId, check.passed, check.label])).toEqual([
      ['files', true, 'Required files exist'],
      ['dry-run', false, 'make check passes'],
    ]);
    // A second report for the same job is refused.
    const again = await runner
      .post(`/api/internal/submissions/${id}/report`)
      .set('authorization', `Bearer ${TOKEN}`)
      .send(report());
    expect(again.status).toBe(409);
  });

  it('fails a submission when the runner could not check it, or when critiques are off', async () => {
    const { tofa } = await pod();
    await pass11('tofa@example.com');
    const auth = { authorization: `Bearer ${TOKEN}` };
    const runner = request(app());

    const broken = submissionSummarySchema.parse((await submit(tofa)).body);
    await runner.post('/api/internal/jobs/claim').set(auth);
    await runner
      .post(`/api/internal/submissions/${broken.id}/report`)
      .set(auth)
      .send(report({ checks: [], error: 'Could not clone the repo: not found.' }));
    expect((await tofa.get(`/api/submissions/${broken.id}`)).body).toMatchObject({
      status: 'failed',
      failure: 'Could not clone the repo: not found.',
    });

    const unconfigured = submissionSummarySchema.parse((await submit(tofa)).body);
    await runner.post('/api/internal/jobs/claim').set(auth);
    await runner
      .post(`/api/internal/submissions/${unconfigured.id}/report`)
      .set(auth)
      .send(report());
    await vi.waitFor(async () =>
      expect((await tofa.get(`/api/submissions/${unconfigured.id}`)).body.failure).toMatch(
        /critiques are not configured/,
      ),
    );
  });
});
