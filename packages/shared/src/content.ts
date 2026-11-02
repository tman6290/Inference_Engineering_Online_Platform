import { z } from 'zod';
import { figureNumberSchema, sectionNumberSchema, subsectionNumberSchema } from './book';

// Schemas for authored content under content/chapters/. Every file a learner reads or answers is
// written during development, validated by `pnpm content:validate`, and graded in code.

/** Words in a string, counted the way a reader would: runs of non-space characters. */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const text = z.string().trim().min(1, 'must not be empty');
const words = (max: number) =>
  text.refine((value) => wordCount(value) <= max, { message: `use at most ${max} words` });

/** A lesson page: a numbered section ("5.2"), Chapter 0 ("0") or the Preface ("preface"). */
export const lessonIdSchema = z.union([sectionNumberSchema, z.literal('0'), z.literal('preface')]);
export type LessonId = z.infer<typeof lessonIdSchema>;

/** Where a learner is sent back to after a miss: the lesson itself or one of its subsections. */
export const rereadSchema = z.union([lessonIdSchema, subsectionNumberSchema]);

/** Question ids are global, e.g. "5.2-mc-01". Attempts and duels store them. */
export const questionIdSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/,
    'use lowercase letters, digits, dots and hyphens, e.g. 5.2-mc-01',
  );

/** Exercise ids double as folder names under exercises/, e.g. "5.2-acceptance-rate". */
export const exerciseIdSchema = questionIdSchema;

/** A path inside an exercise folder. No absolute paths, backslashes or "..". */
export const relativePathSchema = z
  .string()
  .regex(/^(?!\/)(?![A-Za-z]:)[^\\]+$/, 'use a forward-slash path relative to the exercise folder')
  .refine((value) => value.split('/').every((part) => part !== '..' && part !== ''), {
    message: 'must stay inside the exercise folder',
  });

// ---------------------------------------------------------------------------------------------
// Answer keys

export const toleranceSchema = z.discriminatedUnion('kind', [
  /** Accept answers within ± value of the key, in the key's unit. */
  z.object({ kind: z.literal('absolute'), value: z.number().nonnegative() }),
  /** Accept answers within ± value × |key|. 0.05 means 5%. */
  z.object({ kind: z.literal('relative'), value: z.number().nonnegative().max(1) }),
]);
export type Tolerance = z.infer<typeof toleranceSchema>;

const unitName = z.string().trim().min(1).max(24);

/** Another unit the answer may be given in. One of `unit` equals `factor` of the key's unit. */
export const unitConversionSchema = z.object({
  unit: unitName,
  factor: z.number().positive(),
});

const calculationKeyShape = {
  answer: z.number(),
  tolerance: toleranceSchema,
  /** The unit `answer` is in, e.g. "GB" or "ms". */
  unit: unitName,
  acceptedUnits: z.array(unitConversionSchema).default([]),
};

export const normalisationSchema = z
  .object({
    foldCase: z.boolean().default(true),
    collapseWhitespace: z.boolean().default(true),
    /** Drops punctuation, keeping hyphens and decimal points between digits. */
    stripPunctuation: z.boolean().default(true),
    /** Treats hyphens and dashes as spaces, so "time-to-first-token" matches "time to first token". */
    foldHyphens: z.boolean().default(false),
  })
  .prefault({});
export type Normalisation = z.infer<typeof normalisationSchema>;

const textKeyShape = {
  /** The first answer is the canonical one; its shape is checked against a masked answerFormat. */
  acceptedAnswers: z.array(text).min(1),
  normalisation: normalisationSchema,
};

function uniqueUnits(
  key: { unit: string; acceptedUnits: { unit: string }[] },
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const unit of [key.unit, ...key.acceptedUnits.map((entry) => entry.unit)]) {
    if (seen.has(unit)) {
      ctx.addIssue({
        code: 'custom',
        path: ['acceptedUnits'],
        message: `unit "${unit}" is listed twice`,
      });
    }
    seen.add(unit);
  }
}

// ---------------------------------------------------------------------------------------------
// Questions

const questionBase = {
  id: questionIdSchema,
  /** The lesson the question belongs to. */
  sectionNumber: lessonIdSchema,
  /** The subsection it tests, or null for a lesson without subsections. */
  subsectionNumber: subsectionNumberSchema.nullable(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  prompt: text,
  /** Shown before answering, e.g. "number, in GB" or "*****". */
  answerFormat: text.max(60),
  /** Why the right answer is right and the tempting wrong one is wrong. Shown after grading. */
  explanation: text,
  reread: rereadSchema,
  /** A short quote from the section that grounds the question. */
  sourceQuote: words(25),
};

export const scenarioMcQuestionSchema = z
  .object({
    kind: z.literal('scenario_mc'),
    ...questionBase,
    options: z.array(text).length(4),
    correctIndex: z.number().int().min(0).max(3),
    /** Why the choice is right, with a section cite. */
    acceptedCopy: text,
    /** A nudge after a wrong choice. Must not give the answer away. */
    rejectedCopy: text,
    hint: text,
  })
  .superRefine((question, ctx) => {
    const seen = new Set(question.options.map((option) => option.toLowerCase()));
    if (seen.size !== question.options.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'options must be distinct' });
    }
  });

