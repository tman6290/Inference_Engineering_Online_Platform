import { z } from 'zod';
import { subsectionNumberSchema } from './book';
import {
  type AnswerInput,
  type AnswerKey,
  type CalculationKey,
  type Exercise,
  type Normalisation,
  type Question,
  type ScenarioMcQuestion,
  type TextKey,
  lessonIdSchema,
  normalisationSchema,
  questionIdSchema,
  toleranceSchema,
} from './content';

// Pure graders for authored questions and exercises. No I/O and no model calls: every answer is
// checked against its key, so grading is instant, repeatable and the same for both learners.

export interface GradeResult {
  accepted: boolean;
  /** What was compared: the normalised text, the value in the key's unit, or the chosen index. */
  normalised: string | number | null;
  /** Shown to the learner. Never contains the answer to a question they got wrong. */
  feedback: string;
}

const reject = (feedback: string, normalised: string | number | null = null): GradeResult => ({
  accepted: false,
  normalised,
  feedback,
});

// ---------------------------------------------------------------------------------------------
// Text

// Hyphen, non-breaking hyphen, figure dash, en and em dash, horizontal bar, minus, small and
// full-width hyphen-minus.
const DASHES = /[‐-―−﹘﹣－]/g;
const QUOTES_SINGLE = /[‘’‚‛′]/g;
const QUOTES_DOUBLE = /[“”„‟″]/g;
const DECIMAL_MARK = '\u0000';

/** Applies a text key's normalisation. Used on both the learner's answer and the accepted ones. */
export function normaliseText(input: string, options: Partial<Normalisation> = {}): string {
  const rules = normalisationSchema.parse(options);
  let value = input
    .normalize('NFKC')
    .replace(DASHES, '-')
    .replace(QUOTES_SINGLE, "'")
    .replace(QUOTES_DOUBLE, '"');

  if (rules.foldCase) value = value.toLowerCase();
  if (rules.foldHyphens) value = value.replace(/-/g, ' ');
  if (rules.stripPunctuation) {
    value = value
      // Thousands separators between digits go: "1,024" reads as "1024".
      .replace(/(?<=\d),(?=\d{3}\b)/g, '')
      // Decimal points between digits stay: "3.5" must not become "35".
      .replace(/(?<=\d)\.(?=\d)/g, DECIMAL_MARK)
      .replace(/[\p{P}]/gu, (mark) => (mark === '-' ? '-' : ' '))
      .replace(new RegExp(DECIMAL_MARK, 'g'), '.');
  }
  if (rules.collapseWhitespace) value = value.replace(/\s+/g, ' ');
  return value.trim();
}

export function gradeText(
  key: Pick<TextKey, 'acceptedAnswers' | 'normalisation'>,
  input: string,
): GradeResult {
  const normalised = normaliseText(input, key.normalisation);
  if (!normalised) return reject('Enter an answer.', normalised);
  const accepted = key.acceptedAnswers.some(
    (answer) => normaliseText(answer, key.normalisation) === normalised,
  );
  return accepted
    ? { accepted, normalised, feedback: 'Accepted.' }
    : reject('Not accepted. Check the answer format and the spelling.', normalised);
}

// ---------------------------------------------------------------------------------------------
// Calculation

/** The factor that converts a value in `unit` to the key's unit, or an error message. */
function resolveUnit(
  key: Pick<CalculationKey, 'unit' | 'acceptedUnits'>,
  unit: string | undefined,
): { factor: number } | { error: string } {
  const units = [{ unit: key.unit, factor: 1 }, ...key.acceptedUnits];
  const wanted = (unit ?? '').trim();
  if (!wanted) return { factor: 1 };

  const exact = units.find((entry) => entry.unit === wanted);
  if (exact) return { factor: exact.factor };

  // "gb" for "GB" is fine; "gb" when both "GB" and "Gb" are accepted is ambiguous.
  const loose = units.filter((entry) => entry.unit.toLowerCase() === wanted.toLowerCase());
  if (loose.length === 1) return { factor: loose[0]!.factor };

  const names = units.map((entry) => entry.unit).join(', ');
  return { error: `"${wanted}" isn't a unit this answer takes. Use one of: ${names}.` };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)));
}

export function gradeCalculation(
  key: Pick<CalculationKey, 'answer' | 'tolerance' | 'unit' | 'acceptedUnits'>,
  value: number,
  unit?: string,
): GradeResult {
  if (typeof value !== 'number' || !Number.isFinite(value)) return reject('Enter a number.');

  const resolved = resolveUnit(key, unit);
  if ('error' in resolved) return reject(resolved.error);

  const converted = value * resolved.factor;
  const allowed =
    key.tolerance.kind === 'absolute'
      ? key.tolerance.value
      : key.tolerance.value * Math.abs(key.answer);
  // Room for floating-point error, so a tolerance edge like 0.1 + 0.2 still counts as inside.
  const epsilon = 1e-9 * Math.max(1, Math.abs(key.answer), allowed);
  const accepted = Math.abs(converted - key.answer) <= allowed + epsilon;

  return accepted
    ? {
        accepted,
        normalised: converted,
        feedback: `Accepted: ${formatNumber(converted)} ${key.unit}.`,
      }
    : reject('Not within tolerance. Check the method and the units.', converted);
}

// ---------------------------------------------------------------------------------------------
// Multiple choice

