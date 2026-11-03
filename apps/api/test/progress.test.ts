import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  attemptAnswerResponseSchema,
  attemptResponseSchema,
  homeResponseSchema,
  meResponseSchema,
  progressPageSchema,
} from '@forward-pass/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ingestBook } from '../src/book/ingest';
import { loadContent, type LoadedContent } from '../src/content/load';
import { SEED_USERS, SeedRefused, seedActivity } from '../src/dev/seed';
import { studyDate, uptime } from '../src/progress/days';
import { studyDaysOf } from '../src/progress/store';
import { fixtureFetcher, INDEX_URL } from './fixtures/book';
import { bank11, digest11, rightAnswer, writeContent, wrongAnswer } from './fixtures/content';
import { noTestDatabase, registeredAgent, resetDatabase, testApp, testDb } from './helpers';

const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = 'seeded demo password';

let dir: string;
let content: LoadedContent;

/** The toy book has two numbered sections; add eighteen more so a seed can show a pace. */
async function moreSections() {
  const db = testDb();
  for (let n = 3; n <= 20; n++) {
    await db.section.create({
      data: {
        number: `1.${n}`,
        chapterNumber: 1,
        slug: `toy-${n}`,
        title: `Toy Section ${n}`,
        summary: 'Made up for tests.',
        url: `https://books.example/toy/1.${n}.md`,
        intro: 'Toy text.',
        wordCount: 400,
        readingMinutes: 2,
        orderIndex: 100 + n,
        boldTerms: [],
      },
    });
  }
}

async function setup() {
  await resetDatabase();
  dir = await mkdtemp(path.join(tmpdir(), 'fp-progress-'));
  await ingestBook({
    db: testDb(),
    fetcher: fixtureFetcher(),
    indexUrl: INDEX_URL,
    bookDir: path.join(dir, 'book'),
    figuresDir: path.join(dir, 'figures'),
    outlinePath: path.join(dir, 'outline.json'),
  });
  await moreSections();
  content = loadContent(writeContent(dir, digest11, { bank: bank11 }));
}

const app = (devRoutes = false) =>
  testApp({ content, figuresDir: path.join(dir, 'figures'), devRoutes });

