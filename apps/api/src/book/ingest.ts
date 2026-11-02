import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { outlineSchema, type Outline } from '@forward-pass/shared';
import type { Db } from '../db';
import {
  countUnnumberedImages,
  figuresIn,
  firstSectionUsing,
  GLOSSARY_SLUG,
  parseChapterIntro,
  parseGlossary,
  parseIndex,
  parseSection,
  readingMinutes,
  stripPageHeader,
  type IndexEntry,
  type ParsedFigure,
  type ParsedSection,
  type ParsedTerm,
} from './parse';
import { storeBook, type StoreReport } from './store';

export const BOOK_INDEX_URL = 'https://www.baseten.co/inference-engineering/llms.txt';

export interface Fetcher {
  text(url: string): Promise<string>;
  bytes(url: string): Promise<Uint8Array>;
}

/** The real network, with a polite delay before every request. */
export function httpFetcher(delayMs = 300): Fetcher {
  const wait = () => new Promise((resolve) => setTimeout(resolve, delayMs));
  const get = async (url: string) => {
    await wait();
    const res = await fetch(url, { headers: { 'user-agent': 'forward-pass-ingest' } });
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
    return res;
  };
  return {
    text: async (url) => (await get(url)).text(),
    bytes: async (url) => new Uint8Array(await (await get(url)).arrayBuffer()),
  };
}

export interface IngestOptions {
  db: Db;
  fetcher: Fetcher;
  /** content/book */
  bookDir: string;
  /** content/figures */
  figuresDir: string;
  /** content/outline.json */
  outlinePath: string;
  indexUrl?: string;
  /** Refetch files that are already on disk. */
  force?: boolean;
  log?: (message: string) => void;
}

export interface ParsedBook {
  front: (Extract<IndexEntry, { kind: 'front' | 'back' }> & { markdown: string })[];
  back: (Extract<IndexEntry, { kind: 'front' | 'back' }> & { markdown: string })[];
  chapters: (Extract<IndexEntry, { kind: 'chapter' }> & {
    intro: string;
    sections: (Extract<IndexEntry, { kind: 'section' }> &
      ParsedSection & { readingMinutes: number })[];
  })[];
  figures: (ParsedFigure & {
    chapterNumber: number | null;
    pageSlug: string | null;
    sectionNumber: string | null;
  })[];
  glossary: (ParsedTerm & { sectionNumber: string | null })[];
}

export interface IngestReport {
  files: { fetched: number; cached: number };
  figures: { downloaded: number; cached: number; unnumberedImages: number };
  counts: {
    chapters: number;
    sections: number;
    subsections: number;
    figures: number;
    glossaryTerms: number;
  };
  database: StoreReport;
  outlineChanged: boolean;
  manifestChanged: boolean;
}

interface ManifestEntry {
  url: string;
  sha256: string;
  fetchedAt: string;
}

const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

async function writeIfChanged(file: string, content: string): Promise<boolean> {
  if (existsSync(file) && (await readFile(file, 'utf8')) === content) return false;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
  return true;
}

