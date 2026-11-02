import type { Db } from '../db';
import type { ParsedBook } from './ingest';

export interface TableReport {
  created: number;
  updated: number;
  unchanged: number;
  deleted: number;
}

export type StoreReport = Record<
  'pages' | 'chapters' | 'sections' | 'subsections' | 'figures' | 'glossaryTerms',
  TableReport
>;

interface TableOps<Row> {
  key: (row: Row) => string | number;
  existing: () => Promise<Row[]>;
  create: (row: Row) => Promise<unknown>;
  update: (row: Row) => Promise<unknown>;
  remove: (keys: (string | number)[]) => Promise<unknown>;
}

/** Field-by-field equality on the columns we write; ignores key order. */
function same(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  return keys.every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));
}

/** Creates, updates or skips each desired row; returns which keys to delete afterwards. */
async function upsertRows<Row extends Record<string, unknown>>(
  desired: Row[],
  ops: TableOps<Row>,
): Promise<{ report: TableReport; stale: (string | number)[] }> {
  const report: TableReport = { created: 0, updated: 0, unchanged: 0, deleted: 0 };
  const current = new Map((await ops.existing()).map((row) => [ops.key(row), row]));
  for (const row of desired) {
    const existing = current.get(ops.key(row));
    if (!existing) {
      await ops.create(row);
      report.created++;
    } else if (!same(row, existing)) {
      await ops.update(row);
      report.updated++;
    } else {
      report.unchanged++;
    }
    current.delete(ops.key(row));
  }
  return { report, stale: [...current.keys()] };
}

/**
 * Writes the parsed book to Postgres. Unchanged rows are left alone, so a second run with the same
 * input reports zero created, updated and deleted. Rows that disappeared from the book are removed.
 */
