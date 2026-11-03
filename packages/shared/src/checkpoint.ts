import { z } from 'zod';
import { sectionNumberSchema } from './book';
import { CONFIDENCE_LEVELS } from './constants';
import { answerInputSchema, lessonIdSchema, questionIdSchema, rereadSchema } from './content';
import { publicExerciseSchema, publicQuestionSchema } from './grade';

// What the Checkpoint and exercise pages receive and send. Keys stay on the server until a
// question is closed: accepted, or missed three times.

/** A question closes after this many misses; its explanation and key are then shown. */
export const MAX_TRIES = 3;

/** open: still answerable. accepted: right on some try. missed: three wrong tries, or the attempt ended. */
export const questionStatusSchema = z.enum(['open', 'accepted', 'missed']);
export type QuestionStatus = z.infer<typeof questionStatusSchema>;

export const attemptQuestionSchema = z.object({
  question: publicQuestionSchema,
  status: questionStatusSchema,
  tries: z.number().int(),
  /** How the first submission went, or null before one. Only first tries count toward acceptance. */
  firstTry: z.enum(['accepted', 'missed']).nullable(),
  usedHint: z.boolean(),
  /** The hint text, once asked for. Asking is logged. */
  hint: z.string().nullable(),
  /** Feedback on the latest submission. */
  feedback: z.string().nullable(),
  lastAnswer: answerInputSchema.nullable(),
  // Revealed once the question is closed.
  explanation: z.string().nullable(),
  workedSolution: z.string().nullable(),
  /** The key, as an answer the inputs can show. */
  solution: answerInputSchema.nullable(),
  reread: rereadSchema.nullable(),
});
export type AttemptQuestion = z.infer<typeof attemptQuestionSchema>;

export const attemptSummarySchema = z.object({
  id: z.string(),
  sectionNumber: sectionNumberSchema,
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  /** Questions accepted on the first try. */
  firstTryAccepted: z.number().int(),
  /** firstTryAccepted / questions, 0 to 1. */
  acceptance: z.number(),
  hints: z.number().int(),
  /** Null while the attempt is open. */
  passed: z.boolean().nullable(),
});
export type AttemptSummary = z.infer<typeof attemptSummarySchema>;

const lessonLink = z.object({ id: lessonIdSchema, title: z.string() });

export const attemptResponseSchema = z.object({
  attempt: attemptSummarySchema,
  section: z.object({
    number: sectionNumberSchema,
    title: z.string(),
    chapterNumber: z.number().int(),
  }),
  questions: z.array(attemptQuestionSchema),
  /** Set when passing this section opens the chapter's project (it is the chapter's last section). */
  project: z
    .object({ chapterNumber: z.number().int(), chapterTitle: z.string(), unlocked: z.boolean() })
    .nullable(),
  next: lessonLink.nullable(),
});
export type AttemptResponse = z.infer<typeof attemptResponseSchema>;

export const attemptAnswerRequestSchema = z.object({
  questionId: questionIdSchema,
  answer: answerInputSchema,
  /** The page's own record; a hint fetched through the API counts either way. */
  usedHint: z.boolean().default(false),
});
export type AttemptAnswerRequest = z.input<typeof attemptAnswerRequestSchema>;

export const attemptAnswerResponseSchema = z.object({
  result: z.object({ questionId: questionIdSchema, accepted: z.boolean(), feedback: z.string() }),
  state: attemptResponseSchema,
});
export type AttemptAnswerResponse = z.infer<typeof attemptAnswerResponseSchema>;

/** GET /api/checkpoints/:section: what the start screen needs. */
export const checkpointSectionResponseSchema = z.object({
  section: z.object({
    number: sectionNumberSchema,
    title: z.string(),
    chapterNumber: z.number().int(),
  }),
  bankSize: z.number().int(),
  openAttemptId: z.string().nullable(),
  attempts: z.array(attemptSummarySchema),
  project: attemptResponseSchema.shape.project,
});
export type CheckpointSectionResponse = z.infer<typeof checkpointSectionResponseSchema>;

/** GET /api/checkpoints: history by section, open attempts and the recall queue. */
export const checkpointsResponseSchema = z.object({
  sections: z.array(
    z.object({
      number: sectionNumberSchema,
      title: z.string(),
      chapterNumber: z.number().int(),
      chapterTitle: z.string(),
      openAttemptId: z.string().nullable(),
      attempts: z.number().int(),
      /** Best and latest acceptance among finished attempts, 0 to 1. */
      best: z.number().nullable(),
      latest: attemptSummarySchema.nullable(),
      passed: z.boolean(),
    }),
  ),
  /** Sections rated solid 21 or more days ago, or okay 10 or more days ago. Oldest first. */
  recall: z.array(
    z.object({
      lessonId: lessonIdSchema,
      title: z.string(),
      confidence: z.enum(CONFIDENCE_LEVELS),
      ratedAt: z.string(),
    }),
  ),
});
export type CheckpointsResponse = z.infer<typeof checkpointsResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Exercises

export const exerciseStatusSchema = z.enum(['new', 'tried', 'accepted']);

export const exerciseSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  estimatedMinutes: z.number().int(),
  hasTests: z.boolean(),
  status: exerciseStatusSchema,
});
export type ExerciseSummary = z.infer<typeof exerciseSummarySchema>;

export const exerciseResponseSchema = z.object({
  exercise: publicExerciseSchema,
  section: z.object({ id: lessonIdSchema, title: z.string() }),
  status: exerciseStatusSchema,
  tries: z.number().int(),
  feedback: z.string().nullable(),
  lastAnswer: answerInputSchema.nullable(),
  /** True once the learner asked to see the solution without being accepted. */
  revealed: z.boolean(),
  /** Unlocked after acceptance or a reveal. */
  solution: z
    .object({
      walkthrough: z.string(),
      finalAnswer: answerInputSchema,
      /** Reference files under solution/, downloadable once unlocked. */
      files: z.array(z.string()),
    })
    .nullable(),
});
export type ExerciseResponse = z.infer<typeof exerciseResponseSchema>;

export const exerciseAnswerRequestSchema = z.object({ answer: answerInputSchema });

export const exerciseAnswerResponseSchema = z.object({
  result: z.object({ accepted: z.boolean(), feedback: z.string() }),
  state: exerciseResponseSchema,
});
export type ExerciseAnswerResponse = z.infer<typeof exerciseAnswerResponseSchema>;

/** Download path for an exercise file. */
export const exerciseFileUrl = (exerciseId: string, file: string) =>
  `/api/exercises/${encodeURIComponent(exerciseId)}/files/${file.split('/').map(encodeURIComponent).join('/')}`;
