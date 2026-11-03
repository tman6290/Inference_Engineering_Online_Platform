import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  bookResponseSchema,
  digestResponseSchema,
  lessonResponseSchema,
  type LessonResponse,
} from '@forward-pass/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ingestBook } from '../src/book/ingest';
import { ContentError, loadContent, type LoadedContent } from '../src/content/load';
import { fixtureFetcher, INDEX_URL } from './fixtures/book';
import { digest11, writeContent } from './fixtures/content';
import {
  INVITE_2,
  noTestDatabase,
  registeredAgent,
  resetDatabase,
  testApp,
  testDb,
} from './helpers';

let dir: string;
let content: LoadedContent;

async function setup() {
  await resetDatabase();
  dir = await mkdtemp(path.join(tmpdir(), 'fp-lessons-'));
  await ingestBook({
    db: testDb(),
    fetcher: fixtureFetcher(),
    indexUrl: INDEX_URL,
    bookDir: path.join(dir, 'book'),
    figuresDir: path.join(dir, 'figures'),
    outlinePath: path.join(dir, 'outline.json'),
  });
  content = loadContent(writeContent(dir));
}

const app = () => testApp({ content, figuresDir: path.join(dir, 'figures') });
const lesson = async (
  agent: ReturnType<typeof request.agent>,
  id: string,
): Promise<LessonResponse> =>
  lessonResponseSchema.parse((await agent.get(`/api/lessons/${id}`)).body);