export function gradeScenarioMc(
  question: Pick<ScenarioMcQuestion, 'options' | 'correctIndex' | 'acceptedCopy' | 'rejectedCopy'>,
  choice: number,
): GradeResult {
  if (!Number.isInteger(choice) || choice < 0 || choice >= question.options.length) {
    return reject('Pick one of the options.');
  }
  return choice === question.correctIndex
    ? { accepted: true, normalised: choice, feedback: question.acceptedCopy }
    : reject(question.rejectedCopy, choice);
}

// ---------------------------------------------------------------------------------------------
// Entry points

const KIND_MISMATCH = "This answer doesn't match the question type.";

export function grade(question: Question, answer: AnswerInput): GradeResult {
  if (question.kind !== answer.kind) return reject(KIND_MISMATCH);
  switch (question.kind) {
    case 'scenario_mc':
      return gradeScenarioMc(
        question,
        (answer as Extract<AnswerInput, { kind: 'scenario_mc' }>).choice,
      );
    case 'calculation': {
      const { value, unit } = answer as Extract<AnswerInput, { kind: 'calculation' }>;
      return gradeCalculation(question, value, unit);
    }
    case 'text':
      return gradeText(question, (answer as Extract<AnswerInput, { kind: 'text' }>).text);
  }
}

export function gradeAnswerKey(key: AnswerKey, answer: AnswerInput): GradeResult {
  if (key.kind !== answer.kind) return reject(KIND_MISMATCH);
  if (key.kind === 'calculation') {
    const { value, unit } = answer as Extract<AnswerInput, { kind: 'calculation' }>;
    return gradeCalculation(key, value, unit);
  }
  return gradeText(key, (answer as Extract<AnswerInput, { kind: 'text' }>).text);
}

export function gradeExercise(exercise: Exercise, answer: AnswerInput): GradeResult {
  return gradeAnswerKey(exercise.answer, answer);
}

// ---------------------------------------------------------------------------------------------
// What the browser may see. Built by whitelist, so a key field added to a schema later can't leak.

const publicBase = {
  id: questionIdSchema,
  sectionNumber: lessonIdSchema,
  subsectionNumber: subsectionNumberSchema.nullable(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  prompt: z.string(),
  answerFormat: z.string(),
  /** Hints are fetched separately, so asking for one can be logged. */
  hasHint: z.boolean(),
};

export const publicQuestionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('scenario_mc'), ...publicBase, options: z.array(z.string()) }),
  z.strictObject({
    kind: z.literal('calculation'),
    ...publicBase,
    unit: z.string(),
    /** Every unit the answer may be given in, the key's unit first. */
    units: z.array(z.string()),
    tolerance: toleranceSchema,
  }),
  z.strictObject({ kind: z.literal('text'), ...publicBase }),
]);
export type PublicQuestion = z.infer<typeof publicQuestionSchema>;

export function toPublic(question: Question): PublicQuestion {
  const base = {
    id: question.id,
    sectionNumber: question.sectionNumber,
    subsectionNumber: question.subsectionNumber,
    difficulty: question.difficulty,
    prompt: question.prompt,
    answerFormat: question.answerFormat,
  };
  switch (question.kind) {
    case 'scenario_mc':
      return { kind: 'scenario_mc', ...base, hasHint: true, options: [...question.options] };
    case 'calculation':
      return {
        kind: 'calculation',
        ...base,
        hasHint: true,
        unit: question.unit,
        units: [question.unit, ...question.acceptedUnits.map((entry) => entry.unit)],
        tolerance: { ...question.tolerance },
      };
    case 'text':
      return { kind: 'text', ...base, hasHint: true };
  }
}

export const publicExerciseSchema = z.strictObject({
  id: questionIdSchema,
  sectionNumber: lessonIdSchema,
  title: z.string(),
  brief: z.string(),
  steps: z.array(z.string()),
  answerFormat: z.string(),
  answerKind: z.enum(['calculation', 'text']),
  /** Units for a calculation answer, the key's unit first; empty for text. */
  units: z.array(z.string()),
  starterFiles: z.array(z.string()),
  tests: z
    .strictObject({
      runner: z.enum(['pytest', 'vitest']),
      command: z.string(),
      files: z.array(z.string()),
    })
    .optional(),
  estimatedMinutes: z.number().int(),
});
export type PublicExercise = z.infer<typeof publicExerciseSchema>;

/** An exercise without its answer key or solution. */
export function toPublicExercise(exercise: Exercise): PublicExercise {
  const units =
    exercise.answer.kind === 'calculation'
      ? [exercise.answer.unit, ...exercise.answer.acceptedUnits.map((entry) => entry.unit)]
      : [];
  return {
    id: exercise.id,
    sectionNumber: exercise.sectionNumber,
    title: exercise.title,
    brief: exercise.brief,
    steps: [...exercise.steps],
    answerFormat: exercise.answerFormat,
    answerKind: exercise.answer.kind,
    units,
    starterFiles: [...exercise.starterFiles],
    ...(exercise.tests
      ? {
          tests: {
            runner: exercise.tests.runner,
            command: exercise.tests.command,
            files: [...exercise.tests.files],
          },
        }
      : {}),
    estimatedMinutes: exercise.estimatedMinutes,
  };
}

/** Key fields that must never reach the browser. Tests assert none survives toPublic. */
export const ANSWER_KEY_FIELDS = [
  'correctIndex',
  'answer',
  'acceptedAnswers',
  'acceptedCopy',
  'rejectedCopy',
  'workedSolution',
  'explanation',
  'methodHint',
  'hint',
  'sourceQuote',
  'solution',
  'finalAnswer',
] as const;
