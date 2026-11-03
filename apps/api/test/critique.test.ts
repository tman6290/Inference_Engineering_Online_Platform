import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  projectSpecSchema,
  submissionDetailSchema,
  type CritiqueOutput,
} from '@forward-pass/shared';
import type { LlmClient } from '@forward-pass/llm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ingestBook } from '../src/book/ingest';
import { loadContent, type LoadedContent } from '../src/content/load';
import { findUnsupportedClaims } from '../src/projects/claims';
import {
  buildCritiquePrompt,
  createCritiqueRunner,
  CRITIQUE_RULES,
  finalise,
} from '../src/projects/critique';
import { syncProjects } from '../src/projects/sync';
import { fixtureFetcher, INDEX_URL } from './fixtures/book';
import { bank11, digest11, project01, writeContent } from './fixtures/content';
import { noTestDatabase, registeredAgent, resetDatabase, testApp, testDb } from './helpers';

const spec = projectSpecSchema.parse(project01);
const results = {
  runs: [
    { batch: 1, tps: 50 },
    { batch: 4, tps: 180 },
  ],
};
const readme = [
  '## Decision',
  'Batch 4 reaches 180 tokens/s, a 3.6x gain over batch 1.',
  'At batch 8 we measured 410 tokens/s.',
  '```',
  'python -m bench --tps 999 tokens/s',
  '```',
].join('\n');

const output = (overrides: Partial<CritiqueOutput> = {}): CritiqueOutput => ({
  total: 95,
  dimensions: [
    { dimension: 'Correctness', score: 70, max: 60, reasoning: 'Runs back the numbers (see 1.1).' },
    { dimension: 'writing', score: 30, max: 40, reasoning: 'Decision first.' },
  ],
  headline: 'Clear decision, but one claim has no run behind it at all here',
  right: ['The decision comes first.'],
  wrong: [],
  workOn: [{ step: 'Add the batch 8 run to results.json.', section: '1.1' }],
  inlineComments: [{ path: 'bench/run.py', line: 3, body: 'Warm up first.' }],
  unsupportedClaims: [],
  portfolioReady: true,
  skillsDemonstrated: ['benchmarking'],
  ...overrides,
});

const report = {
  checks: [
    { checkId: 'files', kind: 'files' as const, passed: true, log: 'ok', durationMs: 1 },
    { checkId: 'dry-run', kind: 'run' as const, passed: false, log: 'exit 2', durationMs: 5 },
  ],
  artifacts: {
    fileTree: ['README.md', 'bench/run.py'],
    readme,
    results,
    sources: [{ path: 'bench/run.py', content: 'x = 1' }],
  },
};
const labels = { files: 'Required files exist', 'dry-run': 'make check passes' };

describe('critique rules', () => {
  it('lists a README claim that results.json does not back under unsupportedClaims', () => {
    const claims = findUnsupportedClaims(readme, results);
    expect(claims).toEqual([
      {
        claim: 'At batch 8 we measured 410 tokens/s.',
        why: 'results.json has no value matching 410 tokens/s.',
      },
    ]);
  });

  it('backs percentages and speedups from results, and ignores code blocks', () => {
    expect(
      findUnsupportedClaims('Batch 4 is 3.6x faster. Acceptance was 72%.', {
        a: 180,
        b: 50,
        rate: 0.72,
      }),
    ).toEqual([]);
    expect(findUnsupportedClaims('Run `--tps 999 tokens/s` to try.', {})).toEqual([]);
  });

  it('recomputes the total and portfolio gate, follows the rubric and names failed checks', () => {
    const final = finalise(output(), spec, report, labels);
    expect(final.dimensions.map((d) => [d.dimension, d.score, d.max])).toEqual([
      ['Correctness', 60, 60],
      ['Writing', 30, 40],
    ]);
    expect(final.total).toBe(90);
    expect(final.portfolioReady).toBe(true);
    expect(final.headline.split(' ')).toHaveLength(12);
    expect(final.wrong[0]).toEqual({
      text: 'The "make check passes" check failed, so what it proves is unproven.',
      evidence: { kind: 'check', ref: 'dry-run' },
    });
    expect(final.unsupportedClaims.map((c) => c.claim)).toContain(
      'At batch 8 we measured 410 tokens/s.',
    );

    const weak = finalise(
      output({
        dimensions: [
          { dimension: 'Correctness', score: 60, max: 60, reasoning: '' },
          { dimension: 'Writing', score: 20, max: 40, reasoning: '' },
        ],
      }),
      spec,
      report,
      labels,
    );
    expect(weak.total).toBe(80);
    expect(weak.portfolioReady).toBe(false);
  });

  it('puts the rules, the book, the checks and the evidence in the prompt', () => {
    const { system, user } = buildCritiquePrompt({
      spec,
      brief: 'Measure it.',
      book: [{ number: '1.1', title: 'Batching', text: 'BOOK TEXT FOR 1.1' }],
      report,
      checkLabels: labels,
      noteToGrader: 'Look at P95.',
      files: ['p95.png'],
    });
    for (const rule of CRITIQUE_RULES) expect(system).toContain(rule);
    expect(system).toContain(
      'Never award rigor points for a measurement that results.json does not contain',
    );
    expect(user).toContain('<book_section number="1.1" title="Batching">\nBOOK TEXT FOR 1.1');
    expect(user).toContain('- dry-run (make check passes): FAILED');
    expect(user).toContain('"tps": 180');
    expect(user).toContain('<source path="bench/run.py">');
    expect(user).toContain('Look at P95.');
  });
});