describe.skipIf(noTestDatabase)('lessons', () => {
  beforeEach(setup);
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('requires a session', async () => {
    for (const route of ['/api/lessons/1.1', '/api/book/sections/1.1/digest']) {
      expect((await request(app()).get(route)).status).toBe(401);
    }
  });

  it('GET /api/lessons/:id returns the book text, the public digest, terms and neighbours', async () => {
    const agent = await registeredAgent(app());
    const body = await lesson(agent, '1.1');

    expect(body).toMatchObject({
      id: '1.1',
      kind: 'section',
      number: '1.1',
      title: 'Batching',
      hasCheckpoint: false,
    });
    expect(body.subsections.map((sub) => sub.number)).toEqual(['1.1.1', '1.1.2']);
    expect(body.figures.map((figure) => figure.url)).toEqual(['/api/figures/1.1']);
    expect(body.digest?.oneLine).toMatch(/^Batching lets/);
    expect(body.terms.map((term) => term.slug)).toEqual(['batching', 'kv-cache', 'throughput-tps']);
    expect(body.chapter?.lessons.map((entry) => entry.id)).toEqual(['1.1', '1.2']);
    expect(body.previous).toEqual({ id: '0', title: 'Basics' });
    expect(body.next).toEqual({ id: '1.2', title: 'Caching Results' });
    expect(body.progress).toEqual({ readState: 'unread', maxScrollPct: 0, confidence: null });
  });

  it('never sends the check question key or explanation', async () => {
    const agent = await registeredAgent(app());
    const raw = JSON.stringify((await agent.get('/api/lessons/1.1')).body);
    for (const secret of [
      'correctIndex',
      'acceptedCopy',
      'rejectedCopy',
      digest11.checkQuestion.explanation,
    ]) {
      expect(raw).not.toContain(secret);
    }
  });

  it('serves the Preface and Chapter 0 as lessons in reading order', async () => {
    const agent = await registeredAgent(app());
    const preface = await lesson(agent, 'preface');
    expect(preface).toMatchObject({
      kind: 'page',
      chapter: null,
      previous: null,
      next: { id: '0' },
    });
    expect(preface.figures.map((figure) => figure.number)).toEqual(['P.1']);

    const zero = await lesson(agent, '0');
    expect(zero).toMatchObject({
      kind: 'chapter',
      previous: { id: 'preface' },
      next: { id: '1.1' },
    });
    expect(zero.figures.map((figure) => figure.number)).toEqual(['0.1']);
  });

  it('falls back to the book when a lesson has no digest', async () => {
    const agent = await registeredAgent(app());
    const body = await lesson(agent, '1.2');
    expect(body.digest).toBeNull();
    expect(body.intro).toMatch(/Caching keeps work/);
    expect(
      digestResponseSchema.parse((await agent.get('/api/book/sections/1.2/digest')).body),
    ).toEqual({
      digest: null,
    });
    expect(
      digestResponseSchema.parse((await agent.get('/api/book/sections/1.1/digest')).body).digest
        ?.lesson,
    ).toBe('1.1');
  });

  it('rejects malformed ids and 404s unknown lessons', async () => {
    const agent = await registeredAgent(app());
    expect((await agent.get('/api/lessons/abc')).status).toBe(400);
    expect((await agent.get('/api/lessons/9.9')).status).toBe(404);
  });

  describe('reading progress', () => {
    const event = (maxScrollPct: number) => ({
      startedAt: '2026-11-03T08:00:00.000Z',
      endedAt: '2026-11-03T08:00:30.000Z',
      maxScrollPct,
    });

    it('keeps the furthest scroll and marks the lesson read at 90%', async () => {
      const agent = await registeredAgent(app());
      const first = await agent.post('/api/lessons/1.1/reading').send(event(40));
      expect(first.body).toMatchObject({ readState: 'reading', maxScrollPct: 40 });

      await agent.post('/api/lessons/1.1/reading').send(event(20));
      expect((await lesson(agent, '1.1')).progress.maxScrollPct).toBe(40);

      const done = await agent.post('/api/lessons/1.1/reading').send(event(95));
      expect(done.body.readState).toBe('read');
      expect(await testDb().readingEvent.count()).toBe(3);

      const book = bookResponseSchema.parse((await agent.get('/api/book')).body);
      const chapter = book.chapters.find((entry) => entry.number === 1)!;
      expect(chapter.sections[0]!.readState).toBe('read');
      expect(chapter).toMatchObject({ status: 'reading', progressPct: 50 });
      expect(book.decoded).toBe(1);
    });

    it('validates the event', async () => {
      const agent = await registeredAgent(app());
      expect((await agent.post('/api/lessons/1.1/reading').send(event(140))).status).toBe(400);
      const backwards = { ...event(10), endedAt: '2026-11-03T07:00:00.000Z' };
      expect((await agent.post('/api/lessons/1.1/reading').send(backwards)).status).toBe(400);
      expect((await agent.post('/api/lessons/9.9/reading').send(event(10))).status).toBe(404);
    });
  });

  describe('confidence', () => {
    it('stores every rating, returns the latest, and marks the lesson read', async () => {
      const agent = await registeredAgent(app());
      await agent.put('/api/sections/1.1/confidence').send({ level: 'shaky' });
      const res = await agent.put('/api/sections/1.1/confidence').send({ level: 'solid' });
      expect(res.body).toMatchObject({ confidence: 'solid', readState: 'read' });
      expect(await testDb().confidenceRating.count()).toBe(2);
      expect((await lesson(agent, '1.1')).progress).toMatchObject({
        confidence: 'solid',
        readState: 'read',
      });
    });

    it('rejects an unknown level', async () => {
      const agent = await registeredAgent(app());
      expect((await agent.put('/api/sections/1.1/confidence').send({ level: 'meh' })).status).toBe(
        400,
      );
    });
  });

  describe('notes', () => {
    it('saves a note and shows it to the pod partner', async () => {
      const instance = app();
      const me = await registeredAgent(instance);
      const partner = await registeredAgent(instance, {
        email: 'friend@example.com',
        displayName: 'Friend',
        inviteCode: INVITE_2,
      });

      const saved = await me.put('/api/lessons/1.1/note').send({ body: 'Batch when idle.' });
      expect(saved.body.body).toBe('Batch when idle.');
      expect((await lesson(me, '1.1')).note?.body).toBe('Batch when idle.');

      await me.put('/api/sections/1.1/confidence').send({ level: 'okay' });
      const seen = await lesson(partner, '1.1');
      expect(seen.partner).toMatchObject({
        displayName: 'Tofa',
        confidence: 'okay',
        note: { body: 'Batch when idle.' },
      });
      expect(seen.note).toBeNull();
    });
  });

  describe('check yourself', () => {
    it('grades against the key, logs first try, and reveals the explanation on acceptance', async () => {
      const agent = await registeredAgent(app());
      const wrong = await agent
        .post('/api/lessons/1.1/check')
        .send({ kind: 'scenario_mc', choice: 1 });
      expect(wrong.body).toMatchObject({ accepted: false, attempts: 1, explanation: null });
      expect(wrong.body.feedback).toBe(digest11.checkQuestion.rejectedCopy);

      const right = await agent
        .post('/api/lessons/1.1/check')
        .send({ kind: 'scenario_mc', choice: 0 });
      expect(right.body).toMatchObject({
        accepted: true,
        attempts: 2,
        explanation: digest11.checkQuestion.explanation,
      });

      const answers = await testDb().answer.findMany({ orderBy: { createdAt: 'asc' } });
      expect(answers.map((answer) => [answer.accepted, answer.firstTry, answer.context])).toEqual([
        [false, true, 'check'],
        [true, false, 'check'],
      ]);
      expect((await lesson(agent, '1.1')).check).toMatchObject({
        accepted: true,
        attempts: 2,
        choice: 0,
      });
    });

    it('reveals the explanation after three misses', async () => {
      const agent = await registeredAgent(app());
      for (const choice of [1, 2])
        await agent.post('/api/lessons/1.1/check').send({ kind: 'scenario_mc', choice });
      const third = await agent
        .post('/api/lessons/1.1/check')
        .send({ kind: 'scenario_mc', choice: 3 });
      expect(third.body).toMatchObject({ accepted: false, attempts: 3 });
      expect(third.body.explanation).toBe(digest11.checkQuestion.explanation);
    });

    it('404s a lesson without a check question and validates the answer', async () => {
      const agent = await registeredAgent(app());
      expect(
        (await agent.post('/api/lessons/1.2/check').send({ kind: 'scenario_mc', choice: 0 }))
          .status,
      ).toBe(404);
      expect((await agent.post('/api/lessons/1.1/check').send({ kind: 'nope' })).status).toBe(400);
    });
  });
});

describe('loadContent', () => {
  it('refuses invalid content and names the file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fp-content-'));
    try {
      const contentDir = writeContent(root, { ...digest11, oneLine: '' });
      expect(() => loadContent(contentDir)).toThrow(ContentError);
      expect(() => loadContent(contentDir)).toThrow(/1\.1\.json is invalid at oneLine/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('loads nothing from a folder without chapters', () => {
    expect(loadContent(path.join(tmpdir(), 'no-such-content')).digests.size).toBe(0);
  });
});
