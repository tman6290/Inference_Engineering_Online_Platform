import type { CaseStudy } from '@forward-pass/shared';

// The case study as a printable A4 page. The HTML is self-contained (charts arrive as data:
// URIs), so rendering needs no web server and works the same in CI and in production.

const escape = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const pct = (score: number, max: number) => Math.max(0, Math.min(100, (score / max) * 100));

/** Foundations palette, Bricolage Grotesque and JetBrains Mono with system fallbacks. */
const STYLE = `
  @page { size: A4; margin: 16mm 16mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #0f1f17; background: #f3f1e8;
    font: 400 11pt/1.55 'Bricolage Grotesque', system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .mono, .eyebrow { font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace; }
  .eyebrow { font-size: 8pt; letter-spacing: 0.14em; text-transform: uppercase; color: #5b6b61; }
  h1 { margin: 4pt 0 6pt; font-size: 24pt; font-weight: 800; line-height: 1.15; }
  h2 { margin: 0 0 6pt; font-size: 13pt; font-weight: 700; }
  .decision { margin: 0 0 12pt; font-size: 13pt; }
  .verdict { display: flex; gap: 16pt; align-items: center; margin-bottom: 12pt; padding: 12pt 14pt;
    border-radius: 16px; background: #0d2a1d; color: #f3f1e8; }
  .score { font: 700 30pt/1 'JetBrains Mono', ui-monospace, monospace; color: #c9f25e; }
  .score small { font-size: 12pt; color: #9fb3a6; }
  .dims { flex: 1; display: grid; gap: 5pt; margin: 0; padding: 0; list-style: none; }
  .dim { display: grid; grid-template-columns: 1fr auto; gap: 2pt 8pt; font-size: 9.5pt; }
  .bar { grid-column: 1 / -1; height: 5px; border-radius: 99px; background: #1e4532; }
  .bar span { display: block; height: 100%; border-radius: 99px; background: #c9f25e; }
  .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 8pt; margin-bottom: 12pt; }
  .charts figure { margin: 0; padding: 6pt; border: 1px solid #dcd9cc; border-radius: 12px; background: #fbfaf5; }
  .charts img { display: block; width: 100%; height: auto; }
  .charts figcaption { margin-top: 4pt; font-size: 8pt; color: #5b6b61; }
  .card { margin-bottom: 10pt; padding: 10pt 12pt; border: 1px solid #dcd9cc; border-radius: 12px; background: #fbfaf5; break-inside: avoid; }
  ul { margin: 0; padding-left: 14pt; }
  li + li { margin-top: 3pt; }
  .chips { display: flex; flex-wrap: wrap; gap: 4pt; }
  .chip { padding: 2pt 8pt; border-radius: 99px; background: #ddf3e6; color: #0f4a2e; font-size: 9pt; }
  .foot { margin-top: 12pt; color: #5b6b61; font-size: 8.5pt; }
  a { color: #1b6a44; }
`;

export interface PdfChart {
  name: string;
  /** data:image/png;base64,… */
  src: string;
}

export function caseStudyHtml(study: CaseStudy, charts: PdfChart[]): string {
  const dims = study.dimensions
    .map(
      (dim) =>
        `<li class="dim"><span>${escape(dim.dimension)}</span>` +
        `<span class="mono">${dim.score}/${dim.max}</span>` +
        `<span class="bar"><span style="width:${pct(dim.score, dim.max).toFixed(1)}%"></span></span></li>`,
    )
    .join('');
  const chartFigures = charts
    .map(
      (chart) =>
        `<figure><img src="${chart.src}" alt="${escape(chart.name)}"><figcaption class="mono">${escape(chart.name)}</figcaption></figure>`,
    )
    .join('');
  const right = study.right.map((item) => `<li>${escape(item)}</li>`).join('');
  const skills = study.skillsDemonstrated
    .map((skill) => `<span class="chip">${escape(skill)}</span>`)
    .join('');
  const commit = study.commitSha ? ` · commit ${escape(study.commitSha.slice(0, 7))}` : '';
  const graded = study.gradedAt ? ` · graded ${escape(study.gradedAt.slice(0, 10))}` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escape(study.title)} · ${escape(study.displayName)}</title>
<style>${STYLE}</style>
</head>
<body>
<p class="eyebrow">Project ${String(study.number).padStart(2, '0')} · Chapter ${study.chapter.number} · ${escape(study.chapter.title)}</p>
<h1>${escape(study.title)}</h1>
${study.decision ? `<p class="decision">${escape(study.decision)}</p>` : ''}
<section class="verdict" aria-label="Score">
  <p class="score">${study.total}<small>/100</small></p>
  <ul class="dims">${dims}</ul>
</section>
${chartFigures ? `<section class="charts" aria-label="Charts">${chartFigures}</section>` : ''}
${right ? `<section class="card"><h2>What the critique found right</h2><ul>${right}</ul></section>` : ''}
${skills ? `<section class="card"><h2>Skills demonstrated</h2><div class="chips">${skills}</div></section>` : ''}
<p class="foot mono">${escape(study.displayName)} · v${study.version}${commit}${graded} · <a href="${escape(study.repoUrl)}">${escape(study.repoUrl)}</a></p>
</body>
</html>`;
}

/** Thrown when no Chromium is installed for Playwright. */
export class PdfUnavailableError extends Error {}

/** Renders HTML to an A4 PDF with headless Chromium. */
export async function renderPdf(html: string): Promise<Buffer> {
  const { chromium } = await import('playwright');
  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    throw new PdfUnavailableError(
      `Chromium is not available for PDF rendering (${(error as Error).message.split('\n')[0]}). ` +
        'Run `pnpm --filter @forward-pass/api exec playwright install chromium`.',
    );
  }
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    return Buffer.from(
      await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }),
    );
  } finally {
    await browser.close();
  }
}