export const calculationQuestionSchema = z
  .object({
    kind: z.literal('calculation'),
    ...questionBase,
    ...calculationKeyShape,
    /** Shown only on request; asking for it marks the attempt "hinted". */
    methodHint: text,
    /** Shown after grading. */
    workedSolution: text,
  })
  .superRefine(uniqueUnits);

export const textQuestionSchema = z.object({
  kind: z.literal('text'),
  ...questionBase,
  ...textKeyShape,
  hint: text,
});

export const questionSchema = z.discriminatedUnion('kind', [
  scenarioMcQuestionSchema,
  calculationQuestionSchema,
  textQuestionSchema,
]);
export type Question = z.infer<typeof questionSchema>;
export type QuestionKind = Question['kind'];
export type ScenarioMcQuestion = z.infer<typeof scenarioMcQuestionSchema>;
export type CalculationQuestion = z.infer<typeof calculationQuestionSchema>;
export type TextQuestion = z.infer<typeof textQuestionSchema>;

// ---------------------------------------------------------------------------------------------
// Checkpoint banks

/** A checkpoint draws 10 questions: 4 scenario_mc, 3 calculation, 3 text. Pass is 7 first-try. */
export const CHECKPOINT_MIX = { scenario_mc: 4, calculation: 3, text: 3 } as const;
export const CHECKPOINT_SIZE = 10;
export const CHECKPOINT_PASS = 7;

/**
 * A bank holds at least 24 questions: 10 scenario_mc, 7 calculation and 7 text. A section without
 * numbers to calculate makes up the missing calculation questions with scenario_mc.
 */
export const BANK_RULES = {
  minTotal: 24,
  minScenarioMc: 10,
  minCalculation: 7,
  minText: 7,
} as const;

export function countKinds(questions: { kind: QuestionKind }[]): Record<QuestionKind, number> {
  const counts: Record<QuestionKind, number> = { scenario_mc: 0, calculation: 0, text: 0 };
  for (const question of questions) counts[question.kind]++;
  return counts;
}

export const checkpointBankSchema = z
  .object({
    sectionNumber: sectionNumberSchema,
    questions: z.array(questionSchema),
  })
  .superRefine((bank, ctx) => {
    const counts = countKinds(bank.questions);
    const { minTotal, minScenarioMc, minCalculation, minText } = BANK_RULES;
    const fail = (message: string) =>
      ctx.addIssue({ code: 'custom', path: ['questions'], message });

    if (bank.questions.length < minTotal) {
      fail(`needs at least ${minTotal} questions, has ${bank.questions.length}`);
    }
    if (counts.text < minText) fail(`needs at least ${minText} text questions, has ${counts.text}`);
    if (counts.scenario_mc < minScenarioMc) {
      fail(`needs at least ${minScenarioMc} scenario_mc questions, has ${counts.scenario_mc}`);
    }
    if (counts.scenario_mc + counts.calculation < minScenarioMc + minCalculation) {
      fail(
        `needs ${minCalculation} calculation questions, or extra scenario_mc to make up the ` +
          `difference; has ${counts.calculation} calculation and ${counts.scenario_mc} scenario_mc`,
      );
    }

    const seen = new Set<string>();
    bank.questions.forEach((question, index) => {
      if (seen.has(question.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['questions', index, 'id'],
          message: `duplicate id "${question.id}"`,
        });
      }
      seen.add(question.id);
      if (question.sectionNumber !== bank.sectionNumber) {
        ctx.addIssue({
          code: 'custom',
          path: ['questions', index, 'sectionNumber'],
          message: `is ${question.sectionNumber}, but the bank is for ${bank.sectionNumber}`,
        });
      }
    });
  });
export type CheckpointBank = z.infer<typeof checkpointBankSchema>;

// ---------------------------------------------------------------------------------------------
// Answers a learner submits

export const answerInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('scenario_mc'), choice: z.number().int() }),
  /** `unit` defaults to the key's unit. */
  z.object({
    kind: z.literal('calculation'),
    value: z.number(),
    unit: z.string().max(24).optional(),
  }),
  z.object({ kind: z.literal('text'), text: z.string().max(500) }),
]);
export type AnswerInput = z.infer<typeof answerInputSchema>;

// ---------------------------------------------------------------------------------------------
// Exercises

export const calculationKeySchema = z
  .object({ kind: z.literal('calculation'), ...calculationKeyShape })
  .superRefine(uniqueUnits);
export const textKeySchema = z.object({ kind: z.literal('text'), ...textKeyShape });
export const answerKeySchema = z.discriminatedUnion('kind', [calculationKeySchema, textKeySchema]);
export type CalculationKey = z.infer<typeof calculationKeySchema>;
export type TextKey = z.infer<typeof textKeySchema>;
export type AnswerKey = z.infer<typeof answerKeySchema>;

