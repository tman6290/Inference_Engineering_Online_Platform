import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  bookResponseSchema,
  glossaryResponseSchema,
  outlineSchema,
  sectionResponseSchema,
} from '@forward-pass/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ingestBook } from '../src/book/ingest';
import { fixtureFetcher, INDEX_URL } from './fixtures/book';
import { noTestDatabase, registeredAgent, resetDatabase, testApp, testDb } from './helpers';

let dir: string;
const dirs = () => ({
  bookDir: path.join(dir, 'book'),
  figuresDir: path.join(dir, 'figures'),
  outlinePath: path.join(dir, 'outline.json'),
});

async function ingest(options: { force?: boolean } = {}) {
  const fetcher = fixtureFetcher();
  const report = await ingestBook({
    db: testDb(),
    fetcher,
    indexUrl: INDEX_URL,
    ...dirs(),
    ...options,
  });
  return { report, fetcher };
}

describe.skipIf(noTestDatabase)('book ingest', () => {
  beforeEach(async () => {
    await resetDatabase();
    dir = await mkdtemp(path.join(tmpdir(), 'fp-book-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('loads chapters, sections, figures and the glossary', async () => {
    const { report } = await ingest();

    expect(report.counts).toEqual({
      chapters: 2,
      sections: 2,
      subsections: 3,
      figures: 4,
      glossaryTerms: 3,
    });
    expect(report.figures).toEqual({ downloaded: 4, cached: 0, unnumberedImages: 1 });
    expect(await testDb().bookPage.count()).toBe(2);

    const figures = await testDb().figure.findMany({ orderBy: { number: 'asc' } });
    expect(
      figures.map((figure) => [
        figure.number,
        figure.fileName,
        figure.sectionNumber,
        figure.subsectionNumber,
      ]),
    ).toEqual([
      ['0.1', '0.1.png', null, null],
      ['1.1', '1.1.png', '1.1', '1.1.1'],
      ['1.2', '1.2.jpg', '1.2', '1.2.1'],
      ['P.1', 'P.1.png', null, null],
    ]);
    const preface = figures.find((figure) => figure.number === 'P.1');
    expect(preface).toMatchObject({ chapterNumber: null, pageSlug: 'preface' });
    expect((await readdir(dirs().figuresDir)).sort()).toEqual([
      '0.1.png',
      '1.1.png',
      '1.2.jpg',
      'P.1.png',
    ]);

    const kv = await testDb().glossaryTerm.findUnique({ where: { slug: 'kv-cache' } });
    expect(kv?.sectionNumber).toBe('1.1');
  });

  it('saves pages exactly as received and writes an outline without body text', async () => {
    await ingest();
    const saved = await readFile(
      path.join(dirs().bookDir, '01-serving', '1.1-batching.md'),
      'utf8',
    );
    expect(saved.startsWith('# 1.1 Batching')).toBe(true);

    const outline = outlineSchema.parse(JSON.parse(await readFile(dirs().outlinePath, 'utf8')));
    expect(outline.chapters.map((chapter) => chapter.number)).toEqual([0, 1]);
    expect(outline.chapters[1]!.sections[0]).toEqual({
      number: '1.1',
      slug: 'batching',
      title: 'Batching',
      subsections: [
        { number: '1.1.1', title: 'Static Batches' },
        { number: '1.1.2', title: 'Continuous Batching' },
      ],
    });
    expect(JSON.stringify(outline)).not.toMatch(/groups several requests/);
    expect(existsSync(path.join(dirs().bookDir, 'manifest.json'))).toBe(true);
  });

  it('changes nothing when run a second time', async () => {
    await ingest();
    const { report, fetcher } = await ingest();

    expect(fetcher.calls).toEqual([]);
    expect(report.files).toEqual({ fetched: 0, cached: 7 });
    expect(report.figures.downloaded).toBe(0);
    expect(report.outlineChanged).toBe(false);
    expect(report.manifestChanged).toBe(false);
    for (const table of Object.values(report.database)) {
      expect(table).toMatchObject({ created: 0, updated: 0, deleted: 0 });
    }
  });

  it('refetches with force but still writes nothing that is unchanged', async () => {
    await ingest();
    const { report, fetcher } = await ingest({ force: true });

    expect(fetcher.calls.length).toBe(11);
    for (const table of Object.values(report.database)) {
      expect(table).toMatchObject({ created: 0, updated: 0, deleted: 0 });
    }
    expect(report.manifestChanged).toBe(false);
  });
});

describe.skipIf(noTestDatabase)('book API', () => {
  beforeEach(async () => {
    await resetDatabase();
    dir = await mkdtemp(path.join(tmpdir(), 'fp-book-'));
    await ingest();
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const app = () => testApp({ figuresDir: dirs().figuresDir });

  it('requires a session for every book route', async () => {
    for (const route of [
      '/api/book',
      '/api/book/sections/1.1',
      '/api/glossary',
      '/api/figures/1.1',
    ]) {
      expect((await request(app()).get(route)).status).toBe(401);
    }
  });

  it('GET /api/book lists chapters with their sections in order', async () => {
    const agent = await registeredAgent(app());
    const body = bookResponseSchema.parse((await agent.get('/api/book')).body);

    expect(body.frontMatter.map((page) => page.slug)).toEqual(['preface']);
    expect(
      body.chapters.map((chapter) => [chapter.number, chapter.sections.map((s) => s.number)]),
    ).toEqual([
      [0, []],
      [1, ['1.1', '1.2']],
    ]);
    expect(body.chapters[1]!.sections[0]).toMatchObject({ readState: 'unread', readingMinutes: 1 });
  });

  it('GET /api/book/sections/:number returns subsections, figures and neighbours', async () => {
    const agent = await registeredAgent(app());
    const res = await agent.get('/api/book/sections/1.1');
    expect(res.status).toBe(200);
    const body = sectionResponseSchema.parse(res.body);

    expect(body.chapter).toEqual({ number: 1, slug: '01-serving', title: 'Serving' });
    expect(body.subsections.map((sub) => sub.number)).toEqual(['1.1.1', '1.1.2']);
    expect(body.figures).toEqual([
      {
        number: '1.1',
        caption: 'Four requests sharing one pass',
        url: '/api/figures/1.1',
        subsectionNumber: '1.1.1',
      },
    ]);
    expect(body.previous).toBeNull();
    expect(body.next).toEqual({ number: '1.2', title: 'Caching Results' });
  });

  it('rejects malformed section numbers and 404s unknown ones', async () => {
    const agent = await registeredAgent(app());
    expect((await agent.get('/api/book/sections/abc')).status).toBe(400);
    expect((await agent.get('/api/book/sections/9.9')).status).toBe(404);
  });

  it('GET /api/glossary filters by q, term matches first', async () => {
    const agent = await registeredAgent(app());
    const all = glossaryResponseSchema.parse((await agent.get('/api/glossary')).body);
    expect(all.terms.map((term) => term.term)).toEqual([
      'Batching',
      'KV cache',
      'Throughput (TPS)',
    ]);

    const filtered = glossaryResponseSchema.parse(
      (await agent.get('/api/glossary?q=requests')).body,
    );
    expect(filtered.terms.map((term) => term.slug)).toEqual(['batching', 'throughput-tps']);

    const byTerm = glossaryResponseSchema.parse((await agent.get('/api/glossary?q=cache')).body);
    expect(byTerm.terms[0]!.slug).toBe('kv-cache');
  });

  it('GET /api/figures/:number serves the image and nothing outside the figures folder', async () => {
    const agent = await registeredAgent(app());
    const image = await agent.get('/api/figures/1.1');
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['x-content-type-options']).toBe('nosniff');

    expect((await agent.get('/api/figures/..%2F..%2Fpackage.json')).status).toBe(400);
    expect((await agent.get('/api/figures/9.9')).status).toBe(404);
  });

  it('404s a figure whose file was never downloaded', async () => {
    const agent = await registeredAgent(testApp({ figuresDir: path.join(dir, 'missing') }));
    const res = await agent.get('/api/figures/1.1');
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/content:ingest/);
  });
});
