import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// A digest for the synthetic fixture book's section 1.1 (see ./book.ts). Original toy text.

export const digest11 = {
  lesson: '1.1',
  oneLine:
    'Batching lets one forward pass serve several requests, so the weights are read once for all of them.',
  summary:
    'A toy engine reads its weights once per step. **Batching** spreads that read across requests (see 1.1.1).',
  mechanism: [
    { title: 'Queue requests', body: 'Requests wait briefly so several arrive together.' },
    { title: 'Share one pass', body: 'One forward pass computes a token for each request.' },
    {
      title: 'Refill continuously',
      body: 'Finished requests leave and new ones join between steps.',
    },
  ],
  callout: {
    name: 'The bus rule',
    body: 'A bus costs about the same to drive full or empty, so fill it.',
  },
  figureRefs: [{ figure: '1.1', lookFor: 'Four requests sharing a single pass.' }],
  keyCards: [
    {
      label: 'Throughput',
      title: 'Grows with batch size',
      body: 'More requests per pass, until compute runs out.',
    },
    {
      label: 'Latency',
      title: 'Waits add up',
      body: 'Waiting to fill a batch delays each request a little.',
    },
  ],
  workedExample: {
    title: 'Tokens per second at batch 4',
    setup: 'A pass takes 20 ms whatever the batch size, in this toy model.',
    table: {
      columns: ['Batch', 'Tokens per pass', 'Tokens per second'],
      rows: [
        [1, 1, 50],
        [4, 4, 200],
      ],
    },
    conclusion: { text: 'Batch 4 gives four times the throughput.', keyNumber: '200 tokens/s' },
  },
  checkQuestion: {
    kind: 'scenario_mc',
    id: '1.1-check',
    sectionNumber: '1.1',
    subsectionNumber: '1.1.1',
    difficulty: 1,
    prompt: 'Your toy server is idle between requests. What raises throughput most?',
    answerFormat: 'one option',
    options: ['Batch the requests', 'Buy a bigger disk', 'Shorten the logs', 'Restart nightly'],
    correctIndex: 0,
    acceptedCopy: 'Right: batching shares each pass (see 1.1.1).',
    rejectedCopy: 'Think about what each pass does once, whatever the batch.',
    hint: 'What is shared when requests run together?',
    explanation: 'Batching shares the weight read; a disk does nothing for a compute-bound pass.',
    reread: '1.1.1',
    sourceQuote: 'groups several requests',
  },
  reflect: {
    prompt: 'Why does waiting for a fuller batch cost latency?',
    modelAnswer: 'Each request waits until enough others arrive, so the first token comes later.',
    points: ['Requests wait to be grouped.', 'Throughput rises.', 'Latency rises a little.'],
  },
  terms: ['Batching', 'KV cache', 'Throughput (TPS)'],
  subsectionCards: [
    {
      number: '1.1.1',
      title: 'Static Batches',
      hook: 'Wait until the batch is full.',
      readingMinutes: 1,
    },
    {
      number: '1.1.2',
      title: 'Continuous Batching',
      hook: 'Join and leave between steps.',
      readingMinutes: 1,
    },
  ],
};

const base = (id: string) => ({
  id,
  sectionNumber: '1.1',
  subsectionNumber: '1.1.1',
  difficulty: 1,
  explanation: `Why ${id} is right.`,
  reread: '1.1.1',
  sourceQuote: 'groups several requests',
});

/** A 24-question bank for 1.1: 10 scenario_mc, 7 calculation, 7 text. Option 0 is always right. */
export const bank11 = {
  sectionNumber: '1.1',
  questions: [
    ...Array.from({ length: 10 }, (_, i) => ({
      ...base(`1.1-mc-${i}`),
      kind: 'scenario_mc',
      prompt: `Toy scenario ${i}?`,
      answerFormat: 'one option',
      options: [`Right ${i}`, `Wrong a ${i}`, `Wrong b ${i}`, `Wrong c ${i}`],
      correctIndex: 0,
      acceptedCopy: `Yes, option ${i} (see 1.1.1).`,
      rejectedCopy: `Not that one ${i}.`,
      hint: `Hint for mc ${i}.`,
    })),
    ...Array.from({ length: 7 }, (_, i) => ({
      ...base(`1.1-calc-${i}`),
      kind: 'calculation',
      prompt: `Toy sum ${i}?`,
      answerFormat: 'number, in GB',
      answer: 10 + i,
      tolerance: { kind: 'relative', value: 0.05 },
      unit: 'GB',
      acceptedUnits: [{ unit: 'MB', factor: 0.001 }],
      methodHint: `Method for calc ${i}.`,
      workedSolution: `Worked solution ${i}.`,
    })),
    ...Array.from({ length: 7 }, (_, i) => ({
      ...base(`1.1-text-${i}`),
      kind: 'text',
      prompt: `Toy word ${i}?`,
      answerFormat: '*****',
      acceptedAnswers: [`answer ${i}`],
      hint: `Hint for text ${i}.`,
    })),
  ],
};

type FixtureQuestion = (typeof bank11.questions)[number];

