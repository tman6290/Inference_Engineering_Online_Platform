import path from 'node:path';
import { httpFetcher, ingestBook } from '@forward-pass/api/book';
import { loadConfig, repoRoot } from '@forward-pass/api/config';
import { createDb } from '@forward-pass/api/db';

// pnpm content:ingest [--force]
// Fetches the book into content/book/ and content/figures/ (both gitignored), loads it into
// Postgres, and writes the committed outline to content/outline.json. Safe to run repeatedly.

const force = process.argv.includes('--force');
const verbose = process.argv.includes('--verbose');

async function main(): Promise<void> {
  const db = createDb(loadConfig().databaseUrl);
  try {
    const report = await ingestBook({
      db,
      fetcher: httpFetcher(300),
      bookDir: path.join(repoRoot, 'content', 'book'),
      figuresDir: path.join(repoRoot, 'content', 'figures'),
      outlinePath: path.join(repoRoot, 'content', 'outline.json'),
      force,
      log: verbose ? (message) => console.info(message) : undefined,
    });

    console.info(
      `\nBook: ${report.counts.chapters} chapters, ${report.counts.sections} sections, ` +
        `${report.counts.subsections} subsections, ${report.counts.figures} figures, ` +
        `${report.counts.glossaryTerms} glossary terms.`,
    );
    console.info(
      `Files: ${report.files.fetched} fetched, ${report.files.cached} already on disk` +
        `${force ? ' (--force refetches everything)' : ''}.`,
    );
    console.info(
      `Figures: ${report.figures.downloaded} downloaded, ${report.figures.cached} already on disk.`,
    );
    if (report.figures.unnumberedImages > 0) {
      console.info(
        `Note: ${report.figures.unnumberedImages} image(s) had no "Figure N.M" caption and were skipped.`,
      );
    }
    console.table(report.database);
    const changes = Object.values(report.database).reduce(
      (sum, table) => sum + table.created + table.updated + table.deleted,
      0,
    );
    console.info(
      changes === 0 && !report.outlineChanged
        ? 'No changes: the database and content/outline.json already match the book.'
        : `${changes} database row(s) changed; outline ${report.outlineChanged ? 'updated' : 'unchanged'}.`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