let dir: string;
let content: LoadedContent;

describe.skipIf(noTestDatabase)('critique runs', () => {
  beforeEach(async () => {
    await resetDatabase();
    dir = await mkdtemp(path.join(tmpdir(), 'fp-critique-'));
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

  it('grades a checked submission, at temperature 0, and stores the cost', async () => {
    const complete = vi.fn(async () => ({
      data: output(),
      usage: { inputTokens: 12000, outputTokens: 900, costUsd: 0.0495 },
      model: 'test-model',
      attempts: 1,
    }));
    const llm = { provider: 'anthropic', model: 'test-model', complete } as unknown as LlmClient;
    const critique = createCritiqueRunner(testDb(), content, llm);
    const app = testApp({
      content,
      figuresDir: path.join(dir, 'figures'),
      uploadsDir: path.join(dir, 'up'),
      runnerToken: 't',
      critique,
    });
    const agent = await registeredAgent(app);
    const user = await testDb().user.findFirstOrThrow();
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

    const { id } = (
      await agent
        .post(`/api/projects/${project01.slug}/submissions`)
        .send({ repoUrl: 'https://github.com/tofa/toy' })
    ).body;
    const runner = request(app);
    await runner.post('/api/internal/jobs/claim').set('authorization', 'Bearer t');
    await runner
      .post(`/api/internal/submissions/${id}/report`)
      .set('authorization', 'Bearer t')
      .send({ commitSha: null, ...report, error: null });

    await vi.waitFor(async () =>
      expect((await agent.get(`/api/submissions/${id}`)).body.status).toBe('graded'),
    );
    const detail = submissionDetailSchema.parse((await agent.get(`/api/submissions/${id}`)).body);
    expect(detail.critique).toMatchObject({ total: 90, model: 'test-model', costUsd: 0.0495 });
    expect(detail.critique!.unsupportedClaims.map((c) => c.claim)).toContain(
      'At batch 8 we measured 410 tokens/s.',
    );

    const call = (complete.mock.calls as unknown as unknown[][])[0]![0] as {
      temperature: number;
      maxTokens: number;
      messages: { content: string }[];
    };
    expect(call.temperature).toBe(0);
    expect(call.maxTokens).toBeGreaterThan(0);
    expect(call.messages[0]!.content).toContain('<book_section number="1.1" title="Batching">');
  });

  it('fails the submission with the reason when the model call fails', async () => {
    const llm = {
      provider: 'anthropic',
      model: 'm',
      complete: vi.fn(async () => {
        throw new Error('schema failed twice');
      }),
    } as unknown as LlmClient;
    const critique = createCritiqueRunner(testDb(), content, llm);
    const user = await registeredAgent(testApp({ content }));
    void user;
    const owner = await testDb().user.findFirstOrThrow();
    const row = await testDb().submission.create({
      data: {
        userId: owner.id,
        projectSlug: project01.slug,
        version: 1,
        repoUrl: 'https://github.com/a/b',
        status: 'critiquing',
        artifacts: report.artifacts,
      },
    });
    await critique(row.id);
    const after = await testDb().submission.findUniqueOrThrow({ where: { id: row.id } });
    expect(after).toMatchObject({
      status: 'failed',
      failure: 'The critique could not be completed: schema failed twice',
    });
  });
});
