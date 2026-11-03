import { SEARCH_MAX_QUERY } from '@forward-pass/shared';
import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import type { LoadedContent } from '../content/load';
import type { Db } from '../db';
import { searchDocs } from '../search/docs';
import { buildIndex, search, type SearchIndex } from '../search/index';

interface SearchRouterDeps {
  db: Db;
  content: LoadedContent;
}

/**
 * GET /api/search?q= across lessons, glossary terms and exercises. The index builds when the app
 * starts and again after the content watcher reloads content/ (development), which also covers a
 * re-ingest, since that rewrites content/book.
 */
export function searchRouter({ db, content }: SearchRouterDeps): Router {
  const router = Router();
  router.use('/search', requireAuth);

  let index: Promise<SearchIndex> | null = null;
  let builtFor = content.revision;
  const load = () => {
    if (builtFor !== content.revision) {
      builtFor = content.revision;
      index = null;
    }
    index ??= searchDocs(db, content)
      .then(buildIndex)
      .catch((error: unknown) => {
        // Try again on the next request, e.g. if the database wasn't up yet.
        index = null;
        throw error;
      });
    return index;
  };
  void load().catch(() => undefined);

  router.get('/search', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, SEARCH_MAX_QUERY) : '';
    res.json(search(await load(), q));
  });

  return router;
}
