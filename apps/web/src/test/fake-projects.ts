import type {
  ProjectCard,
  ProjectDetail,
  SubmissionDetail,
  SubmissionSummary,
} from '@forward-pass/shared';

// A toy projects backend for page tests. Project 01 has two graded versions, the latest with a
// full critique; 02 is mid-critique; 03 is open and untouched; 04 to 07 are locked.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const REPO = 'https://github.com/tofa/latency-budget-audit';

function summary(overrides: Partial<SubmissionSummary>): SubmissionSummary {
  return {
    id: 'sub-1',
    version: 1,
    status: 'graded',
    repoUrl: REPO,
    commitSha: 'a'.repeat(40),
    createdAt: '2026-11-02T10:00:00.000Z',
    gradedAt: '2026-11-02T10:06:00.000Z',
    total: 62,
    portfolioReady: false,
    ...overrides,
  };
}

const TITLES: [string, string, number, string, string][] = [
  ['01-latency-budget-audit', 'Latency budget audit', 1, 'Prerequisites', '1.4'],
  ['02-roofline-calculator', 'Roofline calculator', 2, 'Models', '2.5'],
  ['03-local-inference-fit', 'Local inference fit', 3, 'Hardware', '3.5'],
  ['04-engine-load-test', 'Engine load test', 4, 'Software', '4.5'],
  ['05-speculation-benchmark', 'Speculation benchmark', 5, 'Techniques', '5.5'],
  ['06-embedding-two-profiles', 'Embedding two profiles', 6, 'Modalities', '6.6'],
  ['07-zero-downtime-deploy-drill', 'Zero-downtime deploy drill', 7, 'Production', '7.6'],
];

export const latestV2 = summary({
  id: 'sub-2',
  version: 2,
  commitSha: 'b'.repeat(40),
  createdAt: '2026-11-03T09:00:00.000Z',
  gradedAt: '2026-11-03T09:07:00.000Z',
  total: 84,
  portfolioReady: true,
});

export const critiqueOfV2: SubmissionDetail = {
  ...latestV2,
  projectSlug: '01-latency-budget-audit',
  noteToGrader: 'P95 now comes from 500 requests.',
  failure: null,
  checks: [
    {
      checkId: 'files',
      kind: 'files',
      label: 'Required files are present',
      passed: true,
      log: 'README.md\nresults.json',
      durationMs: 120,
    },
    {
      checkId: 'readme',
      kind: 'readme',
      label: 'README has the required sections',
      passed: true,
      log: 'ok',
      durationMs: 40,
    },
    {
      checkId: 'run',
      kind: 'run',
      label: 'make check finishes on CPU',
      passed: false,
      log: 'pytest: 1 failed',
      durationMs: 41_200,
    },
  ],
  files: [{ name: 'latency.png', mime: 'image/png', size: 48_000 }],
  critique: {
    total: 84,
    headline: 'A clear budget, let down by one unbacked tail claim',
    dimensions: [
      { dimension: 'Measurement', score: 34, max: 40, reasoning: 'Warm-up excluded; 500 samples.' },
      { dimension: 'Analysis', score: 30, max: 35, reasoning: 'Budget split per stage is sound.' },
      { dimension: 'Write-up', score: 20, max: 25, reasoning: 'The decision leads the README.' },
    ],
    right: ['Separates time to first token from time per output token (see 1.4.2).'],
    wrong: [
      {
        text: 'The run check fails on a missing fixture.',
        evidence: { kind: 'check', ref: 'run' },
      },
    ],
    workOn: [{ step: 'Report P99 alongside P95 for the tail.', section: '1.4' }],
    inlineComments: [
      { path: 'bench/measure.py', line: 42, body: 'Time the first token separately.' },
    ],
    unsupportedClaims: [{ claim: 'P99 stays under 300 ms', why: 'results.json has no p99 field.' }],
    portfolioReady: true,
    skillsDemonstrated: ['latency percentiles', 'load generation'],
    model: 'test-model',
    costUsd: 0.0123,
    createdAt: '2026-11-03T09:07:00.000Z',
  },
};

