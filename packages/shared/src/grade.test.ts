import { describe, expect, it } from 'vitest';
import {
  calculationQuestionSchema,
  exerciseSchema,
  questionSchema,
  scenarioMcQuestionSchema,
  textQuestionSchema,
} from './content';
import { calcInput, exerciseInput, mcInput, textInput } from './content.fixtures';
import {
  ANSWER_KEY_FIELDS,
  grade,
  gradeCalculation,
  gradeExercise,
  gradeText,
  normaliseText,
  publicExerciseSchema,
  publicQuestionSchema,
  toPublic,
  toPublicExercise,
} from './grade';

const mc = scenarioMcQuestionSchema.parse(mcInput);
const calc = calculationQuestionSchema.parse(calcInput);
const text = textQuestionSchema.parse(textInput);

describe('scenario_mc', () => {
  it('accepts the correct option with the accepted copy', () => {
    expect(grade(mc, { kind: 'scenario_mc', choice: 0 })).toEqual({
      accepted: true,
      normalised: 0,
      feedback: mc.acceptedCopy,
    });
  });

  it('rejects a wrong option with the nudge, not the answer', () => {
    const result = grade(mc, { kind: 'scenario_mc', choice: 2 });
    expect(result).toMatchObject({ accepted: false, normalised: 2, feedback: mc.rejectedCopy });
  });

  it.each([-1, 4, 1.5, Number.NaN])('rejects an out-of-range choice (%s)', (choice) => {
    expect(grade(mc, { kind: 'scenario_mc', choice })).toMatchObject({
      accepted: false,
      feedback: 'Pick one of the options.',
    });
  });
});

describe('calculation', () => {
  it('accepts the exact answer in the key unit', () => {
    expect(grade(calc, { kind: 'calculation', value: 14, unit: 'GB' })).toMatchObject({
      accepted: true,
      normalised: 14,
      feedback: 'Accepted: 14 GB.',
    });
  });

  it('assumes the key unit when none is given', () => {
    expect(grade(calc, { kind: 'calculation', value: 14 }).accepted).toBe(true);
  });

  it('converts units before applying the tolerance', () => {
    expect(grade(calc, { kind: 'calculation', value: 14000, unit: 'MB' })).toMatchObject({
      accepted: true,
      normalised: 14,
    });
    // 112 gigabits is 14 gigabytes.
    expect(grade(calc, { kind: 'calculation', value: 112, unit: 'Gb' }).accepted).toBe(true);
  });

  it('keeps case-distinct units apart', () => {
    // 14 Gb is 1.75 GB: wrong, even though only the case differs.
    expect(grade(calc, { kind: 'calculation', value: 14, unit: 'Gb' }).accepted).toBe(false);
  });

  it('matches a unit case-insensitively when that is unambiguous', () => {
    expect(grade(calc, { kind: 'calculation', value: 14000, unit: 'mb' }).accepted).toBe(true);
    // "gb" could mean GB or Gb, so it is refused rather than guessed.
    expect(grade(calc, { kind: 'calculation', value: 14, unit: 'gb' })).toMatchObject({
      accepted: false,
      feedback: '"gb" isn\'t a unit this answer takes. Use one of: GB, MB, Gb.',
    });
  });

  it('rejects an unknown unit and lists the accepted ones', () => {
    expect(grade(calc, { kind: 'calculation', value: 14, unit: 'TB' })).toMatchObject({
      accepted: false,
      normalised: null,
      feedback: '"TB" isn\'t a unit this answer takes. Use one of: GB, MB, Gb.',
    });
  });

  it('includes both edges of a relative tolerance', () => {
    // 5% of 14 is 0.7.
    expect(gradeCalculation(calc, 14.7).accepted).toBe(true);
    expect(gradeCalculation(calc, 13.3).accepted).toBe(true);
    expect(gradeCalculation(calc, 14.71).accepted).toBe(false);
    expect(gradeCalculation(calc, 13.29).accepted).toBe(false);
  });

  it('includes both edges of an absolute tolerance, despite floating-point error', () => {
    const key = {
      answer: 0.3,
      tolerance: { kind: 'absolute' as const, value: 0.1 },
      unit: 's',
      acceptedUnits: [],
    };
    expect(gradeCalculation(key, 0.1 + 0.1).accepted).toBe(true);
    expect(gradeCalculation(key, 0.4).accepted).toBe(true);
    expect(gradeCalculation(key, 0.41).accepted).toBe(false);
  });

  it('treats a zero tolerance as exact', () => {
    const key = {
      answer: 42,
      tolerance: { kind: 'absolute' as const, value: 0 },
      unit: 'tokens',
      acceptedUnits: [],
    };
    expect(gradeCalculation(key, 42).accepted).toBe(true);
    expect(gradeCalculation(key, 42.001).accepted).toBe(false);
  });

  it('handles negative keys with a relative tolerance', () => {
    const key = {
      answer: -20,
      tolerance: { kind: 'relative' as const, value: 0.1 },
      unit: '%',
      acceptedUnits: [],
    };
    expect(gradeCalculation(key, -22).accepted).toBe(true);
    expect(gradeCalculation(key, -22.5).accepted).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('rejects a non-number (%s)', (value) => {
    expect(gradeCalculation(calc, value)).toMatchObject({
      accepted: false,
      feedback: 'Enter a number.',
    });
  });

  it('says the value is out of tolerance without revealing the key', () => {
    const result = grade(calc, { kind: 'calculation', value: 20, unit: 'GB' });
    expect(result).toEqual({
      accepted: false,
      normalised: 20,
      feedback: 'Not within tolerance. Check the method and the units.',
    });
  });
});

describe('text', () => {
  it('accepts any accepted answer after normalisation', () => {
    expect(grade(text, { kind: 'text', text: '  ttft ' })).toMatchObject({
      accepted: true,
      normalised: 'ttft',
    });
    expect(grade(text, { kind: 'text', text: 'Time-To-First-Token.' })).toMatchObject({
      accepted: true,
      normalised: 'time to first token',
    });
  });

  it('rejects other answers', () => {
    expect(grade(text, { kind: 'text', text: 'TPOT' })).toMatchObject({
      accepted: false,
      normalised: 'tpot',
    });
  });

  it.each(['', '   ', '?!'])(
    'asks for an answer when it is empty after normalisation (%j)',
    (input) => {
      expect(grade(text, { kind: 'text', text: input })).toMatchObject({
        accepted: false,
        feedback: 'Enter an answer.',
      });
    },
  );

  it('only folds hyphens when the key asks for it', () => {
    const key = {
      acceptedAnswers: ['KV cache'],
      normalisation: {
        foldCase: true,
        collapseWhitespace: true,
        stripPunctuation: true,
        foldHyphens: false,
      },
    };
    expect(gradeText(key, 'kv cache').accepted).toBe(true);
    expect(gradeText(key, 'KV-cache').accepted).toBe(false);
    expect(
      gradeText({ ...key, normalisation: { ...key.normalisation, foldHyphens: true } }, 'KV-cache')
        .accepted,
    ).toBe(true);
  });

  it('respects case when case folding is off', () => {
    const key = {
      acceptedAnswers: ['FP8'],
      normalisation: {
        foldCase: false,
        collapseWhitespace: true,
        stripPunctuation: true,
        foldHyphens: false,
      },
    };
    expect(gradeText(key, 'FP8').accepted).toBe(true);
    expect(gradeText(key, 'fp8').accepted).toBe(false);
  });
});

describe('normaliseText', () => {
  it.each([
    ['  Prefix   Caching ', {}, 'prefix caching'],
    ['“Amdahl’s law”', {}, 'amdahl s law'],
    ['3.5 GB', {}, '3.5 gb'],
    ['1,024 tokens', {}, '1024 tokens'],
    ['a, b, c', {}, 'a b c'],
    ['TTFT — P50', {}, 'ttft - p50'],
    ['TTFT — P50', { foldHyphens: true }, 'ttft p50'],
    ['Ａｃｃｅｌ', {}, 'accel'],
    ['Keep, Case.', { foldCase: false }, 'Keep Case'],
    ['Keep, Punctuation.', { stripPunctuation: false }, 'keep, punctuation.'],
  ])('normalises %j with %j to %j', (input, options, expected) => {
    expect(normaliseText(input, options)).toBe(expected);
  });
});

describe('grade', () => {
  it('rejects an answer of the wrong kind', () => {
    expect(grade(mc, { kind: 'text', text: 'Larger batches' })).toMatchObject({
      accepted: false,
      feedback: "This answer doesn't match the question type.",
    });
  });
});

describe('gradeExercise', () => {
  const exercise = exerciseSchema.parse(exerciseInput);

  it('accepts the solution’s own final answer', () => {
    expect(gradeExercise(exercise, exercise.solution.finalAnswer).accepted).toBe(true);
  });

  it('grades a learner answer against the key', () => {
    expect(gradeExercise(exercise, { kind: 'calculation', value: 9 }).accepted).toBe(false);
    expect(gradeExercise(exercise, { kind: 'text', text: '8' }).accepted).toBe(false);
  });
});

/** Every key at any depth of a value. */
function allKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => allKeys(item, keys));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      allKeys(child, keys);
    }
  }
  return keys;
}

