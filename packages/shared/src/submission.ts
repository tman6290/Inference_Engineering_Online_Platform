import { z } from 'zod';
import { sectionNumberSchema } from './book';
import {
  checkKindSchema,
  projectCheckSchema,
  projectSlugSchema,
  rubricDimensionSchema,
} from './project';

// Submissions, check results and critiques. A learner sees their own in full; their partner sees
// only the version number and the score (hard rule 2).

/** Submissions (and so critiques) per learner per hour. */
export const CRITIQUES_PER_HOUR = 3;
/** Uploads beside the repo, all files together. */
export const SUBMISSION_FILES_MAX_BYTES = 50 * 1024 * 1024;
export const SUBMISSION_FILE_TYPES = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'application/x-ipynb+json': '.ipynb',
  'application/zip': '.zip',
} as const;
/** Score and dimension floor for a portfolio-ready critique. */
export const PORTFOLIO_TOTAL = 80;
export const PORTFOLIO_DIMENSION_SHARE = 0.6;

export const submissionStatusSchema = z.enum([
  'queued',
  'checking',
  'critiquing',
  'graded',
  'failed',
]);
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;

/** GitHub over https only: https://github.com/<owner>/<repo>, optionally ending in .git. */
export const githubRepoUrlSchema = z
  .string()
  .trim()
  .regex(
    /^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}?(?:\.git)?\/?$/,
    'Use a GitHub https URL, like https://github.com/you/spec-bench.',
  );

export const createSubmissionRequestSchema = z.object({
  repoUrl: githubRepoUrlSchema,
  /** A full 40-character commit; the default branch's head when left out. */
  commitSha: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{40}$/, 'Use the full 40-character commit SHA.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  noteToGrader: z.string().trim().max(2000).optional(),
});
export type CreateSubmissionRequest = z.input<typeof createSubmissionRequestSchema>;

// ---------------------------------------------------------------------------------------------
// The critique: what the model returns, validated before anything is stored.

export const critiqueEvidenceSchema = z.object({
  kind: z.enum(['file', 'result', 'check']),
  /** A path (optionally path:line), a results.json key path, or a check id. */
  ref: z.string().min(1),
});

export const critiqueOutputSchema = z.object({
  total: z.number().min(0).max(100),
  dimensions: z.array(
    z.object({
      dimension: z.string(),
      score: z.number().min(0),
      max: z.number().positive(),
      reasoning: z.string(),
    }),
  ),
  /** At most 12 words. */
  headline: z.string(),
  right: z.array(z.string()),
  /** Every item points at evidence: a file, a result or a check. */
  wrong: z.array(z.object({ text: z.string(), evidence: critiqueEvidenceSchema })),
  /** A concrete next step, with the book section to read where one applies. */
  workOn: z.array(z.object({ step: z.string(), section: sectionNumberSchema.nullable() })),
  inlineComments: z.array(
    z.object({ path: z.string(), line: z.number().int().min(1), body: z.string() }),
  ),
  /** README claims that results.json and the checks don't back up. */
  unsupportedClaims: z.array(z.object({ claim: z.string(), why: z.string() })),
  portfolioReady: z.boolean(),
  skillsDemonstrated: z.array(z.string()),
});
export type CritiqueOutput = z.infer<typeof critiqueOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Views

export const submissionSummarySchema = z.object({
  id: z.string(),
  version: z.number().int(),
  status: submissionStatusSchema,
  repoUrl: z.string(),
  commitSha: z.string().nullable(),
  createdAt: z.string(),
  gradedAt: z.string().nullable(),
  total: z.number().nullable(),
  portfolioReady: z.boolean().nullable(),
  /** Shown as a public case study (only while the owner's page is live). */
  public: z.boolean(),
});
export type SubmissionSummary = z.infer<typeof submissionSummarySchema>;

/** All a partner may see: which version, and its score. */
export const partnerSubmissionSchema = z.object({
  displayName: z.string(),
  version: z.number().int(),
  total: z.number().nullable(),
});

