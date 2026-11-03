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

/** Writes a content folder with the 1.1 digest; returns its path. */
export function writeContent(root: string, digest: unknown = digest11): string {
  const dir = path.join(root, 'content');
  const digests = path.join(dir, 'chapters', '01-serving', 'digests');
  mkdirSync(digests, { recursive: true });
  writeFileSync(path.join(digests, '1.1.json'), JSON.stringify(digest));
  return dir;
}