export const exerciseSchema = z
  .object({
    id: exerciseIdSchema,
    sectionNumber: lessonIdSchema,
    title: text.max(80),
    /** Markdown. */
    brief: text,
    steps: z.array(text).min(1),
    answerFormat: text.max(60),
    answer: answerKeySchema,
    solution: z.object({
      /** Markdown walkthrough, shown after the learner submits. */
      walkthrough: text,
      /** The answer the walkthrough arrives at. The validator grades it against `answer`. */
      finalAnswer: answerInputSchema,
    }),
    /** Files the learner starts from, inside the exercise folder. */
    starterFiles: z.array(relativePathSchema).default([]),
    /** Local tests the learner runs on CPU, when the exercise involves code. */
    tests: z
      .object({
        runner: z.enum(['pytest', 'vitest']),
        command: text,
        files: z.array(relativePathSchema).min(1),
      })
      .optional(),
    estimatedMinutes: z.number().int().min(1).max(240),
  })
  .superRefine((exercise, ctx) => {
    if (exercise.solution.finalAnswer.kind !== exercise.answer.kind) {
      ctx.addIssue({
        code: 'custom',
        path: ['solution', 'finalAnswer', 'kind'],
        message: `is "${exercise.solution.finalAnswer.kind}", but the answer key is "${exercise.answer.kind}"`,
      });
    }
  });
export type Exercise = z.infer<typeof exerciseSchema>;

// ---------------------------------------------------------------------------------------------
// Digests: the Lesson page's notes, one per lesson

const tableCell = z.union([z.string(), z.number()]);

export const digestSchema = z
  .object({
    lesson: lessonIdSchema,
    oneLine: words(40),
    /** Markdown. Original writing that cites subsections; never sentences copied from the book. */
    summary: words(200),
    mechanism: z
      .array(z.object({ title: words(4), body: words(20) }))
      .min(3)
      .max(5),
    /** A named analogy or rule from the section. */
    callout: z.object({ name: text.max(60), body: words(60) }).optional(),
    figureRefs: z.array(z.object({ figure: figureNumberSchema, lookFor: words(25) })).default([]),
    keyCards: z
      .array(z.object({ label: text.max(24), title: words(8), body: words(20) }))
      .min(2)
      .max(4),
    workedExample: z
      .object({
        title: text.max(80),
        setup: words(120),
        table: z.object({
          columns: z.array(text).min(2).max(6),
          rows: z.array(z.array(tableCell)).min(1).max(12),
        }),
        conclusion: z.object({ text: words(50), keyNumber: text.max(40) }),
      })
      .optional(),
    /** The inline "Check yourself" question. */
    checkQuestion: questionSchema,
    /** An open "explain it" prompt. Never graded: the learner compares with the model answer. */
    reflect: z
      .object({
        prompt: words(60),
        modelAnswer: words(250),
        points: z.array(words(25)).min(3).max(5),
      })
      .optional(),
    /** Glossary terms used on the page. */
    terms: z.array(text).min(3).max(5),
    subsectionCards: z.array(
      z.object({
        number: subsectionNumberSchema,
        title: text,
        hook: words(15),
        readingMinutes: z.number().int().min(1).max(120),
      }),
    ),
  })
  .superRefine((digest, ctx) => {
    if (digest.checkQuestion.sectionNumber !== digest.lesson) {
      ctx.addIssue({
        code: 'custom',
        path: ['checkQuestion', 'sectionNumber'],
        message: `is ${digest.checkQuestion.sectionNumber}, but the digest is for ${digest.lesson}`,
      });
    }
    const table = digest.workedExample?.table;
    table?.rows.forEach((row, index) => {
      if (row.length !== table.columns.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['workedExample', 'table', 'rows', index],
          message: `has ${row.length} cells for ${table.columns.length} columns`,
        });
      }
    });
  });
export type Digest = z.infer<typeof digestSchema>;

// ---------------------------------------------------------------------------------------------
// chapter.json

export const chapterManifestSchema = z
  .object({
    /** The folder name: the outline's chapter slug ("05-techniques") or "preface". */
    slug: z.string().min(1),
    title: text,
    /** Authored lessons in reading order. Each has a digest; numbered sections also have a bank. */
    lessons: z.array(lessonIdSchema).min(1),
    exercises: z.array(exerciseIdSchema).default([]),
  })
  .superRefine((manifest, ctx) => {
    for (const key of ['lessons', 'exercises'] as const) {
      const list: string[] = manifest[key];
      const duplicates = list.filter((item, index) => list.indexOf(item) !== index);
      for (const duplicate of new Set(duplicates)) {
        ctx.addIssue({ code: 'custom', path: [key], message: `"${duplicate}" is listed twice` });
      }
    }
  });
export type ChapterManifest = z.infer<typeof chapterManifestSchema>;
