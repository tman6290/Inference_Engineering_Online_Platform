import { z } from 'zod';
import { sectionNumberSchema } from './book';
import { lessonIdSchema, questionIdSchema } from './content';

// The pod: standings, duels and teach-backs. Projects stay individual and never appear here.

/** A duel runs for this long from the challenge; unfinished duels then count for nobody. */
export const DUEL_HOURS = 48;
/** A teach-back's audio file may be at most this many bytes. */
export const TEACH_BACK_AUDIO_MAX_BYTES = 5 * 1024 * 1024;
export const TEACH_BACK_AUDIO_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-m4a',
] as const;

export const duelStatusSchema = z.enum(['pending', 'open', 'complete', 'expired']);
export type DuelStatus = z.infer<typeof duelStatusSchema>;

const member = z.object({
  id: z.string(),
  displayName: z.string(),
  initial: z.string(),
  colour: z.enum(['lime', 'butter']),
});

export const duelSchema = z.object({
  id: z.string(),
  section: z.object({ number: sectionNumberSchema, title: z.string() }),
  status: duelStatusSchema,
  role: z.enum(['challenger', 'opponent']),
  partner: member,
  createdAt: z.string(),
  deadline: z.string(),
  questionCount: z.number().int(),
  mine: z.object({
    attemptId: z.string().nullable(),
    finished: z.boolean(),
    firstTryAccepted: z.number().int().nullable(),
    hints: z.number().int().nullable(),
  }),
  /** The partner's score stays null until both attempts are finished. */
  theirs: z.object({
    started: z.boolean(),
    finished: z.boolean(),
    firstTryAccepted: z.number().int().nullable(),
    hints: z.number().int().nullable(),
  }),
  outcome: z.enum(['won', 'lost', 'draw']).nullable(),
  teachBack: z.object({
    /** Who owes one: the loser of a complete duel. */
    owedBy: z.enum(['me', 'partner']).nullable(),
    recorded: z.boolean(),
  }),
});
export type DuelView = z.infer<typeof duelSchema>;

export const duelsResponseSchema = z.object({ duels: z.array(duelSchema) });
export type DuelsResponse = z.infer<typeof duelsResponseSchema>;

export const createDuelRequestSchema = z.object({ sectionNumber: sectionNumberSchema });

export const duelRecordSchema = z.object({
  wins: z.number().int(),
  losses: z.number().int(),
  draws: z.number().int(),
});

export const standingSchema = member.extend({
  isYou: z.boolean(),
  decoded: z.number().int(),
  acceptanceRate: z.number().nullable(),
  projectsShipped: z.number().int(),
  uptime: z.number().int(),
  lastActivity: z
    .object({ at: z.string(), lessonId: lessonIdSchema, title: z.string() })
    .nullable(),
  duels: duelRecordSchema,
});
export type Standing = z.infer<typeof standingSchema>;

/** The section to offer a duel on: the latest one both have read that has a bank and no live duel. */
export const challengeSchema = z
  .object({ sectionNumber: sectionNumberSchema, title: z.string() })
  .nullable();

export const standingsResponseSchema = z.object({
  members: z.array(standingSchema),
  challenge: challengeSchema,
});
export type StandingsResponse = z.infer<typeof standingsResponseSchema>;

export const teachBackRequestSchema = z.object({
  entries: z.array(z.object({ questionId: questionIdSchema, text: z.string().trim().max(2000) })),
});

export const teachBackSchema = z.object({
  duelId: z.string(),
  section: z.object({ number: sectionNumberSchema, title: z.string() }),
  author: z.object({ displayName: z.string() }),
  entries: z.array(z.object({ questionId: z.string(), prompt: z.string(), text: z.string() })),
  /** Same-origin URL to stream the recording, when there is one. */
  audioUrl: z.string().nullable(),
  createdAt: z.string(),
});
export type TeachBackView = z.infer<typeof teachBackSchema>;

/** What the teach-back form needs: the questions the loser missed. */
export const teachBackFormSchema = z.object({
  duel: duelSchema,
  missed: z.array(
    z.object({ questionId: z.string(), prompt: z.string(), explanation: z.string() }),
  ),
  teachBack: teachBackSchema.nullable(),
});
export type TeachBackForm = z.infer<typeof teachBackFormSchema>;
