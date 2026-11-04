import { describe, expect, it } from 'vitest';
import {
  caseStudySchema,
  extractDecision,
  portfolioSettingsRequestSchema,
  publicProfileSchema,
  usernameSchema,
} from './portfolio';

describe('extractDecision', () => {
  it('takes the first sentence of the first section', () => {
    const readme = [
      '# Speculation benchmark',
      '',
      'Some intro under the title.',
      '',
      '## Decision',
      '',
      'Use **n-gram** speculation at batch 1: it cut P50 by 31% at 2.5 req/s. Draft-target lost.',
      '',
      '## Method',
      'Details.',
    ].join('\n');
    expect(extractDecision(readme)).toBe(
      'Use n-gram speculation at batch 1: it cut P50 by 31% at 2.5 req/s.',
    );
  });

  it('falls back to the text under the title when there is no section', () => {
    expect(extractDecision('# Title\n\nShip [vLLM](https://x.y) on one GPU.\n')).toBe(
      'Ship vLLM on one GPU.',
    );
  });

  it('skips headings, images, tables and code before the prose', () => {
    const readme = '## Decision\n\n![chart](a.png)\n\n| a | b |\n\n- Keep FP8 weights\n';
    expect(extractDecision(readme)).toBe('Keep FP8 weights');
  });

  it('caps a long sentence', () => {
    const decision = extractDecision(`## Decision\n\n${'word '.repeat(80)}`)!;
    expect(decision.length).toBe(240);
    expect(decision.endsWith('…')).toBe(true);
  });

  it.each([null, '', '# Only a title\n', '## Decision\n\n```\ncode\n```\n'])(
    'returns null without prose (%j)',
    (readme) => {
      expect(extractDecision(readme)).toBeNull();
    },
  );
});

describe('usernameSchema', () => {
  it.each(['tofa', 'tofa-farinu', 'abc', 'a1b2'])('accepts %s', (name) => {
    expect(usernameSchema.parse(name)).toBe(name);
  });

  it('lowercases and trims', () => {
    expect(usernameSchema.parse('  Tofa ')).toBe('tofa');
  });

  it.each(['ab', '-tofa', 'tofa-', 'to--fa', 'to fa', 'tófa', 'a'.repeat(33)])(
    'refuses %j',
    (name) => {
      expect(usernameSchema.safeParse(name).success).toBe(false);
    },
  );
});

describe('portfolioSettingsRequestSchema', () => {
  it('needs a username before the page goes live', () => {
    const result = portfolioSettingsRequestSchema.safeParse({ username: null, pageLive: true });
    expect(result.success).toBe(false);
    expect(
      portfolioSettingsRequestSchema.safeParse({ username: null, pageLive: false }).success,
    ).toBe(true);
  });
});

describe('public views', () => {
  it('reject private critique fields', () => {
    const study = {
      username: 'tofa',
      displayName: 'Tofa',
      slug: '01-latency-budget-audit',
      number: 1,
      title: 'Latency budget audit',
      chapter: { number: 1, title: 'Prerequisites' },
      decision: null,
      charts: [],
      total: 84,
      dimensions: [{ dimension: 'Measurement', score: 34, max: 40 }],
      skillsDemonstrated: [],
      right: [],
      repoUrl: 'https://github.com/tofa/x',
      commitSha: null,
      version: 2,
      gradedAt: null,
    };
    expect(caseStudySchema.safeParse(study).success).toBe(true);
    expect(caseStudySchema.safeParse({ ...study, wrong: [] }).success).toBe(false);
    expect(
      caseStudySchema.safeParse({
        ...study,
        dimensions: [{ dimension: 'Measurement', score: 34, max: 40, reasoning: 'x' }],
      }).success,
    ).toBe(false);
    expect(
      publicProfileSchema.safeParse({
        username: 'tofa',
        displayName: 'Tofa',
        chaptersComplete: 1,
        chaptersTotal: 7,
        acceptanceRate: 0.8,
        skills: [],
        projects: [],
        email: 'tofa@example.com',
      }).success,
    ).toBe(false);
  });
});
