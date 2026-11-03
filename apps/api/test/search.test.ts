import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { glossaryPageSchema, searchResponseSchema } from '@forward-pass/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ingestBook } from '../src/book/ingest';
import { loadContent, type LoadedContent } from '../src/content/load';
import { buildIndex, editDistance, normalise, search, type SearchDoc } from '../src/search/index';
import { fixtureFetcher, INDEX_URL } from './fixtures/book';
import { bank11, digest11, exercise11, writeContent } from './fixtures/content';
import { noTestDatabase, registeredAgent, resetDatabase, testApp, testDb } from './helpers';

const doc = (type: SearchDoc['type'], title: string, body = ''): SearchDoc => ({
  type,
  id: title,
  title,
  subtitle: '',
  href: `/${title}`,
  body,
});

describe('search index', () => {
  const index = buildIndex([
    doc('section', '5.2 Speculative Decoding', 'A cheap drafter guesses tokens'),
    doc('section', '5.3 Disaggregation', 'Prefill and decode on separate GPUs'),
    doc('term', 'Speculative decoding', 'Guess several tokens, verify in one pass'),
    doc('term', 'KV cache', 'Stored keys and values'),
    doc('exercise', 'Code the speedup model', ''),
  ]);
  const titles = (q: string) =>
    search(index, q).groups.flatMap((group) => group.results.map((result) => result.title));

  it('normalises case, accents, dashes and punctuation, keeping section numbers', () => {
    expect(normalise('  Time-to-First-Token  ')).toBe('time to first token');
    expect(normalise('Café, “KV” cache!')).toBe('cafe kv cache');
    expect(normalise('5.2 Speculative')).toBe('5.2 speculative');
  });

  it('groups results by type in a fixed order', () => {
    const groups = search(index, 'speculative').groups;
    expect(groups.map((group) => group.label)).toEqual(['Sections', 'Glossary']);
  });

  it('finds sections by number, titles by prefix and lessons by their notes', () => {
    expect(titles('5.2')).toEqual(['5.2 Speculative Decoding']);
    expect(titles('disag')).toEqual(['5.3 Disaggregation']);
    expect(titles('drafter')).toEqual(['5.2 Speculative Decoding']);
    expect(titles('speedup')).toEqual(['Code the speedup model']);
  });

  it('needs every word to match somewhere, and ranks title matches first', () => {
    expect(titles('kv values')).toEqual(['KV cache']);
    expect(titles('kv nonsense')).toEqual([]);
    expect(titles('decode')).toEqual(['5.3 Disaggregation']);
    expect(search(index, '   ').groups).toEqual([]);
  });

  it('offers the closest matches for a misspelling, and says so', () => {
    const typo = search(index, 'specultive');
    expect(typo.fuzzy).toBe(true);
    expect(titles('specultive')).toEqual(['5.2 Speculative Decoding', 'Speculative decoding']);
    // A swapped pair, and a word still being typed.
    expect(titles('speculatvie dec')).toContain('5.2 Speculative Decoding');
    expect(titles('disagregation')).toEqual(['5.3 Disaggregation']);
    expect(search(index, 'speculative').fuzzy).toBe(false);
  });

  it('keeps short words exact, so two-letter typos match nothing', () => {
    expect(titles('kc')).toEqual([]);
    expect(search(index, 'kc').fuzzy).toBe(false);
  });

  it('measures edits, counting a swap of neighbours as one', () => {
    expect(editDistance('speculative', 'specultive', 2)).toBe(1);
    expect(editDistance('cache', 'cahce', 1)).toBe(1);
    expect(editDistance('prefill', 'decode', 2)).toBe(3);
  });
});

let dir: string;
let content: LoadedContent;

describe.skipIf(noTestDatabase)('glossary and search routes', () => {
  beforeEach(async () => {
    await resetDatabase();
    dir = await mkdtemp(path.join(tmpdir(), 'fp-search-'));
    await ingestBook({
      db: testDb(),
      fetcher: fixtureFetcher(),
      indexUrl: INDEX_URL,
      bookDir: path.join(dir, 'book'),
      figuresDir: path.join(dir, 'figures'),
      outlinePath: path.join(dir, 'outline.json'),
    });
    content = loadContent(writeContent(dir, digest11, { bank: bank11, exercise: exercise11 }));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const app = () => testApp({ content, figuresDir: path.join(dir, 'figures') });

  it('requires a session', async () => {
    expect((await request(app()).get('/api/search?q=batch')).status).toBe(401);
  });

  it('resolves every term the digests list, with where each is introduced and used', async () => {
    const agent = await registeredAgent(app());
    const page = glossaryPageSchema.parse((await agent.get('/api/glossary')).body);
    const bySlug = new Map(page.terms.map((term) => [term.slug, term]));
    for (const slug of ['batching', 'kv-cache', 'throughput-tps']) {
      expect(bySlug.get(slug)?.usedIn).toEqual([{ id: '1.1', title: 'Batching' }]);
    }
    const batching = bySlug.get('batching')!;
    expect(batching.introducedIn).toEqual({ id: '1.1', title: 'Batching' });
  });

  it('searches sections, notes, terms and exercises', async () => {
    const agent = await registeredAgent(app());
    const find = async (q: string) =>
      searchResponseSchema.parse((await agent.get(`/api/search?q=${encodeURIComponent(q)}`)).body);

    const batching = await find('batch');
    const byType = Object.fromEntries(
      batching.groups.map((group) => [group.type, group.results.map((result) => result.href)]),
    );
    expect(byType.section).toContain('/book/1.1');
    expect(byType.term).toContain('/glossary#batching');
    expect(byType.exercise).toEqual(['/book/1.1/exercises/1.1-toy-batch']);

    // A phrase from the 1.1 digest's one-liner finds the lesson.
    const notes = await find('weights are read once');
    expect(notes.groups[0]?.results[0]).toMatchObject({ type: 'section', id: '1.1' });

    expect((await find('1.2')).groups[0]?.results[0]?.title).toBe('1.2 Caching Results');
    expect((await find('')).groups).toEqual([]);
  });
});