const unlockFields = {
  unlockAfter: sectionNumberSchema,
  unlocked: z.boolean(),
};

export const projectCardSchema = z.object({
  slug: projectSlugSchema,
  number: z.number().int(),
  title: z.string(),
  chapter: z.object({ number: z.number().int(), title: z.string() }),
  summary: z.string(),
  estimatedHours: z.number(),
  needsGpu: z.boolean(),
  skills: z.array(z.string()),
  ...unlockFields,
  mine: submissionSummarySchema.nullable(),
  partner: partnerSubmissionSchema.nullable(),
});
export type ProjectCard = z.infer<typeof projectCardSchema>;

export const projectsResponseSchema = z.object({ projects: z.array(projectCardSchema) });

export const projectDetailSchema = projectCardSchema.extend({
  /** README.md, as Markdown. */
  brief: z.string(),
  deliverables: z.array(z.string()),
  constraints: z.array(z.string()),
  rubric: z.array(rubricDimensionSchema),
  requiredFiles: z.array(z.string()),
  readmeSections: z.array(z.string()),
  checks: z.array(z.object({ id: z.string(), kind: checkKindSchema, label: z.string() })),
  hasResultsSchema: z.boolean(),
  bookSections: z.array(z.object({ number: sectionNumberSchema, title: z.string() })),
  submissions: z.array(submissionSummarySchema),
  critiquesLeftThisHour: z.number().int(),
});
export type ProjectDetail = z.infer<typeof projectDetailSchema>;

export const submissionDetailSchema = submissionSummarySchema.extend({
  projectSlug: projectSlugSchema,
  noteToGrader: z.string().nullable(),
  failure: z.string().nullable(),
  checks: z.array(
    z.object({
      checkId: z.string(),
      kind: checkKindSchema,
      label: z.string(),
      passed: z.boolean(),
      log: z.string(),
      durationMs: z.number().int(),
    }),
  ),
  files: z.array(z.object({ name: z.string(), mime: z.string(), size: z.number().int() })),
  critique: critiqueOutputSchema
    .extend({ model: z.string(), costUsd: z.number().nullable(), createdAt: z.string() })
    .nullable(),
});
export type SubmissionDetail = z.infer<typeof submissionDetailSchema>;

// ---------------------------------------------------------------------------------------------
// The runner's protocol with the API (internal, token-authenticated).

export const runnerJobSchema = z.object({
  submissionId: z.string(),
  repoUrl: z.string(),
  commitSha: z.string().nullable(),
  project: z.object({
    slug: projectSlugSchema,
    requiredFiles: z.array(z.string()),
    readmeSections: z.array(z.string()),
    resultsSchema: z.record(z.string(), z.unknown()).nullable(),
    checks: z.array(projectCheckSchema),
  }),
});
export type RunnerJob = z.infer<typeof runnerJobSchema>;

/** Source files the critique reads: at most this many, each cut at this many lines. */
export const CRITIQUE_SOURCE_FILES = 12;
export const CRITIQUE_SOURCE_LINES = 400;
/** Logs are capped at this many bytes, keeping the tail. */
export const CHECK_LOG_BYTES = 200 * 1024;

export const runnerReportSchema = z.object({
  /** The commit actually checked. */
  commitSha: z.string().nullable(),
  checks: z.array(
    z.object({
      checkId: z.string(),
      kind: checkKindSchema,
      passed: z.boolean(),
      log: z.string(),
      durationMs: z.number().int().nonnegative(),
    }),
  ),
  artifacts: z.object({
    fileTree: z.array(z.string()),
    readme: z.string().nullable(),
    /** results.json as parsed JSON, or null when missing or unparsable. */
    results: z.unknown().nullable(),
    sources: z.array(z.object({ path: z.string(), content: z.string() })),
  }),
  /** Set when the job could not run at all, e.g. the clone failed. */
  error: z.string().nullable(),
});
export type RunnerReport = z.infer<typeof runnerReportSchema>;
