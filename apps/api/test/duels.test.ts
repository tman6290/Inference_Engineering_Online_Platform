import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  attemptAnswerResponseSchema,
  attemptResponseSchema,
  duelSchema,
  duelsResponseSchema,
  homeResponseSchema,
  lessonResponseSchema,
  standingsResponseSchema,
  teachBackFormSchema,
  TEACH_BACK_AUDIO_MAX_BYTES,
  type DuelView,
} from '@forward-pass/shared';
import type request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ingestBook } from '../src/book/ingest';
import { loadContent, type LoadedContent } from '../src/content/load';
import { compareResults } from '../src/pod/duels';
import { fixtureFetcher, INDEX_URL } from './fixtures/book';
import { bank11, digest11, rightAnswer, writeContent, wrongAnswer } from './fixtures/content';
import {
  INVITE_2,
  noTestDatabase,
  registeredAgent,
  resetDatabase,
  testApp,
  testDb,
} from './helpers';

type Agent = ReturnType<typeof request.agent>;

describe('duel resolution', () => {
  const r = (firstTryAccepted: number, hints: number, took: number) => ({
    firstTryAccepted,
    hints,
    took,
  });
  it('ranks first-try acceptance, then fewer hints, then speed', () => {
    expect(compareResults(r(8, 3, 900), r(7, 0, 100))).toBe('a');
    expect(compareResults(r(7, 2, 100), r(7, 1, 900))).toBe('b');
    expect(compareResults(r(7, 1, 500), r(7, 1, 600))).toBe('a');
    expect(compareResults(r(7, 1, 500), r(7, 1, 500))).toBe('draw');
  });
});

let dir: string;
let content: LoadedContent;

