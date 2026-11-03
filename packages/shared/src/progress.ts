import { z } from 'zod';
import { sectionNumberSchema } from './book';
import { CONFIDENCE_LEVELS } from './constants';
import { lessonIdSchema } from './content';

// Progress, Home and recall. Dates are study days in Africa/Lagos, written YYYY-MM-DD.

export const studyDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Weights for mastery: 0.7 × latest checkpoint acceptance + 0.3 × this. */
export const CONFIDENCE_WEIGHT = { shaky: 0.3, okay: 0.7, solid: 1 } as const;
/** A study day needs a graded answer, a project event or this much reading. */
export const STUDY_DAY_MINUTES = 10;
/** The Home board's weekly reading goal. */
export const WEEK_GOAL_MINUTES = 300;
/** Recall attempts ask this many questions per section, for at most RECALL_SECTIONS sections. */
export const RECALL_QUESTIONS_PER_SECTION = 3;
export const RECALL_SECTIONS = 4;
/** Home lists a section as shaky below this checkpoint acceptance. */
export const SHAKY_ACCEPTANCE = 0.6;

export const recallItemSchema = z.object({
  lessonId: lessonIdSchema,
  title: z.string(),
  confidence: z.enum(CONFIDENCE_LEVELS),
  ratedAt: z.string(),
});
export type RecallItem = z.infer<typeof recallItemSchema>;

export const studyDaySchema = z.object({
  date: studyDateSchema,
  /** 0 is no study; 1 to 3 are the heatmap's steps. */
  intensity: z.number().int().min(0).max(3),
  readingMinutes: z.number().int(),
  sectionsRead: z.number().int(),
  answersGraded: z.number().int(),
});
export type StudyDayView = z.infer<typeof studyDaySchema>;

const masteryValue = z.number().min(0).max(1);

export const progressPageSchema = z.object({
  today: studyDateSchema,
  /** Twelve weeks, oldest first, starting on a Monday and ending today. */
  days: z.array(studyDaySchema),
  uptime: z.object({ current: z.number().int(), longest: z.number().int() }),
  stats: z.object({
    readingHours: z.number(),
    decoded: z.number().int(),
    /** Over the last four weeks. */
    sectionsPerWeek: z.number(),
    /** When the last section gets read at the current pace; null with no pace yet. */
    projectedFinish: studyDateSchema.nullable(),
    acceptanceRate: z.number().nullable(),
  }),
  patterns: z.object({
    /** 0 is Monday. Null before any study. */
    bestWeekday: z.number().int().min(0).max(6).nullable(),
    typicalSessionMinutes: z.number().int().nullable(),
    /** Days without study in the most recent break, or null if there hasn't been one. */
    lastGapDays: z.number().int().nullable(),
  }),
  partner: z
    .object({
      displayName: z.string(),
      sectionsPerWeek: z.number(),
      uptime: z.number().int(),
      readingHours: z.number(),
    })
    .nullable(),
  mastery: z.array(
    z.object({
      number: z.number().int(),
      title: z.string(),
      mine: masteryValue,
      partner: masteryValue.nullable(),
      sections: z.array(
        z.object({
          number: sectionNumberSchema,
          title: z.string(),
          mine: masteryValue,
          partner: masteryValue.nullable(),
        }),
      ),
    }),
  ),
  recall: z.array(recallItemSchema),
});
export type ProgressPage = z.infer<typeof progressPageSchema>;

export const homeResponseSchema = z.object({
  today: studyDateSchema,
  continue: z
    .object({
      lessonId: lessonIdSchema,
      title: z.string(),
      /** "5.2", or null for the Preface and Chapter 0. */
      number: z.string().nullable(),
      chapter: z.object({ number: z.number().int(), title: z.string() }).nullable(),
      /** Position in the chapter, e.g. 2 of 5. */
      position: z.object({ index: z.number().int(), of: z.number().int() }).nullable(),
      maxScrollPct: z.number().int(),
      minutesLeft: z.number().int(),
      hasCheckpoint: z.boolean(),
    })
    .nullable(),
  tiles: z.object({
    decoded: z.number().int(),
    acceptanceRate: z.number().nullable(),
    projectsShipped: z.number().int(),
    projectsTotal: z.number().int(),
    weekMinutes: z.number().int(),
    /** Reading minutes Monday to Sunday of this week; future days are 0. */
    weekDays: z.array(z.number().int()).length(7),
    weekGoalMinutes: z.number().int(),
  }),
  standings: z.array(
    z.object({
      id: z.string(),
      displayName: z.string(),
      initial: z.string(),
      colour: z.enum(['lime', 'butter']),
      isYou: z.boolean(),
      decoded: z.number().int(),
      acceptanceRate: z.number().nullable(),
      projectsShipped: z.number().int(),
      uptime: z.number().int(),
      lastActivity: z
        .object({ at: z.string(), lessonId: lessonIdSchema, title: z.string() })
        .nullable(),
    }),
  ),
  /** The project of the chapter in progress; it opens when that chapter's last checkpoint passes. */
  nextProject: z
    .object({
      chapterNumber: z.number().int(),
      chapterTitle: z.string(),
      unlockAfter: sectionNumberSchema,
      unlocked: z.boolean(),
    })
    .nullable(),
  shaky: z.array(
    z.object({
      lessonId: lessonIdSchema,
      title: z.string(),
      reason: z.enum(['rated-shaky', 'low-score']),
      /** Latest checkpoint acceptance, when there is one. */
      acceptance: z.number().nullable(),
    }),
  ),
});
export type HomeResponse = z.infer<typeof homeResponseSchema>;
