import { z } from 'zod';
import { glossaryTermSchema } from './book';
import { lessonIdSchema } from './content';

// Site search and the glossary page. The index lives in the API, built from the ingested book and
// the committed content; no external search service.

export const searchResultTypeSchema = z.enum(['section', 'term', 'exercise']);
export type SearchResultType = z.infer<typeof searchResultTypeSchema>;

export const searchResultSchema = z.object({
  type: searchResultTypeSchema,
  id: z.string(),
  title: z.string(),
  /** A line under the title: a lesson's one-liner, a definition, an exercise's section. */
  subtitle: z.string(),
  /** Same-origin path to open. */
  href: z.string(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchResponseSchema = z.object({
  query: z.string(),
  /** Groups in a fixed order (sections, terms, exercises); empty groups are left out. */
  groups: z.array(
    z.object({
      type: searchResultTypeSchema,
      label: z.string(),
      results: z.array(searchResultSchema),
    }),
  ),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

/** Queries are trimmed and cut to this length. */
export const SEARCH_MAX_QUERY = 80;

const lessonLink = z.object({ id: lessonIdSchema, title: z.string() });

/** A glossary term with where it appears. Extends the plain term, so older readers still parse. */
export const glossaryEntrySchema = glossaryTermSchema.extend({
  /** The first section whose text uses the term, with its title. */
  introducedIn: lessonLink.nullable(),
  /** Lessons whose notes list the term. */
  usedIn: z.array(lessonLink),
});
export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>;

export const glossaryPageSchema = z.object({ terms: z.array(glossaryEntrySchema) });
export type GlossaryPage = z.infer<typeof glossaryPageSchema>;
