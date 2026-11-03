import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { searchResponseSchema } from '@forward-pass/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ingestBook } from '../src/book/ingest';
import { loadContent } from '../src/content/load';
import { watchContent } from '../src/content/watch';
import { fixtureFetcher, INDEX_URL } from './fixtures/book';
import { digest11, writeContent } from './fixtures/content';
import { noTestDatabase, registeredAgent, resetDatabase, testApp, testDb } from './helpers';

let dir: string;
let stop: (() => void) | undefined;

/** Polls until `check` passes or two seconds go by. */
async function eventually(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 2000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the content reload');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe.skipIf(noTestDatabase)('content watcher', () => {
  beforeEach(async () => {
    await resetDatabase();
    dir = await mkdtemp(path.join(tmpdir(), 'fp-watch-'));
    await ingestBook({
      db: testDb(),
      fetcher: fixtureFetcher(),
      indexUrl: INDEX_URL,
      bookDir: path.join(dir, 'book'),
      figuresDir: path.join(dir, 'figures'),
      outlinePath: path.join(dir, 'outline.json'),
    });
  });
  afterEach(async () => {
    stop?.();
    await rm(dir, { recursive: true, force: true });
  });

  it('reloads edited content into the running app, search included', async () => {
    const contentDir = writeContent(dir);
    const content = loadContent(contentDir);
    const logs: string[] = [];
    stop = watchContent(contentDir, content, (message) => logs.push(message));
    const agent = await registeredAgent(
      testApp({ content, figuresDir: path.join(dir, 'figures') }),
    );
    const find = async (q: string) =>
      searchResponseSchema.parse((await agent.get(`/api/search?q=${encodeURIComponent(q)}`)).body);

    expect((await find('zebra crossing')).groups).toEqual([]);

    const edited = {
      ...digest11,
      oneLine: 'A zebra crossing lets several requests cross in one pass.',
    };
    await writeFile(
      path.join(contentDir, 'chapters', '01-serving', 'digests', '1.1.json'),
      JSON.stringify(edited),
    );
    await eventually(() => content.digests.get('1.1')?.oneLine.startsWith('A zebra') ?? false);
    expect(content.revision).toBeGreaterThan(0);

    // The lesson route and search both see the new text without a restart.
    expect((await agent.get('/api/lessons/1.1')).body.digest.oneLine).toMatch(/^A zebra/);
    expect((await find('zebra crossing')).groups[0]?.results[0]).toMatchObject({ id: '1.1' });
    expect(logs.at(-1)).toMatch(/^content: reloaded 1 digest/);
  });

  it('keeps the previous version when an edit breaks a file', async () => {
    const contentDir = writeContent(dir);
    const content = loadContent(contentDir);
    const logs: string[] = [];
    stop = watchContent(contentDir, content, (message) => logs.push(message));

    await writeFile(
      path.join(contentDir, 'chapters', '01-serving', 'digests', '1.1.json'),
      '{ "lesson": ',
    );
    await eventually(() => logs.length > 0);
    expect(logs[0]).toMatch(/^content: kept the previous version\. .*1\.1\.json is not valid JSON/);
    expect(content.digests.get('1.1')?.oneLine).toBe(digest11.oneLine);
    expect(content.revision).toBe(0);
  });
});
