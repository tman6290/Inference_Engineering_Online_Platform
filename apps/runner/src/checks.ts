import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { CRITIQUE_SOURCE_FILES, CRITIQUE_SOURCE_LINES } from '@forward-pass/shared';
import { validateResults } from '@forward-pass/shared/results';

// The checks that need no sandbox: they only read files. Nothing here runs learner code.

/** Every file under the repo as forward-slash paths, skipping .git and dependency folders. */
export function listFiles(root: string, limit = 5000): string[] {
  const skip = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'venv']);
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (out.length >= limit) return;
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      // Symlinks are listed but never followed: a link could point outside the repo.
      if (entry.isDirectory() && !entry.isSymbolicLink()) walk(full);
      else out.push(path.relative(root, full).split(path.sep).join('/'));
    }
  };
  walk(root);
  return out.sort();
}

/** "bench/*.py", "charts/**\/*.png", "README.md" as a regex over forward-slash paths. */
export function globToRegExp(glob: string): RegExp {
  let pattern = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]!;
    if (char === '*' && glob[i + 1] === '*') {
      // "**/" matches zero or more folders; a bare "**" matches anything.
      if (glob[i + 2] === '/') {
        pattern += '(?:.*/)?';
        i += 2;
      } else {
        pattern += '.*';
        i += 1;
      }
    } else if (char === '*') pattern += '[^/]*';
    else if (char === '?') pattern += '[^/]';
    else pattern += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${pattern}$`);
}

export interface CheckOutcome {
  passed: boolean;
  log: string;
}

export function checkFiles(files: string[], required: string[]): CheckOutcome {
  const lines = required.map((glob) => {
    const re = globToRegExp(glob);
    const hits = files.filter((file) => re.test(file));
    return hits.length
      ? `ok      ${glob} (${hits.length} match${hits.length === 1 ? '' : 'es'}: ${hits.slice(0, 3).join(', ')})`
      : `missing ${glob}`;
  });
  return { passed: lines.every((line) => line.startsWith('ok')), log: lines.join('\n') };
}

/** Heading text, lowercased, without leading numbering or trailing punctuation. */
const headingKey = (text: string) =>
  text
    .toLowerCase()
    .replace(/^[\d.)\s]+/, '')
    .replace(/[:.\s]+$/, '')
    .trim();

/** The README at the repo root, whatever its case, or null. */
export function findReadme(root: string, files: string[]): { path: string; text: string } | null {
  const name = files.find((file) => /^readme\.md$/i.test(file));
  if (!name) return null;
  return { path: name, text: readFileSync(path.join(root, name), 'utf8') };
}

export function checkReadme(readme: string | null, sections: string[]): CheckOutcome {
  if (readme === null) return { passed: false, log: 'README.md is missing.' };
  const headings = [...readme.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)].map((match) =>
    headingKey(match[1]!),
  );
  const lines = sections.map((section) =>
    headings.includes(headingKey(section.replace(/^#+\s*/, '')))
      ? `ok      ${section}`
      : `missing ${section}`,
  );
  return {
    passed: lines.every((line) => line.startsWith('ok')),
    log: lines.join('\n') || 'No sections required.',
  };
}

export function checkResults(
  root: string,
  files: string[],
  schema: Record<string, unknown> | null,
): CheckOutcome & { results: unknown } {
  if (!files.includes('results.json')) {
    return { passed: false, log: 'results.json is missing at the repo root.', results: null };
  }
  let results: unknown;
  try {
    results = JSON.parse(readFileSync(path.join(root, 'results.json'), 'utf8'));
  } catch (error) {
    return {
      passed: false,
      log: `results.json is not valid JSON: ${(error as Error).message}`,
      results: null,
    };
  }
  if (!schema)
    return { passed: true, log: 'results.json parses; this project has no schema.', results };
  const verdict = validateResults(schema, results);
  return verdict.ok
    ? { passed: true, log: 'results.json matches the project schema.', results }
    : {
        passed: false,
        log: ['results.json does not match the schema:', ...verdict.errors].join('\n'),
        results,
      };
}

const SOURCE =
  /\.(py|ipynb|ts|tsx|js|mjs|go|rs|sh|ya?ml|toml|sql|cfg|ini)$|(^|\/)(Makefile|Dockerfile)$/;
const ENTRY =
  /(^|\/)(main|__main__|app|cli|bench|benchmark|run|serve|server|index)\.(py|ts|js)$|(^|\/)Makefile$/;

/**
 * Up to 12 source files for the critique, each cut at 400 lines: entry points first, then files
 * the README names, then the largest. Binary files and huge files are skipped.
 */
export function pickSources(root: string, files: string[], readme: string | null) {
  const candidates = files.filter((file) => SOURCE.test(file) && !file.startsWith('.'));
  const size = (file: string) => {
    try {
      return statSync(path.join(root, file)).size;
    } catch {
      return 0;
    }
  };
  const named = (file: string) => Boolean(readme && readme.includes(file));
  const ranked = [...candidates].sort(
    (a, b) =>
      Number(ENTRY.test(b)) - Number(ENTRY.test(a)) ||
      Number(named(b)) - Number(named(a)) ||
      size(b) - size(a) ||
      a.localeCompare(b),
  );
  const picked: { path: string; content: string }[] = [];
  for (const file of ranked) {
    if (picked.length >= CRITIQUE_SOURCE_FILES) break;
    if (size(file) > 2_000_000) continue;
    const text = readFileSync(path.join(root, file), 'utf8');
    if (text.includes('\u0000')) continue;
    const lines = text.split('\n');
    picked.push({
      path: file,
      content:
        lines.length > CRITIQUE_SOURCE_LINES
          ? `${lines.slice(0, CRITIQUE_SOURCE_LINES).join('\n')}\n… cut at ${CRITIQUE_SOURCE_LINES} of ${lines.length} lines`
          : text,
    });
  }
  return picked;
}
