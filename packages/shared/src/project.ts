import { z } from 'zod';
import { sectionNumberSchema } from './book';
import { relativePathSchema } from './content';

// Project specs under content/projects/<nn>-<slug>/project.json, with the brief beside them in
// README.md. One solo deliverable per chapter, graded by checks first and then a critique.

const text = z.string().trim().min(1, 'must not be empty');

export const projectSlugSchema = z
  .string()
  .regex(/^0[1-7]-[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use <nn>-<words>, e.g. 05-speculation-benchmark');

/** A glob inside the learner's repo, e.g. "results.json" or "charts/*.png". No "..", no leading "/". */
export const repoGlobSchema = z
  .string()
  .regex(/^(?!\/)[^\\]+$/, 'use a forward-slash path relative to the repo root')
  .refine((value) => !value.split('/').includes('..'), { message: 'must stay inside the repo' });

export const checkKindSchema = z.enum(['files', 'readme', 'results', 'run']);

export const projectCheckSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'use lowercase letters, digits and hyphens'),
    kind: checkKindSchema,
    /** What the check proves, shown on the Submission tab. */
    label: text.max(80),
    /** For `run`: the command, run in the repo root inside the sandbox. */
    cmd: text.optional(),
    /** For `run`: hard limit, after which the container is killed. */
    timeoutSec: z.number().int().min(10).max(900).optional(),
    expect: z
      .object({
        exitCode: z.number().int().default(0),
        /** Each string must appear in stdout. */
        stdoutIncludes: z.array(text).default([]),
      })
      .optional(),
  })
  .superRefine((check, ctx) => {
    if (check.kind === 'run' && !check.cmd) {
      ctx.addIssue({ code: 'custom', path: ['cmd'], message: 'a run check needs a cmd' });
    }
    if (check.kind !== 'run' && (check.cmd || check.timeoutSec)) {
      ctx.addIssue({
        code: 'custom',
        path: ['cmd'],
        message: 'only run checks take cmd and timeoutSec',
      });
    }
  });
export type ProjectCheck = z.infer<typeof projectCheckSchema>;

export const rubricDimensionSchema = z.object({
  dimension: text.max(40),
  weight: z.number().int().min(1).max(100),
  criteria: z.array(text).min(1),
});

export const projectSpecSchema = z
  .object({
    slug: projectSlugSchema,
    number: z.number().int().min(1).max(7),
    title: text.max(80),
    chapter: z.number().int().min(1).max(7),
    /** Passing this section's checkpoint opens the project; usually the chapter's last section. */
    unlockAfterSection: sectionNumberSchema,
    estimatedHours: z.number().positive().max(80),
    needsGpu: z.boolean(),
    summary: text.max(400),
    deliverables: z.array(text).min(1),
    constraints: z.array(text).default([]),
    skills: z.array(text.max(40)).min(1),
    /** Weights sum to 100. */
    rubric: z.array(rubricDimensionSchema).min(2),
    requiredFiles: z.array(repoGlobSchema).min(1),
    /** README headings that must exist, matched case-insensitively ("## Decision"). */
    readmeSections: z.array(text).default([]),
    /** JSON Schema for the learner's results.json, or null when the project has no numbers. */
    resultsSchema: z.record(z.string(), z.unknown()).nullable(),
    /** Run in order. */
    checks: z.array(projectCheckSchema).min(1),
    /** Sections whose book text the critique reads. */
    bookSections: z.array(sectionNumberSchema).min(1),
  })
  .superRefine((spec, ctx) => {
    const total = spec.rubric.reduce((sum, row) => sum + row.weight, 0);
    if (total !== 100) {
      ctx.addIssue({
        code: 'custom',
        path: ['rubric'],
        message: `weights sum to ${total}, not 100`,
      });
    }
    if (!spec.slug.startsWith(`0${spec.number}-`)) {
      ctx.addIssue({ code: 'custom', path: ['slug'], message: `must start with 0${spec.number}-` });
    }
    const ids = spec.checks.map((check) => check.id);
    for (const id of new Set(ids.filter((id, index) => ids.indexOf(id) !== index))) {
      ctx.addIssue({ code: 'custom', path: ['checks'], message: `check id "${id}" is used twice` });
    }
    if (spec.needsGpu && !spec.checks.some((check) => check.kind === 'run')) {
      ctx.addIssue({
        code: 'custom',
        path: ['checks'],
        message: 'a GPU project needs a run check that proves the --dry-run path on CPU',
      });
    }
    if (spec.resultsSchema && !spec.checks.some((check) => check.kind === 'results')) {
      ctx.addIssue({
        code: 'custom',
        path: ['checks'],
        message: 'resultsSchema needs a results check',
      });
    }
  });
export type ProjectSpec = z.infer<typeof projectSpecSchema>;

/** Paths inside a project folder that may be copied into the sandbox, e.g. checks/verify.py. */
export const projectAssetSchema = relativePathSchema;
