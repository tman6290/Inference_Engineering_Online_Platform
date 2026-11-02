import type { z } from 'zod';
import type {
  calculationQuestionSchema,
  digestSchema,
  exerciseSchema,
  scenarioMcQuestionSchema,
  textQuestionSchema,
} from './content';

// Hand-written inputs for the schema and grader tests. Synthetic content, not from the book.

type Input<T extends z.ZodType> = z.input<T>;

const base = {
  sectionNumber: '9.1',
  subsectionNumber: '9.1.1',
  difficulty: 2,
  explanation: 'A batch of 8 shares one weight read, so the cost per request drops.',
  reread: '9.1.1',
  sourceQuote: 'Batching amortises the cost of reading the weights.',
} as const;

export const mcInput: Input<typeof scenarioMcQuestionSchema> = {
  kind: 'scenario_mc',
  id: '9.1-mc-01',
  ...base,
  prompt: 'Your server is memory-bound at batch 1. What raises throughput most?',
  answerFormat: 'one option',
  options: ['Larger batches', 'A faster CPU', 'More disk', 'Longer prompts'],
  correctIndex: 0,
  acceptedCopy: 'Right: batching shares each weight read across requests (see 9.1.1).',
  rejectedCopy: 'Think about what the GPU waits on at batch 1.',
  hint: 'What is read once per step, whatever the batch size?',
};

export const calcInput: Input<typeof calculationQuestionSchema> = {
  kind: 'calculation',
  id: '9.1-calc-01',
  ...base,
  prompt: 'A 7B-parameter model in FP16. How much memory do the weights need?',
  answerFormat: 'number, in GB',
  answer: 14,
  tolerance: { kind: 'relative', value: 0.05 },
  unit: 'GB',
  acceptedUnits: [
    { unit: 'MB', factor: 0.001 },
    { unit: 'Gb', factor: 0.125 },
  ],
  methodHint: 'Parameters × bytes per parameter.',
  workedSolution: '7e9 × 2 bytes = 14e9 bytes = 14 GB.',
};

export const textInput: Input<typeof textQuestionSchema> = {
  kind: 'text',
  id: '9.1-text-01',
  ...base,
  prompt: 'Name the latency metric for the wait before the first output token.',
  answerFormat: '****',
  acceptedAnswers: ['TTFT', 'time to first token'],
  normalisation: { foldHyphens: true },
  hint: 'It is an acronym of four letters.',
};

export const exerciseInput: Input<typeof exerciseSchema> = {
  id: '9.1-kv-budget',
  sectionNumber: '9.1',
  title: 'Budget the KV cache',
  brief: 'Work out how much memory a batch of requests needs for its KV cache.',
  steps: ['Write down the per-token KV size.', 'Multiply by tokens and batch size.'],
  answerFormat: 'number, in GB',
  answer: {
    kind: 'calculation',
    answer: 8,
    tolerance: { kind: 'absolute', value: 0.1 },
    unit: 'GB',
    acceptedUnits: [{ unit: 'MB', factor: 0.001 }],
  },
  solution: {
    walkthrough: '0.5 MB per token × 2,000 tokens × 8 requests = 8,000 MB = 8 GB.',
    finalAnswer: { kind: 'calculation', value: 8000, unit: 'MB' },
  },
  starterFiles: ['budget.py'],
  tests: { runner: 'pytest', command: 'pytest -q', files: ['test_budget.py'] },
  estimatedMinutes: 15,
};

export const digestInput: Input<typeof digestSchema> = {
  lesson: '9.1',
  oneLine: 'Batching trades a little latency for a lot of throughput.',
  summary: 'A memory-bound step costs the same at batch 1 and batch 8 (see 9.1.1).',
  mechanism: [
    { title: 'Read the weights', body: 'Every decode step streams all weights from memory once.' },
    { title: 'Share the read', body: 'Each request in the batch reuses that one read.' },
    { title: 'Hit compute', body: 'Past a point, arithmetic becomes the limit instead.' },
  ],
  callout: {
    name: 'The bus stop rule',
    body: 'A bus costs the same to run with one rider or forty.',
  },
  figureRefs: [{ figure: '9.1', lookFor: 'Where the throughput curve flattens.' }],
  keyCards: [
    { label: 'Bound', title: 'Memory first', body: 'Small batches wait on memory, not maths.' },
    { label: 'Knob', title: 'Batch size', body: 'The main lever on throughput per GPU.' },
  ],
  workedExample: {
    title: 'Throughput by batch',
    setup: 'A step takes 20 ms until batch 16.',
    table: {
      columns: ['Batch', 'Tokens/s'],
      rows: [
        [1, 50],
        [8, 400],
      ],
    },
    conclusion: {
      text: 'Batch 8 gives eight times the throughput for the same step time.',
      keyNumber: '8×',
    },
  },
  checkQuestion: { ...mcInput, id: '9.1-check' },
  reflect: {
    prompt: 'Explain why batch size barely changes step time at first.',
    modelAnswer: 'The step is dominated by reading weights, which is shared across the batch.',
    points: ['Weights are read once per step', 'The read is shared', 'Compute is idle at batch 1'],
  },
  terms: ['Batching', 'Throughput', 'Memory-bound'],
  subsectionCards: [
    {
      number: '9.1.1',
      title: 'Why batch',
      hook: 'One weight read, many requests.',
      readingMinutes: 4,
    },
  ],
};