describe.skipIf(noTestDatabase)('duels', () => {
  beforeEach(async () => {
    await resetDatabase();
    dir = await mkdtemp(path.join(tmpdir(), 'fp-duels-'));
    await ingestBook({
      db: testDb(),
      fetcher: fixtureFetcher(),
      indexUrl: INDEX_URL,
      bookDir: path.join(dir, 'book'),
      figuresDir: path.join(dir, 'figures'),
      outlinePath: path.join(dir, 'outline.json'),
    });
    content = loadContent(writeContent(dir, digest11, { bank: bank11 }));
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

  /** Rating confidence marks the section read. */
  const read = (agent: Agent, section = '1.1') =>
    agent.put(`/api/sections/${section}/confidence`).send({ level: 'okay' });

  const view = async (agent: Agent, id: string): Promise<DuelView> =>
    duelsResponseSchema.parse((await agent.get('/api/duels')).body).duels.find((d) => d.id === id)!;

  /** Answers every question; `misses` of them wrong three times so they close missed. */
  async function play(agent: Agent, duelId: string, misses: number) {
    const started = await agent.post(`/api/duels/${duelId}/attempt`);
    expect(started.status).toBe(201);
    const state = attemptResponseSchema.parse(started.body);
    const ids = state.questions.map((entry) => entry.question.id);
    for (const [index, id] of ids.entries()) {
      const tries =
        index < misses ? [wrongAnswer(id), wrongAnswer(id), wrongAnswer(id)] : [rightAnswer(id)];
      for (const answer of tries) {
        const res = await agent
          .post(`/api/attempts/${state.attempt.id}/answers`)
          .send({ questionId: id, answer });
        attemptAnswerResponseSchema.parse(res.body);
      }
    }
    return ids;
  }

  it('runs a full duel: challenge, accept, both attempts, resolution and teach-back', async () => {
    const { tofa, friend } = await pod();

    // Locked until both have read the section.
    await read(tofa);
    expect((await tofa.post('/api/duels').send({ sectionNumber: '1.1' })).status).toBe(409);
    await read(friend);
    const standings = standingsResponseSchema.parse((await tofa.get('/api/pod/standings')).body);
    expect(standings.challenge).toEqual({ sectionNumber: '1.1', title: 'Batching' });

    const created = await tofa.post('/api/duels').send({ sectionNumber: '1.1' });
    expect(created.status).toBe(201);
    const duel = duelSchema.parse(created.body);
    expect(duel).toMatchObject({ status: 'pending', role: 'challenger', questionCount: 10 });
    expect(Date.parse(duel.deadline) - Date.parse(duel.createdAt)).toBe(48 * 60 * 60 * 1000);
    expect((await tofa.post('/api/duels').send({ sectionNumber: '1.1' })).status).toBe(409);

    // Only the opponent accepts, and nobody plays before that.
    expect((await tofa.post(`/api/duels/${duel.id}/attempt`)).status).toBe(409);
    expect((await tofa.post(`/api/duels/${duel.id}/accept`)).status).toBe(403);
    const friendHome = homeResponseSchema.parse((await friend.get('/api/home')).body);
    expect(friendHome.duels.incoming.map((d) => d.id)).toEqual([duel.id]);
    expect((await friend.post(`/api/duels/${duel.id}/accept`)).body.status).toBe('open');

    // Tofa plays first, all right. Friend can't see the score yet, and neither can Tofa see Friend's.
    const tofaIds = await play(tofa, duel.id, 0);
    expect((await view(friend, duel.id)).theirs).toMatchObject({
      finished: true,
      firstTryAccepted: null,
    });
    expect((await view(tofa, duel.id)).mine).toMatchObject({
      finished: true,
      firstTryAccepted: 10,
    });

    // Friend gets the same questions and misses three.
    const friendIds = await play(friend, duel.id, 3);
    expect(friendIds).toEqual(tofaIds);

    const tofaView = await view(tofa, duel.id);
    expect(tofaView).toMatchObject({ status: 'complete', outcome: 'won' });
    expect(tofaView.theirs.firstTryAccepted).toBe(7);
    const friendView = await view(friend, duel.id);
    expect(friendView).toMatchObject({
      outcome: 'lost',
      teachBack: { owedBy: 'me', recorded: false },
    });

    const record = standingsResponseSchema.parse((await friend.get('/api/pod/standings')).body);
    expect(record.members.map((m) => [m.displayName, m.duels])).toEqual([
      ['Friend', { wins: 0, losses: 1, draws: 0 }],
      ['Tofa', { wins: 1, losses: 0, draws: 0 }],
    ]);

    // The loser's Home shows the owed teach-back until it is recorded.
    const owed = () =>
      friend
        .get('/api/home')
        .then((res) => homeResponseSchema.parse(res.body).duels.owed.map((d) => d.id));
    expect(await owed()).toEqual([duel.id]);

    expect((await tofa.put(`/api/duels/${duel.id}/teach-back`).send({ entries: [] })).status).toBe(
      403,
    );
    const form = teachBackFormSchema.parse(
      (await friend.get(`/api/duels/${duel.id}/teach-back`)).body,
    );
    expect(form.missed.map((m) => m.questionId)).toEqual(friendIds.slice(0, 3));
    expect(form.missed[0]!.prompt).not.toBe('');

    const entries = form.missed.map((m) => ({
      questionId: m.questionId,
      text: `Why ${m.questionId} works.`,
    }));
    await friend.put(`/api/duels/${duel.id}/teach-back`).send({ entries: entries.slice(0, 2) });
    expect(await owed()).toEqual([duel.id]);
    await friend.put(`/api/duels/${duel.id}/teach-back`).send({ entries });
    expect(await owed()).toEqual([]);

    // The winner reads it in the section's notes rail.
    const lesson = lessonResponseSchema.parse((await tofa.get('/api/lessons/1.1')).body);
    expect(lesson.teachBacks).toHaveLength(1);
    expect(lesson.teachBacks[0]).toMatchObject({
      author: { displayName: 'Friend' },
      audioUrl: null,
    });
    expect(lesson.teachBacks[0]!.entries.map((e) => e.text)).toEqual(entries.map((e) => e.text));
  });

  it('stores teach-back audio up to 5 MB and plays it to both learners', async () => {
    const { tofa, friend } = await pod();
    await read(tofa);
    await read(friend);
    const duel = duelSchema.parse(
      (await tofa.post('/api/duels').send({ sectionNumber: '1.1' })).body,
    );
    await friend.post(`/api/duels/${duel.id}/accept`);
    await play(tofa, duel.id, 0);
    await play(friend, duel.id, 4);

    const audio = Buffer.from('fake webm bytes');
    const upload = (agent: Agent, type: string, body: Buffer) =>
      agent.put(`/api/duels/${duel.id}/teach-back/audio`).set('content-type', type).send(body);
    expect((await upload(tofa, 'audio/webm', audio)).status).toBe(403);
    expect((await upload(friend, 'text/plain', audio)).status).toBe(415);
    expect(
      (await upload(friend, 'audio/webm', Buffer.alloc(TEACH_BACK_AUDIO_MAX_BYTES + 1))).status,
    ).toBe(413);
    const saved = duelSchema.parse((await upload(friend, 'audio/webm', audio)).body);
    expect(saved.teachBack).toEqual({ owedBy: 'me', recorded: true });

    const played = await tofa
      .get(`/api/duels/${duel.id}/teach-back/audio`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
    expect(played.status).toBe(200);
    expect(played.headers['content-type']).toBe('audio/webm');
    expect((played.body as Buffer).toString()).toBe('fake webm bytes');
    // Stored in the database, not on the API's disk, which a host may wipe on restart.
    expect(existsSync(path.join(dir, 'uploads'))).toBe(false);
  });

  it('expires duels after 48 hours for nobody, and draws fresh questions next time', async () => {
    const { tofa, friend } = await pod();
    await read(tofa);
    await read(friend);
    const first = duelSchema.parse(
      (await tofa.post('/api/duels').send({ sectionNumber: '1.1' })).body,
    );
    await friend.post(`/api/duels/${first.id}/accept`);
    const seen = await play(tofa, first.id, 0);
    await testDb().duel.update({
      where: { id: first.id },
      data: { deadline: new Date(Date.now() - 1000) },
    });

    expect((await view(friend, first.id)).status).toBe('expired');
    expect((await friend.post(`/api/duels/${first.id}/attempt`)).status).toBe(409);
    const record = standingsResponseSchema.parse((await tofa.get('/api/pod/standings')).body);
    expect(record.members[0]!.duels).toEqual({ wins: 0, losses: 0, draws: 0 });

    // A new duel leaves out the questions Tofa already answered.
    const second = duelSchema.parse(
      (await friend.post('/api/duels').send({ sectionNumber: '1.1' })).body,
    );
    const row = await testDb().duel.findUniqueOrThrow({ where: { id: second.id } });
    expect(row.questionIds.filter((id) => seen.includes(id))).toEqual([]);
  });
});