export async function ingestBook(options: IngestOptions): Promise<IngestReport> {
  const { db, fetcher, bookDir, figuresDir, outlinePath, force = false } = options;
  const indexUrl = options.indexUrl ?? BOOK_INDEX_URL;
  const log = options.log ?? (() => undefined);

  const manifestPath = path.join(bookDir, 'manifest.json');
  const manifest: Record<string, ManifestEntry> = existsSync(manifestPath)
    ? JSON.parse(await readFile(manifestPath, 'utf8'))
    : {};
  const files = { fetched: 0, cached: 0 };

  /** Reads a page from disk, or fetches and saves it exactly as received. */
  const page = async (url: string, relative: string): Promise<string> => {
    const file = path.join(bookDir, relative);
    if (!force && existsSync(file)) {
      files.cached++;
      return readFile(file, 'utf8');
    }
    log(`fetch ${url}`);
    const text = await fetcher.text(url);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
    files.fetched++;
    const digest = sha256(text);
    if (manifest[relative]?.sha256 !== digest) {
      manifest[relative] = { url, sha256: digest, fetchedAt: new Date().toISOString() };
    }
    return text;
  };

  const index = parseIndex(await page(indexUrl, 'llms.txt'));
  const book: ParsedBook = { front: [], back: [], chapters: [], figures: [], glossary: [] };
  let unnumberedImages = 0;
  let glossaryMarkdown: string | null = null;

  for (const entry of index) {
    const markdown = await page(entry.url, entry.path);
    unnumberedImages += countUnnumberedImages(markdown);

    if (entry.kind === 'chapter') {
      const { intro, figures } = parseChapterIntro(markdown);
      book.chapters.push({ ...entry, intro, sections: [] });
      book.figures.push(
        ...figures.map((figure) => ({
          ...figure,
          chapterNumber: entry.number,
          pageSlug: null,
          sectionNumber: null,
        })),
      );
    } else if (entry.kind === 'section') {
      const chapter = book.chapters.find((candidate) => candidate.number === entry.chapterNumber);
      if (!chapter) throw new Error(`Section ${entry.number} appears before its chapter`);
      const parsed = parseSection(markdown, entry.number);
      chapter.sections.push({
        ...entry,
        ...parsed,
        readingMinutes: readingMinutes(parsed.wordCount),
      });
      book.figures.push(
        ...parsed.figures.map((figure) => ({
          ...figure,
          chapterNumber: entry.chapterNumber,
          pageSlug: null,
          sectionNumber: entry.number,
        })),
      );
    } else {
      book[entry.kind].push({ ...entry, markdown });
      // The Preface has its own figures, numbered P.1, P.2, ...
      book.figures.push(
        ...figuresIn(stripPageHeader(markdown).body).map((figure) => ({
          ...figure,
          chapterNumber: null,
          pageSlug: entry.slug,
          sectionNumber: null,
        })),
      );
      if (entry.slug === GLOSSARY_SLUG) glossaryMarkdown = markdown;
    }
  }

  // A figure can appear in both a chapter file and a section file; keep the first, most specific.
  const byNumber = new Map<string, ParsedBook['figures'][number]>();
  for (const figure of book.figures) {
    const existing = byNumber.get(figure.number);
    if (!existing || (!existing.sectionNumber && figure.sectionNumber))
      byNumber.set(figure.number, figure);
  }
  book.figures = [...byNumber.values()];

  const sectionsInOrder = book.chapters.flatMap((chapter) => chapter.sections);
  const searchable = sectionsInOrder.map((section) => ({
    number: section.number,
    title: section.title,
    text: [section.intro, ...section.subsections.map((sub) => sub.markdown)].join('\n'),
  }));
  book.glossary = glossaryMarkdown
    ? parseGlossary(glossaryMarkdown).map((term) => ({
        ...term,
        sectionNumber: firstSectionUsing(term.term, searchable),
      }))
    : [];

  // Figures: content/figures/<number>.<ext>
  const figureStats = { downloaded: 0, cached: 0 };
  const fileNames = new Map<string, string>();
  await mkdir(figuresDir, { recursive: true });
  for (const figure of book.figures) {
    const ext = path.extname(new URL(figure.sourceUrl).pathname).toLowerCase() || '.png';
    const fileName = `${figure.number}${ext}`;
    fileNames.set(figure.number, fileName);
    const file = path.join(figuresDir, fileName);
    if (!force && existsSync(file)) {
      figureStats.cached++;
      continue;
    }
    log(`figure ${figure.number}`);
    await writeFile(file, await fetcher.bytes(figure.sourceUrl));
    figureStats.downloaded++;
  }

  const database = await storeBook(db, book, fileNames);

  const outline: Outline = outlineSchema.parse({
    source: indexUrl,
    frontMatter: book.front.map(({ slug, title }) => ({ slug, title })),
    chapters: book.chapters.map((chapter) => ({
      number: chapter.number,
      slug: chapter.slug,
      title: chapter.title,
      sections: chapter.sections.map((section) => ({
        number: section.number,
        slug: section.slug,
        title: section.title,
        subsections: section.subsections.map(({ number, title }) => ({ number, title })),
      })),
    })),
    backMatter: book.back.map(({ slug, title }) => ({ slug, title })),
  });
  const outlineChanged = await writeIfChanged(outlinePath, `${JSON.stringify(outline, null, 2)}\n`);
  const sortedManifest = Object.fromEntries(
    Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)),
  );
  const manifestChanged = await writeIfChanged(
    manifestPath,
    `${JSON.stringify(sortedManifest, null, 2)}\n`,
  );

  return {
    files,
    figures: { ...figureStats, unnumberedImages },
    counts: {
      chapters: book.chapters.length,
      sections: sectionsInOrder.length,
      subsections: sectionsInOrder.reduce((sum, section) => sum + section.subsections.length, 0),
      figures: book.figures.length,
      glossaryTerms: book.glossary.length,
    },
    database,
    outlineChanged,
    manifestChanged,
  };
}