function card(index: number): ProjectCard {
  const [slug, title, number, chapterTitle, unlockAfter] = TITLES[index]!;
  return {
    slug,
    number,
    title,
    chapter: { number, title: chapterTitle },
    summary: `Summary of ${title.toLowerCase()}.`,
    estimatedHours: 6,
    needsGpu: number >= 4,
    skills: ['measurement'],
    unlockAfter,
    unlocked: number <= 3,
    mine: null,
    partner: null,
  };
}

function detail(base: ProjectCard, submissions: SubmissionSummary[]): ProjectDetail {
  return {
    ...base,
    mine: submissions[0] ?? null,
    brief: `## The task\n\nBuild the ${base.title.toLowerCase()}.`,
    deliverables: ['A repo with README.md and results.json'],
    constraints: ['CPU only for the checks'],
    rubric: [
      { dimension: 'Measurement', weight: 40, criteria: ['Warm-up excluded'] },
      { dimension: 'Analysis', weight: 35, criteria: ['Budget per stage'] },
      { dimension: 'Write-up', weight: 25, criteria: ['Decision first'] },
    ],
    requiredFiles: ['README.md', 'results.json'],
    readmeSections: ['Decision', 'Method'],
    checks: [
      { id: 'files', kind: 'files', label: 'Required files are present' },
      { id: 'readme', kind: 'readme', label: 'README has the required sections' },
      { id: 'run', kind: 'run', label: 'make check finishes on CPU' },
    ],
    hasResultsSchema: true,
    bookSections: [{ number: '1.4', title: 'Measuring Latency and Throughput' }],
    submissions,
    critiquesLeftThisHour: 3,
  };
}

export function createFakeProjects() {
  const cards = TITLES.map((_, index) => card(index));
  cards[0] = {
    ...cards[0]!,
    mine: latestV2,
    partner: { displayName: 'Friend', version: 1, total: 71 },
  };
  cards[1] = {
    ...cards[1]!,
    mine: summary({
      id: 'sub-3',
      status: 'critiquing',
      total: null,
      portfolioReady: null,
      gradedAt: null,
    }),
  };
  cards[2] = { ...cards[2]!, partner: { displayName: 'Friend', version: 1, total: null } };

  const submissions: Record<string, SubmissionSummary[]> = {
    '01-latency-budget-audit': [latestV2, summary({})],
    '02-roofline-calculator': [cards[1].mine!],
  };
  const details: Record<string, SubmissionDetail> = {
    'sub-2': critiqueOfV2,
    'sub-1': {
      ...summary({}),
      projectSlug: '01-latency-budget-audit',
      noteToGrader: null,
      failure: null,
      checks: [],
      files: [],
      critique: null,
    },
  };
  const posted: unknown[] = [];

  function handle(path: string, method: string, body: unknown): Response | null {
    if (path === '/api/projects' && method === 'GET') {
      return json(200, {
        projects: cards.map((entry) => ({
          ...entry,
          mine: submissions[entry.slug]?.[0] ?? entry.mine,
        })),
      });
    }
    const project = /^\/api\/projects\/([^/]+)(\/submissions)?$/.exec(path);
    if (project) {
      const slug = decodeURIComponent(project[1]!);
      const base = cards.find((entry) => entry.slug === slug);
      if (!base) return json(404, { error: 'not_found', message: 'No such project.' });
      if (!project[2]) return json(200, detail(base, submissions[slug] ?? []));
      if (method !== 'POST') return json(405, { error: 'method_not_allowed' });

      posted.push(body);
      const list = (submissions[slug] ??= []);
      const created = summary({
        id: `sub-new-${list.length + 1}`,
        version: list.length + 1,
        status: 'queued',
        repoUrl: (body as { repoUrl: string }).repoUrl,
        commitSha: null,
        gradedAt: null,
        total: null,
        portfolioReady: null,
      });
      list.unshift(created);
      details[created.id] = {
        ...created,
        projectSlug: slug,
        noteToGrader: null,
        failure: null,
        checks: [],
        files: [],
        critique: null,
      };
      return json(201, created);
    }
    const submission = /^\/api\/submissions\/([^/]+)$/.exec(path);
    if (submission) {
      const found = details[decodeURIComponent(submission[1]!)];
      return found ? json(200, found) : json(404, { error: 'not_found' });
    }
    return null;
  }

  return { handle, posted };
}