export async function storeBook(
  db: Db,
  book: ParsedBook,
  figureFileNames: Map<string, string>,
): Promise<StoreReport> {
  const pages = [...book.front, ...book.back].map((page, index) => ({
    slug: page.slug,
    title: page.title,
    summary: page.summary,
    url: page.url,
    markdown: page.markdown,
    placement: page.kind as string,
    orderIndex: index,
  }));

  const chapters = book.chapters.map((chapter) => ({
    number: chapter.number,
    slug: chapter.slug,
    title: chapter.title,
    summary: chapter.summary,
    url: chapter.url,
    intro: chapter.intro,
  }));

  const sections = book.chapters
    .flatMap((chapter) => chapter.sections)
    .map((section, index) => ({
      number: section.number,
      chapterNumber: section.chapterNumber,
      slug: section.slug,
      title: section.title,
      summary: section.summary,
      url: section.url,
      intro: section.intro,
      wordCount: section.wordCount,
      readingMinutes: section.readingMinutes,
      orderIndex: index,
      boldTerms: section.boldTerms,
    }));

  const subsections = book.chapters
    .flatMap((chapter) => chapter.sections)
    .flatMap((section) =>
      section.subsections.map((sub, index) => ({
        number: sub.number,
        sectionNumber: section.number,
        title: sub.title,
        markdown: sub.markdown,
        orderIndex: index,
      })),
    );

  const figures = book.figures.map((figure) => ({
    number: figure.number,
    caption: figure.caption,
    sourceUrl: figure.sourceUrl,
    fileName: figureFileNames.get(figure.number) ?? `${figure.number}.png`,
    chapterNumber: figure.chapterNumber,
    pageSlug: figure.pageSlug,
    sectionNumber: figure.sectionNumber,
    subsectionNumber: figure.subsectionNumber,
  }));

  const glossary = book.glossary.map((term) => ({
    slug: term.slug,
    term: term.term,
    definition: term.definition,
    sectionNumber: term.sectionNumber,
  }));

  type PageRow = (typeof pages)[number];
  type ChapterRow = (typeof chapters)[number];
  type SectionRow = (typeof sections)[number];
  type SubsectionRow = (typeof subsections)[number];
  type FigureRow = (typeof figures)[number];
  type TermRow = (typeof glossary)[number];

  const pageOps: TableOps<PageRow> = {
    key: (row) => row.slug,
    existing: () => db.bookPage.findMany(),
    create: (row) => db.bookPage.create({ data: row }),
    update: (row) => db.bookPage.update({ where: { slug: row.slug }, data: row }),
    remove: (keys) => db.bookPage.deleteMany({ where: { slug: { in: keys as string[] } } }),
  };
  const chapterOps: TableOps<ChapterRow> = {
    key: (row) => row.number,
    existing: () => db.chapter.findMany(),
    create: (row) => db.chapter.create({ data: row }),
    update: (row) => db.chapter.update({ where: { number: row.number }, data: row }),
    remove: (keys) => db.chapter.deleteMany({ where: { number: { in: keys as number[] } } }),
  };
  const sectionOps: TableOps<SectionRow> = {
    key: (row) => row.number,
    existing: () => db.section.findMany(),
    create: (row) => db.section.create({ data: row }),
    update: (row) => db.section.update({ where: { number: row.number }, data: row }),
    remove: (keys) => db.section.deleteMany({ where: { number: { in: keys as string[] } } }),
  };
  const subsectionOps: TableOps<SubsectionRow> = {
    key: (row) => row.number,
    existing: () => db.subsection.findMany(),
    create: (row) => db.subsection.create({ data: row }),
    update: (row) => db.subsection.update({ where: { number: row.number }, data: row }),
    remove: (keys) => db.subsection.deleteMany({ where: { number: { in: keys as string[] } } }),
  };
  const figureOps: TableOps<FigureRow> = {
    key: (row) => row.number,
    existing: () => db.figure.findMany(),
    create: (row) => db.figure.create({ data: row }),
    update: (row) => db.figure.update({ where: { number: row.number }, data: row }),
    remove: (keys) => db.figure.deleteMany({ where: { number: { in: keys as string[] } } }),
  };
  const termOps: TableOps<TermRow> = {
    key: (row) => row.slug,
    existing: () => db.glossaryTerm.findMany(),
    create: (row) => db.glossaryTerm.create({ data: row }),
    update: (row) => db.glossaryTerm.update({ where: { slug: row.slug }, data: row }),
    remove: (keys) => db.glossaryTerm.deleteMany({ where: { slug: { in: keys as string[] } } }),
  };

  // Section.orderIndex is unique. If the order changed, park every row on a negative index first
  // so re-numbering can't collide with a row that hasn't moved yet.
  const currentOrder = await db.section.findMany({ select: { number: true, orderIndex: true } });
  const reordered = currentOrder.some(
    (row) =>
      sections.find((section) => section.number === row.number)?.orderIndex !== row.orderIndex,
  );
  if (reordered)
    await db.$executeRawUnsafe('UPDATE "Section" SET "orderIndex" = -"orderIndex" - 1');

  // Parents before children on the way in; children before parents when deleting.
  const pageResult = await upsertRows(pages, pageOps);
  const chapterResult = await upsertRows(chapters, chapterOps);
  const sectionResult = await upsertRows(sections, sectionOps);
  const subsectionResult = await upsertRows(subsections, subsectionOps);
  const figureResult = await upsertRows(figures, figureOps);
  const termResult = await upsertRows(glossary, termOps);

  const deletionOrder = [
    [termResult, termOps.remove],
    [figureResult, figureOps.remove],
    [subsectionResult, subsectionOps.remove],
    [sectionResult, sectionOps.remove],
    [chapterResult, chapterOps.remove],
    [pageResult, pageOps.remove],
  ] as const;
  for (const [result, remove] of deletionOrder) {
    if (result.stale.length === 0) continue;
    await remove(result.stale);
    result.report.deleted = result.stale.length;
  }

  return {
    pages: pageResult.report,
    chapters: chapterResult.report,
    sections: sectionResult.report,
    subsections: subsectionResult.report,
    figures: figureResult.report,
    glossaryTerms: termResult.report,
  };
}