describe('toPublic', () => {
  it.each([
    ['scenario_mc', mc],
    ['calculation', calc],
    ['text', text],
  ])('strips every answer-key field from a %s question', (_kind, question) => {
    const shown = toPublic(questionSchema.parse(question));
    const leaked = ANSWER_KEY_FIELDS.filter((field) => allKeys(shown).has(field));
    expect(leaked).toEqual([]);
    expect(publicQuestionSchema.parse(shown)).toEqual(shown);
  });

  it('keeps what the learner needs to answer', () => {
    expect(toPublic(mc)).toMatchObject({
      options: mc.options,
      answerFormat: 'one option',
      hasHint: true,
    });
    expect(toPublic(calc)).toMatchObject({
      unit: 'GB',
      units: ['GB', 'MB', 'Gb'],
      tolerance: calc.tolerance,
    });
  });

  it('copies rather than shares arrays, so the key can not be edited through the result', () => {
    const shown = toPublic(mc);
    if (shown.kind !== 'scenario_mc') throw new Error('expected scenario_mc');
    expect(shown.options).not.toBe(mc.options);
  });

  it('strips the answer key and solution from an exercise', () => {
    const shown = toPublicExercise(exerciseSchema.parse(exerciseInput));
    const leaked = ANSWER_KEY_FIELDS.filter((field) => allKeys(shown).has(field));
    expect(leaked).toEqual([]);
    expect(publicExerciseSchema.parse(shown)).toEqual(shown);
    expect(shown).toMatchObject({ answerKind: 'calculation', units: ['GB', 'MB'] });
  });

  it('rejects an unexpected field in the public schema', () => {
    expect(publicQuestionSchema.safeParse({ ...toPublic(mc), correctIndex: 0 }).success).toBe(
      false,
    );
  });
});
