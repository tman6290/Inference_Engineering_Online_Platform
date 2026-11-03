import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ANSWER_KEY_FIELDS,
  attemptAnswerResponseSchema,
  attemptResponseSchema,
  bookResponseSchema,
  checkpointSectionResponseSchema,
  checkpointsResponseSchema,
  exerciseAnswerResponseSchema,
  exerciseResponseSchema,
  lessonResponseSchema,
  meResponseSchema,
  type AttemptResponse,
} from '@forward-pass/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ingestBook } from '../src/book/ingest';
import { ContentError, loadContent, type LoadedContent } from '../src/content/load';
import { fixtureFetcher, INDEX_URL } from './fixtures/book';
import {
  bank11,
  digest11,
  exercise11,
  rightAnswer,
  writeContent,
  wrongAnswer,
} from './fixtures/content';
import {
  INVITE_2,
  noTestDatabase,
  registeredAgent,
  resetDatabase,
  testApp,
  testDb,
} from './helpers';

type Agent = ReturnType<typeof request.agent>;

let dir: string;
let content: LoadedContent;

async function setup() {
  await resetDatabase();
  dir = await mkdtemp(path.join(tmpdir(), 'fp-checkpoints-'));
  await ingestBook({
    db: testDb(),
    fetcher: fixtureFetcher(),
    indexUrl: INDEX_URL,
    bookDir: path.join(dir, 'book'),
    figuresDir: path.join(dir, 'figures'),
    outlinePath: path.join(dir, 'outline.json'),
  });
  content = loadContent(writeContent(dir, digest11, { bank: bank11, exercise: exercise11 }));
}

const app = () => testApp({ content, figuresDir: path.join(dir, 'figures') });

async function start(agent: Agent, status = 201): Promise<AttemptResponse> {
  const res = await agent.post('/api/checkpoints/1.1/attempts');
  expect(res.status).toBe(status);
  return attemptResponseSchema.parse(res.body);
}

const answer = (agent: Agent, attemptId: string, questionId: string, body: object) =>
  agent.post(`/api/attempts/${attemptId}/answers`).send({ questionId, answer: body });

/** Every key name that appears anywhere in a JSON value. */
function keysIn(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => keysIn(item, found));
  else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      found.add(key);
      keysIn(inner, found);
    }
  }
  return found;
}

