// Parsers for the book's published Markdown (llms.txt index, chapter, section and glossary files).
// Pure functions: no I/O, so they're tested against synthetic fixtures.

export type IndexEntry =
  | {
      kind: 'front' | 'back';
      slug: string;
      title: string;
      summary: string;
      url: string;
      path: string;
    }
  | {
      kind: 'chapter';
      number: number;
      slug: string;
      title: string;
      summary: string;
      url: string;
      path: string;
    }
  | {
      kind: 'section';
      number: string;
      chapterNumber: number;
      slug: string;
      title: string;
      summary: string;
      url: string;
      path: string;
    };

export const GLOSSARY_SLUG = 'appendix-a-inference-glossary';

const LINK_LINE = /^- \[([^\]]+)\]\((https?:\/\/[^)\s]+)\)(?::\s*(.*))?$/;

/** Path of a book page relative to the book root, e.g. "05-techniques/5.2-speculative-decoding.md". */
function bookPath(url: string): string | null {
  const match = /\/book\/(.+\.md)$/.exec(new URL(url).pathname);
  return match ? match[1]! : null;
}

/**
 * Reads llms.txt into an ordered list of pages. Ignores the overview, the full-text dump and
 * the landing page; those aren't part of the reading order.
 */
export function parseIndex(text: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  let placement: 'front' | 'back' = 'front';

  for (const line of text.split(/\r?\n/)) {
    const match = LINK_LINE.exec(line.trim());
    if (!match) continue;
    const [, rawTitle, url, rawSummary] = match as unknown as [string, string, string, string?];
    const summary = (rawSummary ?? '').trim();
    const path = bookPath(url);
    if (!path || path === 'overview.md') continue;

    const chapter = /^(\d{2})-([a-z0-9-]+)\.md$/.exec(path);
    if (chapter) {
      placement = 'back';
      entries.push({
        kind: 'chapter',
        number: Number(chapter[1]),
        slug: `${chapter[1]}-${chapter[2]}`,
        title: rawTitle.replace(/^Chapter \d+:\s*/, '').trim(),
        summary,
        url,
        path,
      });
      continue;
    }

    const section = /^(\d{2})-[a-z0-9-]+\/(\d+\.\d+)-([a-z0-9-]+)\.md$/.exec(path);
    if (section) {
      entries.push({
        kind: 'section',
        number: section[2]!,
        chapterNumber: Number(section[1]),
        slug: section[3]!,
        title: rawTitle.replace(/^\d+\.\d+\s+/, '').trim(),
        summary,
        url,
        path,
      });
      continue;
    }

    entries.push({
      kind: placement,
      slug: path.replace(/\.md$/, ''),
      title: rawTitle.trim(),
      summary,
      url,
      path,
    });
  }
  return entries;
}

export interface ParsedFigure {
  number: string;
  caption: string;
  sourceUrl: string;
  subsectionNumber: string | null;
}

export interface ParsedSubsection {
  number: string;
  title: string;
  markdown: string;
}

export interface ParsedSection {
  title: string;
  intro: string;
  subsections: ParsedSubsection[];
  figures: ParsedFigure[];
  boldTerms: string[];
  wordCount: number;
}

/** Removes the leading H1 and the copyright line that every page starts with. */
export function stripPageHeader(markdown: string): { title: string; body: string } {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let title = '';
  let start = 0;
  if (lines[0]?.startsWith('# ')) {
    title = lines[0].slice(2).trim();
    start = 1;
  }
  const rest = lines.slice(start);
  const copyright = rest.findIndex((line) => line.trim().length > 0);
  if (copyright >= 0 && /^_Inference Engineering_ by /.test(rest[copyright]!.trim())) {
    rest.splice(copyright, 1);
  }
  return { title, body: rest.join('\n').trim() };
}

// Chapter figures are "Figure 5.3"; the Preface's are "Figure P.1".
const FIGURE = /!\[Figure ((?:\d+|P)\.\d+):?\s*([^\]]*)\]\(([^)\s]+)\)/g;

export function figuresIn(
  markdown: string,
  subsectionNumber: string | null = null,
): ParsedFigure[] {
  return Array.from(markdown.matchAll(FIGURE), (match) => ({
    number: match[1]!,
    caption: match[2]!.trim(),
    sourceUrl: match[3]!,
    subsectionNumber,
  }));
}

/** Images that don't follow the "Figure N.M:" caption pattern; reported, not stored. */
export function countUnnumberedImages(markdown: string): number {
  const all = markdown.match(/!\[[^\]]*\]\([^)]+\)/g)?.length ?? 0;
  const numbered = markdown.match(FIGURE)?.length ?? 0;
  return all - numbered;
}

export function countWords(markdown: string): number {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/[#*_`>|-]/g, ' ');
  return text.split(/\s+/).filter((word) => /\w/.test(word)).length;
}

export function readingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 230));
}