/** The right answer to a fixture question, as a learner would submit it. */
export function rightAnswer(id: string) {
  const question = bank11.questions.find((q) => q.id === id) as FixtureQuestion & {
    answer?: number;
  };
  if (question.kind === 'scenario_mc') return { kind: 'scenario_mc', choice: 0 };
  if (question.kind === 'calculation') return { kind: 'calculation', value: question.answer! };
  return { kind: 'text', text: id.replace('1.1-text-', 'Answer ') };
}

export function wrongAnswer(id: string) {
  const kind = bank11.questions.find((q) => q.id === id)!.kind;
  if (kind === 'scenario_mc') return { kind: 'scenario_mc', choice: 2 };
  if (kind === 'calculation') return { kind: 'calculation', value: 9999 };
  return { kind: 'text', text: 'nope' };
}

export const exercise11 = {
  id: '1.1-toy-batch',
  sectionNumber: '1.1',
  title: 'Batch four toy requests',
  brief: 'A pass takes 20 ms. Work out tokens per second at batch 4.',
  steps: ['Count tokens per pass.', 'Divide by the pass time.'],
  answerFormat: 'number, in tokens/s',
  answer: {
    kind: 'calculation',
    answer: 200,
    tolerance: { kind: 'absolute', value: 1 },
    unit: 'tokens/s',
    acceptedUnits: [],
  },
  solution: {
    walkthrough: 'Four tokens per 20 ms pass is **200 tokens/s**.',
    finalAnswer: { kind: 'calculation', value: 200, unit: 'tokens/s' },
  },
  starterFiles: ['starter.py'],
  tests: { runner: 'pytest', command: 'python -m pytest -q', files: ['test_starter.py'] },
  estimatedMinutes: 5,
};

/** A toy project for chapter 1 that opens after the 1.1 checkpoint. */
export const project01 = {
  slug: '01-toy-batching',
  number: 1,
  title: 'Batch a toy server',
  chapter: 1,
  unlockAfterSection: '1.1',
  estimatedHours: 4,
  needsGpu: false,
  summary: 'Measure what batching buys a toy server.',
  deliverables: ['A README that opens with the decision', 'results.json'],
  constraints: ['CPU only'],
  skills: ['batching', 'benchmarking'],
  rubric: [
    { dimension: 'Correctness', weight: 60, criteria: ['Numbers come from runs'] },
    { dimension: 'Writing', weight: 40, criteria: ['The decision comes first'] },
  ],
  requiredFiles: ['README.md', 'results.json', 'bench/*.py'],
  readmeSections: ['Decision', 'Results'],
  resultsSchema: {
    type: 'object',
    required: ['runs'],
    properties: {
      runs: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['batch', 'tps'],
          properties: { batch: { type: 'integer' }, tps: { type: 'number' } },
        },
      },
    },
  },
  checks: [
    { id: 'files', kind: 'files', label: 'Required files exist' },
    { id: 'readme', kind: 'readme', label: 'README has its sections' },
    { id: 'results', kind: 'results', label: 'results.json matches the schema' },
    { id: 'dry-run', kind: 'run', label: 'make check passes', cmd: 'make check', timeoutSec: 60 },
  ],
  bookSections: ['1.1'],
};

/**
 * Writes a content folder with the 1.1 digest, and optionally its checkpoint bank, an exercise
 * with starter, test and solution files, and a project; returns its path.
 */
export function writeContent(
  root: string,
  digest: unknown = digest11,
  { bank, exercise, project }: { bank?: unknown; exercise?: unknown; project?: unknown } = {},
): string {
  const dir = path.join(root, 'content');
  const chapter = path.join(dir, 'chapters', '01-serving');
  const digests = path.join(chapter, 'digests');
  mkdirSync(digests, { recursive: true });
  writeFileSync(path.join(digests, '1.1.json'), JSON.stringify(digest));
  if (bank) {
    mkdirSync(path.join(chapter, 'checkpoints'), { recursive: true });
    writeFileSync(path.join(chapter, 'checkpoints', '1.1.json'), JSON.stringify(bank));
  }
  const exercises: string[] = [];
  if (exercise) {
    const id = (exercise as { id: string }).id;
    const folder = path.join(chapter, 'exercises', id);
    mkdirSync(path.join(folder, 'solution'), { recursive: true });
    writeFileSync(path.join(folder, 'exercise.json'), JSON.stringify(exercise));
    writeFileSync(
      path.join(folder, 'starter.py'),
      'def tokens_per_second():\n    raise NotImplementedError\n',
    );
    writeFileSync(path.join(folder, 'test_starter.py'), 'def test_it():\n    assert True\n');
    writeFileSync(
      path.join(folder, 'solution', 'starter.py'),
      'def tokens_per_second():\n    return 200\n',
    );
    exercises.push(id);
  }
  if (project) {
    const slug = (project as { slug: string }).slug;
    const folder = path.join(dir, 'projects', slug);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, 'project.json'), JSON.stringify(project));
    writeFileSync(path.join(folder, 'README.md'), '# Batch a toy server\n\nMeasure it.\n');
  }
  writeFileSync(
    path.join(chapter, 'chapter.json'),
    JSON.stringify({ slug: '01-serving', title: 'Serving', lessons: ['1.1'], exercises }),
  );
  return dir;
}
