import type { SearchResponse, SearchResult, SearchResultType } from '@forward-pass/shared';

// An in-memory search index over a few hundred documents: lessons, glossary terms and exercises.
// Small enough that a scored scan beats any real index, and it needs no service to run.

export interface SearchDoc extends SearchResult {
  /** Extra text that can match but scores lower than the title. */
  body: string;
}

interface Entry {
  doc: SearchDoc;
  title: string;
  titleWords: string[];
  body: string;
}

export interface SearchIndex {
  entries: Entry[];
}

/** Stands in for a decimal point while punctuation is stripped. A private-use character. */
const DOT = '';

/** Lowercase, no accents, dashes and punctuation as spaces; dots between digits stay ("5.2"). */
export function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(?<=\d)\.(?=\d)/g, DOT)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replaceAll(DOT, '.')
    .trim();
}

export function buildIndex(docs: SearchDoc[]): SearchIndex {
  return {
    entries: docs.map((doc) => {
      const title = normalise(doc.title);
      return { doc, title, titleWords: title.split(' '), body: normalise(doc.body) };
    }),
  };
}

/** How well one entry matches; 0 means at least one query word is missing everywhere. */
function score(entry: Entry, query: string, words: string[]): number {
  let total = 0;
  if (entry.title === query) total += 1000;
  else if (entry.title.startsWith(query)) total += 400;
  for (const word of words) {
    if (entry.titleWords.includes(word)) total += 60;
    else if (entry.titleWords.some((titleWord) => titleWord.startsWith(word))) total += 40;
    else if (entry.title.includes(word)) total += 15;
    else if (new RegExp(`(^| )${escape(word)}`).test(entry.body)) total += 6;
    else return 0;
  }
  return total;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const GROUPS: { type: SearchResultType; label: string }[] = [
  { type: 'section', label: 'Sections' },
  { type: 'term', label: 'Glossary' },
  { type: 'exercise', label: 'Exercises' },
];

/** The best matches per type, best first, at most `perGroup` each. */
export function search(index: SearchIndex, raw: string, perGroup = 6): SearchResponse {
  const query = normalise(raw);
  if (!query) return { query: raw, groups: [] };
  const words = query.split(' ');
  const scored = index.entries
    .map((entry) => ({ entry, score: score(entry, query, words) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.doc.title.localeCompare(b.entry.doc.title));

  const groups = GROUPS.map(({ type, label }) => ({
    type,
    label,
    results: scored
      .filter((item) => item.entry.doc.type === type)
      .slice(0, perGroup)
      .map(({ entry: { doc } }) => ({
        type: doc.type,
        id: doc.id,
        title: doc.title,
        subtitle: doc.subtitle,
        href: doc.href,
      })),
  })).filter((group) => group.results.length);
  return { query: raw, groups };
}