function boldTermsIn(markdown: string): string[] {
  const terms = new Set<string>();
  for (const match of markdown.matchAll(/\*\*([^*\n]{2,80})\*\*/g)) {
    terms.add(match[1]!.trim().replace(/[:.]$/, '').trim());
  }
  return [...terms];
}

/** A section file: "# 5.2 Title", then "## 5.2.1 Title" subsections. */
export function parseSection(markdown: string, sectionNumber: string): ParsedSection {
  const { title, body } = stripPageHeader(markdown);
  const escaped = sectionNumber.replace('.', '\\.');
  const heading = new RegExp(`^#{2,3} (${escaped}\\.\\d+)\\s+(.+)$`, 'gm');
  const headings = Array.from(body.matchAll(heading));

  const intro = (headings.length ? body.slice(0, headings[0]!.index) : body).trim();
  const subsections = headings.map((match, index) => {
    const start = match.index! + match[0].length;
    const end = index + 1 < headings.length ? headings[index + 1]!.index! : body.length;
    return { number: match[1]!, title: match[2]!.trim(), markdown: body.slice(start, end).trim() };
  });

  return {
    title: title.replace(/^\d+\.\d+\s+/, ''),
    intro,
    subsections,
    figures: [
      ...figuresIn(intro, null),
      ...subsections.flatMap((sub) => figuresIn(sub.markdown, sub.number)),
    ],
    boldTerms: boldTermsIn(body),
    wordCount: countWords(body),
  };
}

/** A chapter file: the opening text up to its first "## N.M" section heading, plus figures in it. */
export function parseChapterIntro(markdown: string): { intro: string; figures: ParsedFigure[] } {
  const { body } = stripPageHeader(markdown);
  const firstSection = /^## \d+\.\d+\s/m.exec(body);
  const intro = (firstSection ? body.slice(0, firstSection.index) : body).trim();
  return { intro, figures: figuresIn(intro, null) };
}

export interface ParsedTerm {
  term: string;
  slug: string;
  definition: string;
}

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Appendix A: one "**Term:** definition" paragraph per term. */
export function parseGlossary(markdown: string): ParsedTerm[] {
  const { body } = stripPageHeader(markdown);
  const terms: ParsedTerm[] = [];
  const seen = new Set<string>();
  for (const paragraph of body.split(/\n\s*\n/)) {
    const match = /^\*\*(.+?)\*\*\s*(.*)$/s.exec(paragraph.trim());
    if (!match) continue;
    const term = match[1]!.replace(/:$/, '').trim();
    const definition = match[2]!
      .replace(/^:\s*/, '')
      .replace(/\s*\n\s*/g, ' ')
      .trim();
    const slug = slugify(term);
    if (!term || !definition || seen.has(slug)) continue;
    seen.add(slug);
    terms.push({ term, slug, definition });
  }
  return terms;
}

/** Ways a glossary term might appear in running text: the full term, its base, its acronym. */
function termVariants(term: string): string[] {
  const variants = new Set<string>([term]);
  const paren = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(term);
  if (paren) {
    variants.add(paren[1]!.trim());
    if (/^[A-Z0-9-]{2,}$/.test(paren[2]!.trim())) variants.add(paren[2]!.trim());
  }
  return [...variants].filter((variant) => variant.length >= 2);
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Hyphen, non-breaking hyphen, figure dash, en and em dash, minus: the glossary and the running
// text don't always use the same one ("Active–active" vs "active-active").
const DASHES = /[-‐-―−]/g;
const ANY_DASH_OR_SPACE = '[-\\u2010-\\u2015\\u2212\\s]';

function variantBody(variant: string): string {
  return variant.split(DASHES).map(escapeRegExp).join(ANY_DASH_OR_SPACE);
}

/** Matches the variant as a whole word or phrase anywhere in running text. */
function inTextPattern(variant: string): RegExp {
  const acronym = /^[A-Z0-9-]{2,}$/.test(variant);
  return new RegExp(`(^|[^\\w])${variantBody(variant)}(?![\\w])`, acronym ? 'u' : 'iu');
}

/** Matches a title that is exactly the variant, e.g. "Speculative Decoding" for the term. */
function wholeTitlePattern(variant: string): RegExp {
  return new RegExp(`^${variantBody(variant)}$`, 'iu');
}

/**
 * The section that introduces a term: the section titled exactly with the term if there is one,
 * otherwise the first section (in reading order) whose text uses it. Null when none mentions it.
 */
export function firstSectionUsing(
  term: string,
  sections: { number: string; title?: string; text: string }[],
): string | null {
  const variants = termVariants(term);
  const titlePatterns = variants.map(wholeTitlePattern);
  const titled = sections.find(
    (section) =>
      section.title && titlePatterns.some((pattern) => pattern.test(section.title!.trim())),
  );
  if (titled) return titled.number;
  const patterns = variants.map(inTextPattern);
  for (const section of sections) {
    if (patterns.some((pattern) => pattern.test(section.text))) return section.number;
  }
  return null;
}
