import {
  digestSchema,
  toPublicDigest,
  type BookResponse,
  type LessonResponse,
} from '@forward-pass/shared';

// Toy lessons for the fake API. Original text; nothing here comes from the book.

export const digest52 = digestSchema.parse({
  lesson: '5.2',
  oneLine: 'A cheap drafter guesses several tokens and the big model checks them all in one pass.',
  summary:
    'Decode is memory-bound, so checking a few guesses costs about as much as making one token (see 5.2.1).',
  mechanism: [
    { title: 'Draft', body: 'A small model proposes the next few tokens.' },
    { title: 'Verify', body: 'The target model scores every guess in one forward pass.' },
    { title: 'Accept', body: 'Keep the longest agreeing prefix, plus one token from the target.' },
  ],
  callout: { name: 'The intern rule', body: 'Checking a draft is faster than writing it.' },
  figureRefs: [{ figure: '5.3', lookFor: 'The drafter running ahead of the target.' }],
  keyCards: [
    {
      label: 'Speed',
      title: 'More tokens per pass',
      body: 'Accepted guesses come out of a single pass.',
    },
    { label: 'Cost', title: 'Wasted drafts', body: 'Rejected guesses still cost drafter time.' },
  ],
  workedExample: {
    title: 'Tokens per pass at draft length 4',
    setup: 'Each guess is accepted with probability 0.8, in this toy model.',
    table: {
      columns: ['Draft length', 'Expected tokens per pass'],
      rows: [
        [1, 1.8],
        [4, 3.4],
      ],
    },
    conclusion: { text: 'Longer drafts help, with shrinking returns.', keyNumber: '3.4 tokens' },
  },
  checkQuestion: {
    kind: 'scenario_mc',
    id: '5.2-check',
    sectionNumber: '5.2',
    subsectionNumber: '5.2.1',
    difficulty: 1,
    prompt: 'Which metric does speculation improve?',
    answerFormat: 'one option',
    options: ['Decode tokens per second', 'Time to first token', 'GPU memory use', 'Prompt length'],
    correctIndex: 0,
    acceptedCopy: 'Right: each pass emits more tokens (see 5.2.1).',
    rejectedCopy: 'Think about which phase the drafter speeds up.',
    hint: 'Prefill runs the same as before.',
    explanation: 'Speculation changes the decode loop; prefill is untouched.',
    reread: '5.2.1',
    sourceQuote: 'draft tokens',
  },
  reflect: {
    prompt: 'Why does a very long draft usually backfire?',
    modelAnswer: 'Acceptance falls with each extra guess, so later tokens are mostly wasted work.',
    points: ['Acceptance compounds.', 'Drafting costs time.', 'Returns shrink.'],
  },
  terms: ['Speculative decoding', 'Draft model', 'Acceptance rate'],
  subsectionCards: [
    {
      number: '5.2.1',
      title: 'Draft and Target',
      hook: 'Two models, one check.',
      readingMinutes: 1,
    },
  ],
});

const chapter5: NonNullable<LessonResponse['chapter']> = {
  number: 5,
  slug: 'techniques',
  title: 'Techniques',
  summary: 'Ways to get more out of the same hardware.',
  lessons: [
    {
      id: '5.2',
      title: 'Speculative Decoding',
      readState: 'reading',
      subsections: [{ number: '5.2.1', title: 'Draft and Target' }],
    },
  ],
};

export const lesson52: LessonResponse = {
  id: '5.2',
  kind: 'section',
  number: '5.2',
  title: 'Speculative Decoding',
  summary: 'Guess ahead, check in bulk.',
  readingMinutes: 4,
  hasCheckpoint: true,
  chapter: chapter5,
  intro: 'A short toy introduction.',
  subsections: [
    {
      number: '5.2.1',
      title: 'Draft and Target',
      markdown: 'A toy paragraph about drafting.\n\n| Draft | Accepted |\n| --- | --- |\n| 4 | 3 |',
      readingMinutes: 1,
    },
  ],
  figures: [
    {
      number: '5.3',
      caption: 'Figure 5.3: A drafter and a target.',
      url: '/api/figures/5.3',
      subsectionNumber: '5.2.1',
    },
  ],
  digest: toPublicDigest(digest52),
  terms: [
    {
      term: 'Speculative decoding',
      slug: 'speculative-decoding',
      definition: 'Guess, then verify.',
    },
  ],
  progress: { readState: 'reading', maxScrollPct: 20, confidence: null },
  check: null,
  note: null,
  partner: null,
  previous: null,
  next: { id: '5.3', title: 'Disaggregation' },
};

/** A section with no authored digest yet: the page falls back to the book text. */
export const lesson21: LessonResponse = {
  ...lesson52,
  id: '2.1',
  number: '2.1',
  title: 'Neural Networks',
  summary: 'Layers of matmuls.',
  hasCheckpoint: false,
  chapter: {
    ...chapter5,
    number: 2,
    slug: 'models',
    title: 'Models',
    lessons: [
      {
        id: '2.1',
        title: 'Neural Networks',
        readState: 'unread',
        subsections: [{ number: '2.1.1', title: 'Linear Layers' }],
      },
    ],
  },
  intro: 'Toy intro for the fallback view.',
  subsections: [
    {
      number: '2.1.1',
      title: 'Linear Layers',
      markdown: 'A toy paragraph about matmul.',
      readingMinutes: 1,
    },
  ],
  figures: [],
  digest: null,
  terms: [],
  progress: { readState: 'unread', maxScrollPct: 0, confidence: null },
  previous: null,
  next: null,
};

export const book: BookResponse = {
  frontMatter: [
    { slug: 'preface', title: 'Preface', summary: 'Why this book.', readState: 'read' },
  ],
  chapters: [
    {
      number: 0,
      slug: 'inference',
      title: 'Inference',
      summary: 'What inference is.',
      status: 'done',
      progressPct: 100,
      readState: 'read',
      sections: [],
    },
    {
      number: 5,
      slug: 'techniques',
      title: 'Techniques',
      summary: 'Ways to get more out of the same hardware.',
      status: 'reading',
      progressPct: 0,
      readState: 'reading',
      sections: [
        {
          number: '5.2',
          slug: 'speculative-decoding',
          title: 'Speculative Decoding',
          summary: 'Guess ahead, check in bulk.',
          readingMinutes: 4,
          readState: 'reading',
          confidence: 'shaky',
          checkpointScore: null,
        },
      ],
    },
  ],
  decoded: 0,
};
