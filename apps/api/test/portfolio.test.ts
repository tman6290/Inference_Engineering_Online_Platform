import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  caseStudySchema,
  homeResponseSchema,
  portfolioResponseSchema,
  PRIVATE_CRITIQUE_FIELDS,
  publicProfileSchema,
  type CritiqueOutput,
} from '@forward-pass/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ingestBook } from '../src/book/ingest';
import { loadContent, type LoadedContent } from '../src/content/load';
import { syncProjects } from '../src/projects/sync';
import { fixtureFetcher, INDEX_URL } from './fixtures/book';
import { digest11, project01, writeContent } from './fixtures/content';
import {
  INVITE_2,
  noTestDatabase,
  registeredAgent,
  resetDatabase,
  testApp,
  testDb,
} from './helpers';

const REPO = 'https://github.com/tofa/toy-batching';
/** A 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const README =
  '# Toy batching\n\n## Decision\n\nServe at batch 8: throughput rose 6× for 9 ms of P95. More below.\n';

let dir: string;
let content: LoadedContent;

const critique = (total: number, portfolioReady: boolean): CritiqueOutput => ({
  total,
  headline: 'Solid batching study',
  dimensions: [
    { dimension: 'Measurement', score: 40, max: 50, reasoning: 'PRIVATE reasoning text' },
    { dimension: 'Write-up', score: total - 40, max: 50, reasoning: 'PRIVATE reasoning text' },
  ],
  right: ['Warm-up runs are excluded from the percentiles.'],
  wrong: [{ text: 'PRIVATE wrong item', evidence: { kind: 'check', ref: 'dry-run' } }],
  workOn: [{ step: 'PRIVATE work-on step', section: '1.1' }],
  inlineComments: [{ path: 'bench.py', line: 3, body: 'PRIVATE inline comment' }],
  unsupportedClaims: [{ claim: 'PRIVATE claim', why: 'not in results.json' }],
  portfolioReady,
  skillsDemonstrated: ['batching', 'percentiles'],
});

/** A graded submission straight in the database, as if the runner and critique had finished. */
async function graded(email: string, version: number, total: number, ready: boolean) {
  const user = await testDb().user.findUniqueOrThrow({ where: { email } });
  const row = await testDb().submission.create({
    data: {
      userId: user.id,
      projectSlug: project01.slug,
      version,
      repoUrl: REPO,
      commitSha: String(version).repeat(40),
      noteToGrader: 'PRIVATE note',
      status: 'graded',
      gradedAt: new Date('2026-11-03T10:00:00Z'),
      artifacts: { fileTree: ['README.md'], readme: README, results: null, sources: [] },
      critique: {
        create: {
          json: critique(total, ready),
          model: 'test-model',
          costUsd: 0.01,
          inputTokens: 1,
          outputTokens: 1,
        },
      },
    },
  });
  await testDb().submissionFile.create({
    data: {
      submissionId: row.id,
      name: 'throughput.png',
      mime: 'image/png',
      size: PNG.length,
      blob: { create: { data: new Uint8Array(PNG) } },
    },
  });
  return row;
}

/** Every key at any depth. */
function allKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => allKeys(item, keys));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      allKeys(child, keys);
    }
  }
  return keys;
}

/** Collects a binary response body into a Buffer (supertest only buffers text by default). */
const binary: Parameters<ReturnType<ReturnType<typeof request>['get']>['parse']>[0] = (
  res,
  done,
) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