async function signIn(email: string) {
  const agent = request.agent(app());
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

describe.skipIf(noTestDatabase)('progress and Home', () => {
  beforeEach(setup);
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('refuses to seed a database with real accounts', async () => {
    await registeredAgent(app());
    await expect(
      seedActivity(testDb(), content, { seed: 'a', password: PASSWORD }),
    ).rejects.toThrow(SeedRefused);
  });

  it('seeds 60 days that drive the heatmap, uptime, mastery and recall queue', async () => {
    const summary = await seedActivity(testDb(), content, { seed: 'alpha', password: PASSWORD });
    expect(summary.users.map((user) => user.email)).toEqual(SEED_USERS.map((user) => user.email));
    expect(summary.users.every((user) => user.studyDays > 20)).toBe(true);

    const agent = await signIn('tofa@seed.test');
    const page = progressPageSchema.parse((await agent.get('/api/progress')).body);

    // Twelve weeks starting on a Monday and ending today.
    expect(page.days.at(-1)!.date).toBe(page.today);
    expect(new Date(`${page.days[0]!.date}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(page.days.length).toBeGreaterThan(77);
    expect(page.days.length).toBeLessThanOrEqual(84);
    expect(page.days.filter((day) => day.intensity > 0).length).toBeGreaterThan(15);

    // Uptime matches the stored study days, and the longest run is at least as long.
    const me = await testDb().user.findUniqueOrThrow({ where: { email: 'tofa@seed.test' } });
    const stored = await studyDaysOf(testDb(), me.id);
    expect(page.uptime.current).toBe(uptime(stored, studyDate(new Date())));
    expect(page.uptime.longest).toBeGreaterThanOrEqual(page.uptime.current);
    expect(page.uptime.longest).toBeGreaterThan(0);

    // 1.1 was read and checked, so chapter 1 has mastery; the partner's bar is there too.
    const chapter = page.mastery.find((entry) => entry.number === 1)!;
    expect(chapter.sections.find((section) => section.number === '1.1')!.mine).toBeGreaterThan(0);
    expect(chapter.mine).toBeGreaterThan(0);
    expect(chapter.partner).not.toBeNull();
    expect(page.partner?.displayName).toBe('Friend');

    // The first lessons were rated weeks ago, so some are due for recall.
    expect(page.recall.length).toBeGreaterThan(0);
    expect(page.stats.decoded).toBeGreaterThan(5);
    expect(page.stats.sectionsPerWeek).toBeGreaterThan(0);
    expect(page.stats.projectedFinish).not.toBeNull();
    expect(page.patterns.bestWeekday).not.toBeNull();
    expect(page.patterns.typicalSessionMinutes).toBeGreaterThan(5);
  });

  it('is deterministic per seed, and another seed moves the projected finish', async () => {
    const now = new Date('2026-11-03T12:00:00Z');
    const finishFor = async (seed: string) => {
      await seedActivity(testDb(), content, { seed, password: PASSWORD, now });
      const page = progressPageSchema.parse(
        (await (await signIn('tofa@seed.test')).get('/api/progress')).body,
      );
      return [page.stats.sectionsPerWeek, page.stats.decoded];
    };
    const first = await finishFor('alpha');
    expect(await finishFor('alpha')).toEqual(first);
    const others = [await finishFor('beta'), await finishFor('gamma')];
    expect(others.some((other) => JSON.stringify(other) !== JSON.stringify(first))).toBe(true);
  });

  it('serves Home with real numbers', async () => {
    await seedActivity(testDb(), content, { seed: 'alpha', password: PASSWORD });
    const agent = await signIn('tofa@seed.test');
    const home = homeResponseSchema.parse((await agent.get('/api/home')).body);

    expect(home.continue).not.toBeNull();
    expect(home.continue!.maxScrollPct).toBeGreaterThan(0);
    expect(home.tiles.weekDays).toHaveLength(7);
    expect(home.tiles.weekMinutes).toBe(home.tiles.weekDays.reduce((a, b) => a + b, 0));
    expect(home.standings.map((row) => [row.displayName, row.isYou])).toEqual([
      ['Tofa', true],
      ['Friend', false],
    ]);
    expect(home.standings[0]!.lastActivity).not.toBeNull();
    expect(home.nextProject).toMatchObject({ chapterNumber: 1, unlockAfter: '1.20' });

    const me = meResponseSchema.parse((await agent.get('/api/me')).body);
    expect(me.stats.uptime).toBe(home.standings[0]!.uptime);
    expect(me.stats.answered).toBeGreaterThan(0);
  });

  it('counts today in uptime as soon as there are ten minutes of reading', async () => {
    const agent = await registeredAgent(app());
    expect(meResponseSchema.parse((await agent.get('/api/me')).body).stats.uptime).toBe(0);
    const startedAt = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await agent
      .post('/api/lessons/1.1/reading')
      .send({ startedAt, endedAt: new Date().toISOString(), maxScrollPct: 40 });
    expect(meResponseSchema.parse((await agent.get('/api/me')).body).stats.uptime).toBe(1);
  });

  it('runs a recall attempt and drops confidence after two misses in a row', async () => {
    const agent = await registeredAgent(app());
    const user = await testDb().user.findFirstOrThrow();
    await testDb().confidenceRating.create({
      data: {
        userId: user.id,
        lessonId: '1.1',
        level: 'solid',
        createdAt: new Date(Date.now() - 25 * DAY),
      },
    });

    const started = await agent.post('/api/recall/attempts');
    expect(started.status).toBe(201);
    const state = attemptResponseSchema.parse(started.body);
    expect(state.attempt.kind).toBe('recall');
    expect(state.questions).toHaveLength(3);
    expect(state.section.title).toBe('Recall: 1.1');

    const ids = state.questions.map((entry) => entry.question.id);
    // Misses on the first two, first try; right on the third. Missed questions close after 3 tries.
    for (const id of ids.slice(0, 2)) {
      for (let tries = 0; tries < 3; tries++) {
        await agent
          .post(`/api/attempts/${state.attempt.id}/answers`)
          .send({ questionId: id, answer: wrongAnswer(id) });
      }
    }
    const last = attemptAnswerResponseSchema.parse(
      (
        await agent
          .post(`/api/attempts/${state.attempt.id}/answers`)
          .send({ questionId: ids[2], answer: rightAnswer(ids[2]!) })
      ).body,
    );
    expect(last.state.attempt.completedAt).not.toBeNull();

    const rating = await testDb().confidenceRating.findFirst({
      where: { userId: user.id, lessonId: '1.1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(rating?.level).toBe('okay');
    // The fresh rating takes 1.1 off the queue.
    expect((await agent.post('/api/recall/attempts')).status).toBe(409);
    // Recall doesn't count as the section's checkpoint score.
    const book = (await agent.get('/api/book')).body;
    expect(book.chapters[1].sections[0].checkpointScore).toBeNull();
  });

  it('mounts the rebuild route only in development', async () => {
    const dev = await registeredAgent(app(true));
    expect((await dev.post('/api/progress/rebuild')).body).toEqual({ rebuilt: 1 });
    const prod = request.agent(app(false));
    await prod
      .post('/api/auth/login')
      .send({ email: 'tofa@example.com', password: 'correct horse battery' });
    expect((await prod.post('/api/progress/rebuild')).status).toBe(404);
  });
});
