import { z } from 'zod';

/** "5.2" */
export const sectionNumberSchema = z
  .string()
  .regex(/^[1-9]\d*\.\d+$/, 'expected a section number like 5.2');
/** "5.2.1" */
export const subsectionNumberSchema = z
  .string()
  .regex(/^[1-9]\d*\.\d+\.\d+$/, 'expected a subsection number like 5.2.1');
/** "5.3", "0.1", or "P.1" for the Preface */
export const figureNumberSchema = z
  .string()
  .regex(/^(\d+|P)\.\d+$/, 'expected a figure number like 5.3 or P.1');

/**
 * content/outline.json: the book's structure with numbers and titles only, no body text.
 * Written by `pnpm content:ingest`; authored content and the validator reference it.
 */
export const outlineSchema = z.object({
  source: z.url(),
  frontMatter: z.array(z.object({ slug: z.string(), title: z.string() })),
  chapters: z.array(
    z.object({
      number: z.number().int().min(0),
      slug: z.string(),
      title: z.string(),
      sections: z.array(
        z.object({
          number: sectionNumberSchema,
          slug: z.string(),
          title: z.string(),
          subsections: z.array(z.object({ number: subsectionNumberSchema, title: z.string() })),
        }),
      ),
    }),
  ),
  backMatter: z.array(z.object({ slug: z.string(), title: z.string() })),
});
export type Outline = z.infer<typeof outlineSchema>;

export const readStateSchema = z.enum(['unread', 'reading', 'read']);
export type ReadState = z.infer<typeof readStateSchema>;

const sectionSummarySchema = z.object({
  number: sectionNumberSchema,
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  readingMinutes: z.number().int(),
  readState: readStateSchema,
});

/**
 * Where a chapter sits in the pipeline: every section read (done), some read (reading), the first
 * unstarted chapter after those (upNext), or later (queued).
 */
export const chapterStatusSchema = z.enum(['done', 'reading', 'upNext', 'queued']);
export type ChapterStatus = z.infer<typeof chapterStatusSchema>;

export const bookResponseSchema = z.object({
  frontMatter: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      summary: z.string(),
      readState: readStateSchema,
    }),
  ),
  chapters: z.array(
    z.object({
      number: z.number().int(),
      slug: z.string(),
      title: z.string(),
      summary: z.string(),
      status: chapterStatusSchema,
      /** Read share of the chapter: its sections, or the chapter page itself for Chapter 0. */
      progressPct: z.number().int(),
      readState: readStateSchema,
      sections: z.array(
        sectionSummarySchema.extend({
          confidence: z.enum(['shaky', 'okay', 'solid']).nullable(),
          /** Last checkpoint acceptance, once checkpoints exist (build prompt 07). */
          checkpointScore: z.number().nullable(),
        }),
      ),
    }),
  ),
  /** Sections read, out of SECTION_COUNT. */
  decoded: z.number().int(),
});
export type BookResponse = z.infer<typeof bookResponseSchema>;

export const figureSchema = z.object({
  number: figureNumberSchema,
  caption: z.string(),
  /** Same-origin URL served by the API from content/figures. */
  url: z.string(),
  subsectionNumber: subsectionNumberSchema.nullable(),
});
export type Figure = z.infer<typeof figureSchema>;

export const sectionResponseSchema = sectionSummarySchema.extend({
  chapter: z.object({ number: z.number().int(), slug: z.string(), title: z.string() }),
  /** Markdown before the first subsection. */
  intro: z.string(),
  subsections: z.array(
    z.object({ number: subsectionNumberSchema, title: z.string(), markdown: z.string() }),
  ),
  figures: z.array(figureSchema),
  wordCount: z.number().int(),
  previous: z.object({ number: z.string(), title: z.string() }).nullable(),
  next: z.object({ number: z.string(), title: z.string() }).nullable(),
});
export type SectionResponse = z.infer<typeof sectionResponseSchema>;

export const glossaryTermSchema = z.object({
  term: z.string(),
  slug: z.string(),
  definition: z.string(),
  /** First section whose text uses the term, if any. */
  sectionNumber: z.string().nullable(),
});
export type GlossaryTerm = z.infer<typeof glossaryTermSchema>;

export const glossaryResponseSchema = z.object({ terms: z.array(glossaryTermSchema) });
export type GlossaryResponse = z.infer<typeof glossaryResponseSchema>;
