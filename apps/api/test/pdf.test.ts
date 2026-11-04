import type { CaseStudy } from '@forward-pass/shared';
import { describe, expect, it } from 'vitest';
import { caseStudyHtml, renderPdf } from '../src/portfolio/pdf';

const study: CaseStudy = {
  username: 'tofa',
  displayName: 'Tofa <script>',
  slug: '01-latency-budget-audit',
  number: 1,
  title: 'Latency budget & audit',
  chapter: { number: 1, title: 'Prerequisites' },
  decision: 'Ship at batch 8 "now".',
  charts: [{ name: 'p95.png', url: 'p95.png' }],
  total: 84,
  dimensions: [{ dimension: 'Measurement', score: 34, max: 40 }],
  skillsDemonstrated: ['latency percentiles'],
  right: ['Excludes warm-up.'],
  repoUrl: 'https://github.com/tofa/audit',
  commitSha: 'b'.repeat(40),
  version: 2,
  gradedAt: '2026-11-03T09:07:00.000Z',
};

describe('caseStudyHtml', () => {
  const html = caseStudyHtml(study, [{ name: 'p95.png', src: 'data:image/png;base64,AAAA' }]);

  it('escapes everything the learner wrote', () => {
    expect(html).toContain('Tofa &lt;script&gt;');
    expect(html).toContain('Latency budget &amp; audit');
    expect(html).toContain('Ship at batch 8 &quot;now&quot;.');
    expect(html).not.toContain('<script>');
  });

  it('carries the score, dimensions, charts, right list, skills and repo', () => {
    expect(html).toContain('84<small>/100</small>');
    expect(html).toContain('34/40');
    expect(html).toContain('width:85.0%');
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).toContain('Excludes warm-up.');
    expect(html).toContain('latency percentiles');
    expect(html).toContain('commit bbbbbbb');
    expect(html).toContain('https://github.com/tofa/audit');
  });

  it('uses the Foundations palette', () => {
    for (const colour of ['#0d2a1d', '#c9f25e', '#f3f1e8', '#fbfaf5'])
      expect(html).toContain(colour);
  });
});

describe('renderPdf', () => {
  it('renders a PDF with headless Chromium', async () => {
    const bytes = await renderPdf(caseStudyHtml(study, []));
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);
  }, 60_000);
});
