import { z } from 'zod';
import { projectSlugSchema } from './project';

// The opt-in public layer: a profile at /p/<username> and one case study per public project.
// Public views are strict objects built field by field, so nothing private (the "wrong" list,
// inline comments, dimension reasoning, notes to the grader) can ride along by accident.

/** 3 to 32 characters: lowercase letters, digits and single hyphens inside. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,31}$/,
    'Use 3 to 32 lowercase letters, digits or hyphens, starting and ending with a letter or digit.',
  );

export const portfolioSettingsRequestSchema = z
  .object({
    username: usernameSchema.nullable(),
    pageLive: z.boolean(),
  })
  .refine((settings) => !settings.pageLive || settings.username !== null, {
    path: ['username'],
    message: 'Pick a username before putting the page live.',
  });
export type PortfolioSettingsRequest = z.infer<typeof portfolioSettingsRequestSchema>;

export const visibilityRequestSchema = z.object({ public: z.boolean() });

/** One portfolio-ready project of the signed-in learner, for the Progress page. */
export const portfolioEntrySchema = z.object({
  slug: projectSlugSchema,
  number: z.number().int(),
  title: z.string(),
  /** The newest portfolio-ready version. */
  submissionId: z.string(),
  version: z.number().int(),
  total: z.number(),
  /** Whether a version of this project is public, and which. */
  publicVersion: z.number().int().nullable(),
});
export type PortfolioEntry = z.infer<typeof portfolioEntrySchema>;

export const portfolioResponseSchema = z.object({
  username: z.string().nullable(),
  pageLive: z.boolean(),
  /** Projects with a portfolio-ready version: the "projects shipped" count. */
  shipped: z.array(portfolioEntrySchema),
});
export type PortfolioResponse = z.infer<typeof portfolioResponseSchema>;

export const publicProfileSchema = z.strictObject({
  username: z.string(),
  displayName: z.string(),
  /** Chapters whose every section's checkpoint is passed. */
  chaptersComplete: z.number().int(),
  chaptersTotal: z.number().int(),
  acceptanceRate: z.number().nullable(),
  /** Skills named in public case studies. */
  skills: z.array(z.string()),
  projects: z.array(
    z.strictObject({
      slug: projectSlugSchema,
      number: z.number().int(),
      title: z.string(),
      chapterNumber: z.number().int(),
      total: z.number(),
      decision: z.string().nullable(),
    }),
  ),
});
export type PublicProfile = z.infer<typeof publicProfileSchema>;

export const caseStudySchema = z.strictObject({
  username: z.string(),
  displayName: z.string(),
  slug: projectSlugSchema,
  number: z.number().int(),
  title: z.string(),
  chapter: z.strictObject({ number: z.number().int(), title: z.string() }),
  /** The README's opening decision, in one line. */
  decision: z.string().nullable(),
  /** Up to three uploaded PNG charts. */
  charts: z.array(z.strictObject({ name: z.string(), url: z.string() })),
  total: z.number(),
  dimensions: z.array(
    z.strictObject({ dimension: z.string(), score: z.number(), max: z.number() }),
  ),
  skillsDemonstrated: z.array(z.string()),
  /** The critique's "what is right" list. */
  right: z.array(z.string()),
  repoUrl: z.string(),
  commitSha: z.string().nullable(),
  version: z.number().int(),
  gradedAt: z.string().nullable(),
});
export type CaseStudy = z.infer<typeof caseStudySchema>;

/** Critique fields that never appear in a public view. Tests assert none survives. */
export const PRIVATE_CRITIQUE_FIELDS = [
  'wrong',
  'workOn',
  'inlineComments',
  'unsupportedClaims',
  'reasoning',
  'noteToGrader',
  'costUsd',
  'model',
  'checks',
  'failure',
] as const;

export const CASE_STUDY_CHARTS = 3;
const DECISION_MAX = 240;

/** Markdown inline syntax reduced to its text. */
function plain(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The decision a README opens with: the first paragraph of its first section (the first "##"
 * heading, or the text under the title when there is none), cut to its first sentence and at
 * most 240 characters. Null when the README has no prose.
 */
export function extractDecision(readme: string | null): string | null {
  if (!readme) return null;
  const lines = readme.replace(/\r\n/g, '\n').split('\n');
  const firstSection = lines.findIndex((line) => /^##\s/.test(line));
  const body =
    firstSection >= 0 ? lines.slice(firstSection + 1) : lines.filter((line) => !/^#\s/.test(line));

  const paragraph: string[] = [];
  let inFence = false;
  for (const line of body) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence;
      if (paragraph.length) break;
      continue;
    }
    if (inFence) continue;
    if (/^#{1,6}\s/.test(trimmed)) {
      if (paragraph.length) break;
      continue;
    }
    if (!trimmed || /^(<!--|\||!\[)/.test(trimmed)) {
      if (paragraph.length) break;
      continue;
    }
    paragraph.push(trimmed.replace(/^([-*+]|\d+\.)\s+|^>\s*/, ''));
  }
  const text = plain(paragraph.join(' '));
  if (!text) return null;
  const sentence = /^(.+?[.!?])(?:\s|$)/.exec(text)?.[1] ?? text;
  return sentence.length > DECISION_MAX
    ? `${sentence.slice(0, DECISION_MAX - 1).trimEnd()}…`
    : sentence;
}
