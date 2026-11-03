import type {
  GlossaryPage,
  HomeResponse,
  ProgressPage,
  SearchResponse,
  SearchResult,
} from '@forward-pass/shared';

// Fixed Home and Progress data for page tests. Monday 26 October 2026 to Tuesday 3 November 2026
// closes out twelve weeks of heatmap cells.

const TODAY = '2026-11-03';

function twelveWeeks(): ProgressPage['days'] {
  const days: ProgressPage['days'] = [];
  const start = Date.parse('2026-08-17T00:00:00Z'); // a Monday, 11 weeks before 26 October
  for (let i = 0; ; i++) {
    const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    const intensity = i % 5 === 0 ? 0 : (i % 3) + 1;
    days.push({
      date,
      intensity,
      readingMinutes: intensity * 20,
      sectionsRead: i % 7 === 0 ? 1 : 0,
      answersGraded: intensity * 2,
    });
    if (date === TODAY) return days;
  }
}

export const home: HomeResponse = {
  today: TODAY,
  continue: {
    lessonId: '5.2',
    title: 'Speculative Decoding',
    number: '5.2',
    chapter: { number: 5, title: 'Techniques' },
    position: { index: 2, of: 5 },
    maxScrollPct: 38,
    minutesLeft: 12,
    hasCheckpoint: true,
  },
  tiles: {
    decoded: 15,
    acceptanceRate: 0.83,
    projectsShipped: 0,
    projectsTotal: 7,
    weekMinutes: 220,
    weekDays: [100, 120, 0, 0, 0, 0, 0],
    weekGoalMinutes: 300,
  },
  standings: [
    {
      id: 'u1',
      displayName: 'Tofa',
      initial: 'T',
      colour: 'lime',
      isYou: true,
      decoded: 15,
      acceptanceRate: 0.83,
      projectsShipped: 0,
      uptime: 4,
      lastActivity: {
        at: '2026-11-03T08:00:00.000Z',
        lessonId: '5.2',
        title: 'Speculative Decoding',
      },
    },
    {
      id: 'u2',
      displayName: 'Friend',
      initial: 'F',
      colour: 'butter',
      isYou: false,
      decoded: 17,
      acceptanceRate: 0.77,
      projectsShipped: 0,
      uptime: 9,
      lastActivity: null,
    },
  ],
  nextProject: {
    chapterNumber: 5,
    chapterTitle: 'Techniques',
    unlockAfter: '5.5',
    unlocked: false,
  },
  shaky: [
    { lessonId: '2.4', title: 'Arithmetic Intensity', reason: 'rated-shaky', acceptance: null },
    { lessonId: '1.3', title: 'Fine-Tuning', reason: 'low-score', acceptance: 0.5 },
  ],
};

export const progress: ProgressPage = {
  today: TODAY,
  days: twelveWeeks(),
  uptime: { current: 4, longest: 11 },
  stats: {
    readingHours: 31.5,
    decoded: 15,
    sectionsPerWeek: 1.8,
    projectedFinish: '2027-01-30',
    acceptanceRate: 0.83,
  },
  patterns: { bestWeekday: 1, typicalSessionMinutes: 28, lastGapDays: 2 },
  partner: { displayName: 'Friend', sectionsPerWeek: 2.1, uptime: 9, readingHours: 35 },
  mastery: [
    {
      number: 1,
      title: 'Prerequisites',
      mine: 0.72,
      partner: 0.65,
      sections: [
        { number: '1.1', title: 'Cost', mine: 0.8, partner: 0.7 },
        { number: '1.2', title: 'Use Cases', mine: 0.64, partner: 0.6 },
      ],
    },
  ],
  recall: [
    { lessonId: '1.1', title: 'Cost', confidence: 'solid', ratedAt: '2026-10-01T09:00:00.000Z' },
  ],
};

export const glossary: GlossaryPage = {
  terms: [
    {
      term: '4-bit quantization',
      slug: '4-bit-quantization',
      definition: 'Storing weights in four bits.',
      sectionNumber: null,
      introducedIn: null,
      usedIn: [],
    },
    {
      term: 'KV cache',
      slug: 'kv-cache',
      definition: 'Stored **keys** and values from earlier tokens.',
      sectionNumber: '2.2',
      introducedIn: { id: '2.2', title: 'LLM Inference Mechanics' },
      usedIn: [{ id: '0', title: 'Inference' }],
    },
    {
      term: 'Speculative decoding',
      slug: 'speculative-decoding',
      definition: 'Guess several tokens with a drafter, then verify them in one pass.',
      sectionNumber: '5.2',
      introducedIn: { id: '5.2', title: 'Speculative Decoding' },
      usedIn: [{ id: '5.2', title: 'Speculative Decoding' }],
    },
  ],
};

const searchable: SearchResult[] = [
  {
    type: 'section',
    id: '5.2',
    title: '5.2 Speculative Decoding',
    subtitle: 'Guess ahead, check in bulk.',
    href: '/book/5.2',
  },
  {
    type: 'section',
    id: '5.3',
    title: '5.3 Disaggregation',
    subtitle: 'Prefill and decode apart.',
    href: '/book/5.3',
  },
  {
    type: 'term',
    id: 'speculative-decoding',
    title: 'Speculative decoding',
    subtitle: 'Guess, then verify.',
    href: '/glossary#speculative-decoding',
  },
  {
    type: 'exercise',
    id: '5.2-toy-speedup',
    title: 'Work out a toy speedup',
    subtitle: '5.2 Speculative Decoding · 10 min',
    href: '/book/5.2/exercises/5.2-toy-speedup',
  },
];

/** A stand-in for GET /api/search: case-insensitive substring match on titles. */
export function fakeSearch(q: string): SearchResponse {
  const needle = q.trim().toLowerCase();
  const labels = { section: 'Sections', term: 'Glossary', exercise: 'Exercises' } as const;
  const groups = (['section', 'term', 'exercise'] as const)
    .map((type) => ({
      type,
      label: labels[type],
      results: needle
        ? searchable.filter((r) => r.type === type && r.title.toLowerCase().includes(needle))
        : [],
    }))
    .filter((group) => group.results.length);
  return { query: q, groups };
}