describe.skipIf(noTestDatabase)('checkpoints', () => {
  beforeEach(setup);
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('requires a session', async () => {
    const anon = request(app());
    expect((await anon.get('/api/checkpoints')).status).toBe(401);
    expect((await anon.post('/api/checkpoints/1.1/attempts')).status).toBe(401);
    expect((await anon.get('/api/exercises/1.1-toy-batch')).status).toBe(401);
  });

  it('starts an attempt with 4 scenario_mc, 3 calculation and 3 text, and no keys', async () => {
    const agent = await registeredAgent(app());
    const state = await start(agent);

    expect(state.questions).toHaveLength(10);
    const kinds = state.questions.map((entry) => entry.question.kind);
    expect(kinds.filter((kind) => kind === 'scenario_mc')).toHaveLength(4);
    expect(kinds.filter((kind) => kind === 'calculation')).toHaveLength(3);
    expect(kinds.filter((kind) => kind === 'text')).toHaveLength(3);
    expect(state.section).toEqual({ number: '1.1', title: 'Batching', chapterNumber: 1 });
    expect(state.attempt).toMatchObject({ firstTryAccepted: 0, passed: null, completedAt: null });

    // Nothing that gives an answer away: no key fields, no reveals on open questions.
    const keys = keysIn(state.questions.map((entry) => entry.question));
    for (const field of ANSWER_KEY_FIELDS) expect(keys.has(field)).toBe(false);
    for (const entry of state.questions) {
      expect(entry).toMatchObject({ explanation: null, solution: null, hint: null, reread: null });
    }

    // Starting again resumes the open attempt.
    const again = await start(agent, 200);
    expect(again.attempt.id).toBe(state.attempt.id);
  });

  it('runs a full attempt end to end and updates /api/me, /api/book and /api/checkpoints', async () => {
    const agent = await registeredAgent(app());
    const state = await start(agent);
    const [first, ...rest] = state.questions.map((entry) => entry.question.id);

    // One miss on the first question, then right: it counts against first-try acceptance.
    const miss = attemptAnswerResponseSchema.parse(
      (await answer(agent, state.attempt.id, first!, wrongAnswer(first!))).body,
    );
    expect(miss.result.accepted).toBe(false);
    expect(miss.state.questions[0]).toMatchObject({ status: 'open', firstTry: 'missed', tries: 1 });
    expect(miss.state.questions[0]!.explanation).toBeNull();
    await answer(agent, state.attempt.id, first!, rightAnswer(first!));

    let last: AttemptResponse | undefined;
    for (const id of rest) {
      const res = await answer(agent, state.attempt.id, id, rightAnswer(id));
      expect(res.status).toBe(200);
      const body = attemptAnswerResponseSchema.parse(res.body);
      expect(body.result.accepted).toBe(true);
      last = body.state;
    }

    expect(last!.attempt).toMatchObject({ firstTryAccepted: 9, acceptance: 0.9, passed: true });
    expect(last!.attempt.completedAt).not.toBeNull();
    // Closed questions show their explanation, key and reread link.
    expect(last!.questions[0]).toMatchObject({
      status: 'accepted',
      explanation: `Why ${first} is right.`,
      reread: '1.1.1',
    });
    expect(last!.questions[0]!.solution).not.toBeNull();
    // 1.2 is the chapter's last section, so 1.1 unlocks no project.
    expect(last!.project).toBeNull();
    expect(last!.next).toEqual({ id: '1.2', title: 'Caching Results' });

    // Answering after the attempt finished is refused.
    expect((await answer(agent, state.attempt.id, first!, rightAnswer(first!))).status).toBe(409);

    const me = meResponseSchema.parse((await agent.get('/api/me')).body);
    expect(me.stats).toEqual({ answered: 10, acceptedFirstTry: 9, acceptanceRate: 0.9, uptime: 1 });

    const book = bookResponseSchema.parse((await agent.get('/api/book')).body);
    const section = book.chapters.flatMap((c) => c.sections).find((s) => s.number === '1.1');
    expect(section?.checkpointScore).toBe(0.9);

    const list = checkpointsResponseSchema.parse((await agent.get('/api/checkpoints')).body);
    expect(list.sections).toEqual([
      expect.objectContaining({ number: '1.1', attempts: 1, best: 0.9, passed: true }),
    ]);
    const one = checkpointSectionResponseSchema.parse(
      (await agent.get('/api/checkpoints/1.1')).body,
    );
    expect(one).toMatchObject({ bankSize: 24, openAttemptId: null });
    expect(one.attempts).toHaveLength(1);
  });

  it('closes a question after three misses and reveals its explanation then', async () => {
    const agent = await registeredAgent(app());
    const state = await start(agent);
    const mc = state.questions.find((entry) => entry.question.kind === 'scenario_mc')!;
    const id = mc.question.id;

    for (let tries = 1; tries <= 3; tries++) {
      const body = attemptAnswerResponseSchema.parse(
        (await answer(agent, state.attempt.id, id, wrongAnswer(id))).body,
      );
      expect(body.result.feedback).toBe(`Not that one ${id.split('-').at(-1)}.`);
      const entry = body.state.questions.find((q) => q.question.id === id)!;
      expect(entry.status).toBe(tries < 3 ? 'open' : 'missed');
      expect(entry.explanation).toBe(tries < 3 ? null : `Why ${id} is right.`);
    }
    const after = attemptResponseSchema.parse(
      (await agent.get(`/api/attempts/${state.attempt.id}`)).body,
    );
    expect(after.questions.find((q) => q.question.id === id)!.solution).toEqual({
      kind: 'scenario_mc',
      choice: 0,
    });
    expect((await answer(agent, state.attempt.id, id, rightAnswer(id))).status).toBe(409);
  });

  it('grades calculation units and text normalisation through the attempt', async () => {
    const agent = await registeredAgent(app());
    const state = await start(agent);
    const calc = state.questions.find((entry) => entry.question.kind === 'calculation')!.question;
    const text = state.questions.find((entry) => entry.question.kind === 'text')!.question;
    const key = bank11.questions.find((q) => q.id === calc.id) as { answer: number };

    const inMb = attemptAnswerResponseSchema.parse(
      (
        await answer(agent, state.attempt.id, calc.id, {
          kind: 'calculation',
          value: key.answer * 1000 * 1.04,
          unit: 'MB',
        })
      ).body,
    );
    expect(inMb.result.accepted).toBe(true);

    const spaced = attemptAnswerResponseSchema.parse(
      (
        await answer(agent, state.attempt.id, text.id, {
          kind: 'text',
          text: `  ${text.id.replace('1.1-text-', 'ANSWER  ')}. `,
        })
      ).body,
    );
    expect(spaced.result.accepted).toBe(true);
  });

  it('logs hints and counts them on the attempt', async () => {
    const agent = await registeredAgent(app());
    const state = await start(agent);
    const calc = state.questions.find((entry) => entry.question.kind === 'calculation')!.question;

    const res = await agent.post(`/api/attempts/${state.attempt.id}/questions/${calc.id}/hint`);
    const hinted = attemptResponseSchema.parse(res.body);
    const entry = hinted.questions.find((q) => q.question.id === calc.id)!;
    expect(entry).toMatchObject({ usedHint: true, hint: `Method for calc ${calc.id.at(-1)}.` });
    expect(hinted.attempt.hints).toBe(1);

    await answer(agent, state.attempt.id, calc.id, rightAnswer(calc.id));
    const [row] = await testDb().answer.findMany({ where: { attemptId: state.attempt.id } });
    expect(row).toMatchObject({ usedHint: true, firstTry: true, accepted: true });
    expect(row!.feedback).toMatch(/^Accepted/);
  });

  it('finishes early, counting open questions as missed', async () => {
    const agent = await registeredAgent(app());
    const state = await start(agent);
    const id = state.questions[0]!.question.id;
    await answer(agent, state.attempt.id, id, rightAnswer(id));

    const done = attemptResponseSchema.parse(
      (await agent.post(`/api/attempts/${state.attempt.id}/finish`)).body,
    );
    expect(done.attempt).toMatchObject({ firstTryAccepted: 1, passed: false, acceptance: 0.1 });
    expect(done.questions.filter((q) => q.status === 'missed')).toHaveLength(9);
    expect(done.questions.every((q) => q.solution !== null)).toBe(true);
  });

  it('leaves out questions answered right first try in the last 30 days', async () => {
    const agent = await registeredAgent(app());
    const first = await start(agent);
    const ids = first.questions.map((entry) => entry.question.id);
    for (const id of ids) await answer(agent, first.attempt.id, id, rightAnswer(id));

    const second = await start(agent);
    expect(second.attempt.id).not.toBe(first.attempt.id);
    expect(second.questions.filter((entry) => ids.includes(entry.question.id))).toEqual([]);
  });

  it("keeps each learner's attempts private", async () => {
    const mine = await registeredAgent(app());
    const state = await start(mine);
    const partner = await registeredAgent(app(), {
      email: 'friend@example.com',
      displayName: 'Friend',
      inviteCode: INVITE_2,
    });
    expect((await partner.get(`/api/attempts/${state.attempt.id}`)).status).toBe(404);
    const id = state.questions[0]!.question.id;
    expect((await answer(partner, state.attempt.id, id, rightAnswer(id))).status).toBe(404);
  });

  it('refuses sections without a bank and questions outside the attempt', async () => {
    const agent = await registeredAgent(app());
    expect((await agent.post('/api/checkpoints/1.2/attempts')).status).toBe(404);
    const state = await start(agent);
    const outside = bank11.questions
      .map((q) => q.id)
      .find((id) => !state.questions.some((entry) => entry.question.id === id))!;
    expect((await answer(agent, state.attempt.id, outside, rightAnswer(outside))).status).toBe(400);
  });
});

