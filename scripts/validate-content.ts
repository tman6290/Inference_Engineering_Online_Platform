import path from 'node:path';
import { formatReport, validateContent } from './lib/content-validator';
import { repoRoot } from './lib/env';

// pnpm content:validate [--content <dir>] [--book <dir>]
// Checks authored chapters against the content schemas and content/outline.json. With the
// ingested book in content/book/ it also checks figures, glossary terms, quotes and copying.
// Exits non-zero on any error, so CI and pre-commit checks can rely on it.

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const contentDir = path.resolve(option('content') ?? path.join(repoRoot, 'content'));
const bookDir = path.resolve(option('book') ?? path.join(contentDir, 'book'));

const report = validateContent({ contentDir, bookDir });
console.info(formatReport(report));
process.exitCode = report.errors.length > 0 ? 1 : 0;
