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
  bodyWords: string[];
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
      const body = normalise(doc.body);
      return { doc, title, titleWords: title.split(' '), body, bodyWords: body.split(' ') };
    }),
  };
}

/** Edits allowed for a misspelt word: none under 5 letters, one up to 8, two from 9. */
export const allowedEdits = (word: string) => (word.length < 5 ? 0 : word.length < 9 ? 1 : 2);

/**
 * Optimal string alignment distance (Levenshtein plus swapped neighbours), stopping early once
 * it passes `limit`. Returns limit + 1 for anything further away.
 */
export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, before[j - 2]! + 1);
      }
      current.push(value);
      best = Math.min(best, value);
    }
    if (best > limit) return limit + 1;
    before = previous;
    previous = current;
  }
  return previous[b.length]!;
}

/** A word within its allowed edits of a candidate, or of the candidate's start (typing mid-word). */
function nearly(word: string, candidates: string[]): boolean {
  const limit = allowedEdits(word);
  if (!limit) return false;
  return candidates.some(
    (candidate) =>
      editDistance(word, candidate, limit) <= limit ||
      (candidate.length > word.length &&
        editDistance(word, candidate.slice(0, word.length), limit) <= limit),
  );
}

/**
 * How well one entry matches; 0 means a query word is missing everywhere. With `fuzzy`, a word
 * that matches nothing may still count if it is a near-miss of a title or body word.
 */
function score(entry: Entry, query: string, words: string[], fuzzy: boolean): number {
  let total = 0;
  if (entry.title === query) total += 1000;
  else if (entry.title.startsWith(query)) total += 400;
  for (const word of words) {
    if (entry.titleWords.includes(word)) total += 60;
    else if (entry.titleWords.some((titleWord) => titleWord.startsWith(word))) total += 40;
    else if (entry.title.includes(word)) total += 15;
    else if (new RegExp(`(^| )${escape(word)}`).test(entry.body)) total += 6;
    else if (fuzzy && nearly(word, entry.titleWords)) total += 25;
    else if (fuzzy && nearly(word, entry.bodyWords)) total += 3;
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
  if (!query) return { query: raw, groups: [], fuzzy: false };
  const words = query.split(' ');
  const rank = (fuzzy: boolean) =>
    index.entries
      .map((entry) => ({ entry, score: score(entry, query, words, fuzzy) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.entry.doc.title.localeCompare(b.entry.doc.title));
  // Exact matches first; only when there are none does a misspelling get its closest matches.
  const exact = rank(false);
  const fuzzy = exact.length === 0;
  const scored = fuzzy ? rank(true) : exact;

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
  return { query: raw, groups, fuzzy: fuzzy && groups.length > 0 };
}