describe.skipIf(noTestDatabase)('portfolio and the public layer', () => {
  beforeEach(async () => {
    await resetDatabase();
    dir = await mkdtemp(path.join(tmpdir(), 'fp-portfolio-'));
    await ingestBook({
      db: testDb(),
      fetcher: fixtureFetcher(),
      indexUrl: INDEX_URL,
      bookDir: path.join(dir, 'book'),
      figuresDir: path.join(dir, 'figures'),
      outlinePath: path.join(dir, 'outline.json'),
    });
    content = loadContent(writeContent(dir, digest11, { project: project01 }));
    await syncProjects(testDb(), content);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const app = () =>
    testApp({
      content,
      figuresDir: path.join(dir, 'figures'),
      uploadsDir: path.join(dir, 'uploads'),
    });

  async function pod() {
    const tofa = await registeredAgent(app());
    const friend = await registeredAgent(app(), {
      email: 'friend@example.com',
      displayName: 'Friend',
      inviteCode: INVITE_2,
    });
    return { tofa, friend };
  }

  it('keeps the page off by default and needs a free username to go live', async () => {
    const { tofa, friend } = await pod();
    expect(portfolioResponseSchema.parse((await tofa.get('/api/portfolio')).body)).toEqual({
      username: null,
      pageLive: false,
      shipped: [],
    });

    const noName = await tofa
      .put('/api/portfolio/settings')
      .send({ username: null, pageLive: true });
    expect(noName.status).toBe(400);
    expect(
      (await tofa.put('/api/portfolio/settings').send({ username: 'x y', pageLive: false })).status,
    ).toBe(400);

    const live = await tofa
      .put('/api/portfolio/settings')
      .send({ username: 'Tofa', pageLive: true });
    expect(live.status).toBe(200);
    expect(live.body).toMatchObject({ username: 'tofa', pageLive: true });

    const taken = await friend
      .put('/api/portfolio/settings')
      .send({ username: 'tofa', pageLive: false });
    expect(taken.status).toBe(409);
    expect(taken.body.error).toBe('username_taken');
  });

  it('serves /p/:username only while the page is live', async () => {
    const { tofa } = await pod();
    const anonymous = request(app());
    await tofa.put('/api/portfolio/settings').send({ username: 'tofa', pageLive: false });
    expect((await anonymous.get('/api/public/tofa')).status).toBe(404);

    await tofa.put('/api/portfolio/settings').send({ username: 'tofa', pageLive: true });
    const on = await anonymous.get('/api/public/tofa');
    expect(on.status).toBe(200);
    expect(publicProfileSchema.parse(on.body)).toMatchObject({
      username: 'tofa',
      displayName: 'Tofa',
      chaptersComplete: 0,
      projects: [],
    });
    expect((await anonymous.get('/api/public/TOFA')).status).toBe(200);
    expect((await anonymous.get('/api/public/nobody')).status).toBe(404);

    await tofa.put('/api/portfolio/settings').send({ username: 'tofa', pageLive: false });
    expect((await anonymous.get('/api/public/tofa')).status).toBe(404);
  });

  it('makes only a portfolio-ready version public, one per project, and only its owner can', async () => {
    const { tofa, friend } = await pod();
    const weak = await graded('tofa@example.com', 1, 70, false);
    const strong = await graded('tofa@example.com', 2, 86, true);
    const older = await graded('tofa@example.com', 3, 82, true);

    const refused = await tofa
      .post(`/api/submissions/${weak.id}/visibility`)
      .send({ public: true });
    expect(refused.status).toBe(409);
    expect(
      (await friend.post(`/api/submissions/${strong.id}/visibility`).send({ public: true })).status,
    ).toBe(404);

    await tofa.post(`/api/submissions/${older.id}/visibility`).send({ public: true });
    const after = portfolioResponseSchema.parse(
      (await tofa.post(`/api/submissions/${strong.id}/visibility`).send({ public: true })).body,
    );
    expect(after.shipped).toEqual([
      expect.objectContaining({ slug: project01.slug, version: 3, total: 82, publicVersion: 2 }),
    ]);
    const rows = await testDb().submission.findMany({ orderBy: { version: 'asc' } });
    expect(rows.map((row) => row.public)).toEqual([false, true, false]);

    const project = (await tofa.get(`/api/projects/${project01.slug}`)).body;
    expect(project.submissions.map((s: { public: boolean }) => s.public)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('renders a public case study without any private critique field', async () => {
    const { tofa } = await pod();
    const row = await graded('tofa@example.com', 1, 86, true);
    await tofa.put('/api/portfolio/settings').send({ username: 'tofa', pageLive: true });
    const anonymous = request(app());
    expect((await anonymous.get(`/api/public/tofa/${project01.slug}`)).status).toBe(404);

    await tofa.post(`/api/submissions/${row.id}/visibility`).send({ public: true });
    const res = await anonymous.get(`/api/public/tofa/${project01.slug}`);
    expect(res.status).toBe(200);
    const study = caseStudySchema.parse(res.body);
    expect(study).toMatchObject({
      title: project01.title,
      decision: 'Serve at batch 8: throughput rose 6× for 9 ms of P95.',
      total: 86,
      dimensions: [
        { dimension: 'Measurement', score: 40, max: 50 },
        { dimension: 'Write-up', score: 46, max: 50 },
      ],
      right: ['Warm-up runs are excluded from the percentiles.'],
      skillsDemonstrated: ['batching', 'percentiles'],
      repoUrl: REPO,
      charts: [
        { name: 'throughput.png', url: `/api/public/tofa/${project01.slug}/charts/throughput.png` },
      ],
    });
    const leaked = PRIVATE_CRITIQUE_FIELDS.filter((field) => allKeys(res.body).has(field));
    expect(leaked).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain('PRIVATE');

    const chart = await anonymous.get(study.charts[0]!.url);
    expect(chart.status).toBe(200);
    expect(chart.headers['content-type']).toBe('image/png');
    expect(
      (await anonymous.get(`/api/public/tofa/${project01.slug}/charts/other.png`)).status,
    ).toBe(404);

    const profile = publicProfileSchema.parse((await anonymous.get('/api/public/tofa')).body);
    expect(profile.projects).toEqual([
      expect.objectContaining({ slug: project01.slug, total: 86, decision: study.decision }),
    ]);
    expect(profile.skills).toEqual(['batching', 'percentiles']);
    expect(JSON.stringify(profile)).not.toContain('PRIVATE');

    // Turning the page off hides the case study and its charts too.
    await tofa.put('/api/portfolio/settings').send({ username: 'tofa', pageLive: false });
    expect((await anonymous.get(`/api/public/tofa/${project01.slug}`)).status).toBe(404);
    expect((await anonymous.get(study.charts[0]!.url)).status).toBe(404);
  });

  it('counts projects shipped on Home and in the standings', async () => {
    const { tofa } = await pod();
    await graded('tofa@example.com', 1, 70, false);
    let home = homeResponseSchema.parse((await tofa.get('/api/home')).body);
    expect(home.tiles.projectsShipped).toBe(0);

    await graded('tofa@example.com', 2, 86, true);
    home = homeResponseSchema.parse((await tofa.get('/api/home')).body);
    expect(home.tiles.projectsShipped).toBe(1);
    expect(home.standings.map((row) => [row.displayName, row.projectsShipped])).toEqual([
      ['Tofa', 1],
      ['Friend', 0],
    ]);
  });

  it('downloads the case study as a PDF once a version is portfolio-ready', async () => {
    const { tofa, friend } = await pod();
    const weak = await graded('tofa@example.com', 1, 70, false);
    const strong = await graded('tofa@example.com', 2, 86, true);

    expect((await tofa.get(`/api/submissions/${weak.id}/case-study.pdf`)).status).toBe(409);
    expect((await friend.get(`/api/submissions/${strong.id}/case-study.pdf`)).status).toBe(404);

    const res = await tofa
      .get(`/api/submissions/${strong.id}/case-study.pdf`)
      .buffer(true)
      .parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain(`${project01.slug}-v2.pdf`);
    const body = res.body as Buffer;
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(body.length).toBeGreaterThan(2000);
  }, 60_000);
});
