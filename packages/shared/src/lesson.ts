import { z } from 'zod';
import { figureSchema, readStateSchema, subsectionNumberSchema } from './book';
import { CONFIDENCE_LEVELS } from './constants';
import { answerInputSchema, digestSchema, lessonIdSchema, type Digest } from './content';
import { publicQuestionSchema, toPublic } from './grade';
import { exerciseSummarySchema } from './checkpoint';
import { teachBackSchema } from './pod';

// What the Lesson page receives and sends. The authored digest is public except its check
// question, whose answer key stays on the server.

export const confidenceSchema = z.enum(CONFIDENCE_LEVELS);

export const publicDigestSchema = z.object({
  ...digestSchema.shape,
  checkQuestion: publicQuestionSchema,
});
export type PublicDigest = z.infer<typeof publicDigestSchema>;

export function toPublicDigest(digest: Digest): PublicDigest {
  return { ...digest, checkQuestion: toPublic(digest.checkQuestion) };
}

export const digestResponseSchema = z.object({ digest: publicDigestSchema.nullable() });
export type DigestResponse = z.infer<typeof digestResponseSchema>;

const lessonLinkSchema = z.object({ id: lessonIdSchema, title: z.string() });

export const lessonKindSchema = z.enum(['page', 'chapter', 'section']);

export const checkResultSchema = z.object({
  accepted: z.boolean(),
  /** Submissions so far, this one included. */
  attempts: z.number().int(),
  feedback: z.string(),
  /** Shown once the answer is accepted or after three misses. */
  explanation: z.string().nullable(),
  /** The learner's choice for multiple choice, to restore the page state. */
  choice: z.number().int().nullable(),
});
export type CheckResult = z.infer<typeof checkResultSchema>;

export const lessonResponseSchema = z.object({
  id: lessonIdSchema,
  kind: lessonKindSchema,
  /** "5.2", or null for the Preface and Chapter 0. */
  number: z.string().nullable(),
  title: z.string(),
  summary: z.string(),
  readingMinutes: z.number().int(),
  hasCheckpoint: z.boolean(),
  chapter: z
    .object({
      number: z.number().int(),
      slug: z.string(),
      title: z.string(),
      summary: z.string(),
      lessons: z.array(
        lessonLinkSchema.extend({
          readState: readStateSchema,
          subsections: z.array(z.object({ number: subsectionNumberSchema, title: z.string() })),
        }),
      ),
    })
    .nullable(),
  /** Book text before the first subsection, as Markdown. */
  intro: z.string(),
  subsections: z.array(
    z.object({
      number: subsectionNumberSchema,
      title: z.string(),
      markdown: z.string(),
      readingMinutes: z.number().int(),
    }),
  ),
  figures: z.array(figureSchema),
  digest: publicDigestSchema.nullable(),
  terms: z.array(z.object({ term: z.string(), slug: z.string(), definition: z.string() })),
  /** Hands-on tasks for this lesson, in chapter.json order. */
  exercises: z.array(exerciseSummarySchema),
  /** Teach-backs on this section that you wrote or that were owed to you. */
  teachBacks: z.array(teachBackSchema),
  progress: z.object({
    readState: readStateSchema,
    maxScrollPct: z.number().int(),
    confidence: confidenceSchema.nullable(),
  }),
  check: checkResultSchema.nullable(),
  note: z.object({ body: z.string(), updatedAt: z.string() }).nullable(),
  partner: z
    .object({
      displayName: z.string(),
      initial: z.string(),
      colour: z.enum(['lime', 'butter']),
      confidence: confidenceSchema.nullable(),
      note: z.object({ body: z.string(), updatedAt: z.string() }).nullable(),
    })
    .nullable(),
  previous: lessonLinkSchema.nullable(),
  next: lessonLinkSchema.nullable(),
});
export type LessonResponse = z.infer<typeof lessonResponseSchema>;

export const readingEventRequestSchema = z
  .object({
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
    maxScrollPct: z.number().int().min(0).max(100),
  })
  .refine((event) => Date.parse(event.endedAt) >= Date.parse(event.startedAt), {
    path: ['endedAt'],
    message: 'must not be before startedAt',
  });
export type ReadingEventRequest = z.infer<typeof readingEventRequestSchema>;

export const progressResponseSchema = z.object({
  readState: readStateSchema,
  maxScrollPct: z.number().int(),
  confidence: confidenceSchema.nullable(),
});
export type ProgressResponse = z.infer<typeof progressResponseSchema>;

/** Scrolling this far down the lesson counts as having read it. */
export const READ_AT_SCROLL_PCT = 90;

export const confidenceRequestSchema = z.object({ level: confidenceSchema });
export const noteRequestSchema = z.object({ body: z.string().max(10_000) });
export const noteResponseSchema = z.object({ body: z.string(), updatedAt: z.string() });

export const checkAnswerRequestSchema = answerInputSchema;