describe.skipIf(noTestDatabase)('exercises', () => {
  beforeEach(setup);
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const get = async (agent: Agent) =>
    exerciseResponseSchema.parse((await agent.get('/api/exercises/1.1-toy-batch')).body);

  it('lists exercises on the lesson and serves them without the key', async () => {
    const agent = await registeredAgent(app());
    const lesson = lessonResponseSchema.parse((await agent.get('/api/lessons/1.1')).body);
    expect(lesson.exercises).toEqual([
      {
        id: '1.1-toy-batch',
        title: 'Batch four toy requests',
        estimatedMinutes: 5,
        hasTests: true,
        status: 'new',
      },
    ]);

    const body = (await agent.get('/api/exercises/1.1-toy-batch')).body;
    const keys = keysIn(body.exercise);
    for (const field of ANSWER_KEY_FIELDS) expect(keys.has(field)).toBe(false);
    expect(body.solution).toBeNull();
    expect(JSON.stringify(body)).not.toContain('200 tokens/s');
  });

  it('grades answers and unlocks the solution once accepted', async () => {
    const agent = await registeredAgent(app());
    const wrong = exerciseAnswerResponseSchema.parse(
      (
        await agent.post('/api/exercises/1.1-toy-batch/answers').send({
          answer: { kind: 'calculation', value: 50 },
        })
      ).body,
    );
    expect(wrong.result.accepted).toBe(false);
    expect(wrong.state).toMatchObject({ status: 'tried', tries: 1, solution: null });

    const right = exerciseAnswerResponseSchema.parse(
      (
        await agent.post('/api/exercises/1.1-toy-batch/answers').send({
          answer: { kind: 'calculation', value: 200.5 },
        })
      ).body,
    );
    expect(right.result.accepted).toBe(true);
    expect(right.state.solution).toEqual({
      walkthrough: 'Four tokens per 20 ms pass is **200 tokens/s**.',
      finalAnswer: { kind: 'calculation', value: 200, unit: 'tokens/s' },
      files: ['solution/starter.py'],
    });
    expect(right.state.revealed).toBe(false);
  });

  it('logs a reveal and then shows the solution', async () => {
    const agent = await registeredAgent(app());
    const revealed = exerciseResponseSchema.parse(
      (await agent.post('/api/exercises/1.1-toy-batch/reveal')).body,
    );
    expect(revealed).toMatchObject({ revealed: true, status: 'new' });
    expect(revealed.solution?.walkthrough).toMatch(/200 tokens\/s/);
    expect((await get(agent)).revealed).toBe(true);
    expect(await testDb().exerciseReveal.count()).toBe(1);
  });

  it('serves listed files only, and solution files once unlocked', async () => {
    const agent = await registeredAgent(app());
    const starter = await agent.get('/api/exercises/1.1-toy-batch/files/starter.py');
    expect(starter.status).toBe(200);
    expect(starter.headers['content-disposition']).toContain('starter.py');
    expect(String(starter.text ?? starter.body)).toContain('NotImplementedError');
    expect((await agent.get('/api/exercises/1.1-toy-batch/files/test_starter.py')).status).toBe(
      200,
    );

    expect((await agent.get('/api/exercises/1.1-toy-batch/files/exercise.json')).status).toBe(404);
    expect(
      (await agent.get('/api/exercises/1.1-toy-batch/files/..%2F..%2Fchapter.json')).status,
    ).toBe(404);
    expect((await agent.get('/api/exercises/1.1-toy-batch/files/solution/starter.py')).status).toBe(
      403,
    );

    await agent.post('/api/exercises/1.1-toy-batch/reveal');
    const solution = await agent.get('/api/exercises/1.1-toy-batch/files/solution/starter.py');
    expect(solution.status).toBe(200);
  });

  it('refuses to load an invalid exercise', () => {
    const broken = writeContent(path.join(dir, 'broken'), digest11, {
      exercise: { ...exercise11, steps: [] },
    });
    expect(() => loadContent(broken)).toThrow(ContentError);
  });
});
