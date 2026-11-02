import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  chapterManifestSchema,
  checkpointBankSchema,
  digestSchema,
  exerciseSchema,
  questionSchema,
  relativePathSchema,
  textQuestionSchema,
  wordCount,
} from './content';
import { calcInput, digestInput, exerciseInput, mcInput, textInput } from './content.fixtures';

const messages = (result: z.ZodSafeParseResult<unknown>) =>
  result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);

function bank(counts: { mc: number; calc: number; text: number }) {
  const make = (input: object, prefix: string, n: number): Record<string, unknown>[] =>
    Array.from({ length: n }, (_, i) => ({ ...input, id: `9.1-${prefix}-${i + 1}` }));
  return {
    sectionNumber: '9.1',
    questions: [
      ...make(mcInput, 'mc', counts.mc),
      ...make(calcInput, 'calc', counts.calc),
      ...make(textInput, 'text', counts.text),
    ],
  };
}

describe('wordCount', () => {
  it('counts runs of non-space characters', () => {
    expect(wordCount('  one two\nthree  ')).toBe(3);
    expect(wordCount('')).toBe(0);
  });
});

describe('questionSchema', () => {
  it('parses every kind', () => {
    for (const input of [mcInput, calcInput, textInput]) {
      expect(questionSchema.safeParse(input).success).toBe(true);
    }
  });

  it('fills in normalisation defaults', () => {
    const parsed = textQuestionSchema.parse({ ...textInput, normalisation: undefined });
    expect(parsed.normalisation).toEqual({
      foldCase: true,
      collapseWhitespace: true,
      stripPunctuation: true,
      foldHyphens: false,
    });
  });

  it('needs exactly four distinct options', () => {
    expect(messages(questionSchema.safeParse({ ...mcInput, options: ['a', 'b', 'c'] }))).toEqual([
      'options: Too small: expected array to have exactly 4 items',
    ]);
    expect(
      messages(questionSchema.safeParse({ ...mcInput, options: ['a', 'A', 'b', 'c'] })),
    ).toEqual(['options: options must be distinct']);
  });

  it('refuses a unit listed twice', () => {
    const input = { ...calcInput, acceptedUnits: [{ unit: 'GB', factor: 1 }] };
    expect(messages(questionSchema.safeParse(input))).toEqual([
      'acceptedUnits: unit "GB" is listed twice',
    ]);
  });

  it('caps the source quote at 25 words', () => {
    const input = { ...mcInput, sourceQuote: Array.from({ length: 26 }, () => 'word').join(' ') };
    expect(messages(questionSchema.safeParse(input))).toEqual([
      'sourceQuote: use at most 25 words',
    ]);
  });

  it('refuses ids that are not lowercase slugs', () => {
    expect(questionSchema.safeParse({ ...mcInput, id: '9.1 MC 1' }).success).toBe(false);
  });
});

describe('checkpointBankSchema', () => {
  it('accepts 10 scenario_mc, 7 calculation and 7 text', () => {
    expect(messages(checkpointBankSchema.safeParse(bank({ mc: 10, calc: 7, text: 7 })))).toEqual(
      [],
    );
  });

  it('accepts extra scenario_mc in place of calculation questions', () => {
    expect(messages(checkpointBankSchema.safeParse(bank({ mc: 17, calc: 0, text: 7 })))).toEqual(
      [],
    );
  });

  it('needs at least 24 questions', () => {
    expect(messages(checkpointBankSchema.safeParse(bank({ mc: 10, calc: 6, text: 7 })))).toEqual([
      'questions: needs at least 24 questions, has 23',
      'questions: needs 7 calculation questions, or extra scenario_mc to make up the difference; has 6 calculation and 10 scenario_mc',
    ]);
  });

  it('needs the minimum of each kind', () => {
    expect(messages(checkpointBankSchema.safeParse(bank({ mc: 9, calc: 10, text: 6 })))).toEqual([
      'questions: needs at least 7 text questions, has 6',
      'questions: needs at least 10 scenario_mc questions, has 9',
    ]);
  });

  it('refuses duplicate ids and questions from another section', () => {
    const input = bank({ mc: 10, calc: 7, text: 7 });
    input.questions[1] = { ...input.questions[1]!, id: input.questions[0]!.id };
    input.questions[2] = { ...input.questions[2]!, sectionNumber: '9.2' };
    expect(messages(checkpointBankSchema.safeParse(input))).toEqual([
      'questions.1.id: duplicate id "9.1-mc-1"',
      'questions.2.sectionNumber: is 9.2, but the bank is for 9.1',
    ]);
  });
});

describe('exerciseSchema', () => {
  it('parses an exercise with starter files and tests', () => {
    expect(messages(exerciseSchema.safeParse(exerciseInput))).toEqual([]);
  });

  it('needs the final answer to be of the key’s kind', () => {
    const input = {
      ...exerciseInput,
      solution: { walkthrough: 'x', finalAnswer: { kind: 'text', text: '8' } },
    };
    expect(messages(exerciseSchema.safeParse(input))).toEqual([
      'solution.finalAnswer.kind: is "text", but the answer key is "calculation"',
    ]);
  });
});

describe('relativePathSchema', () => {
  it.each(['budget.py', 'src/budget.py', 'tests/test_budget.py'])('accepts %s', (value) => {
    expect(relativePathSchema.safeParse(value).success).toBe(true);
  });

  it.each(['/etc/passwd', '../secret.py', 'a/../../b', 'C:/x.py', 'a\\b.py', 'a//b.py'])(
    'refuses %s',
    (value) => {
      expect(relativePathSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('digestSchema', () => {
  it('parses a digest with every block', () => {
    expect(messages(digestSchema.safeParse(digestInput))).toEqual([]);
  });

  it('parses a digest with only the required blocks', () => {
    const minimal = {
      ...digestInput,
      callout: undefined,
      workedExample: undefined,
      reflect: undefined,
      figureRefs: undefined,
    };
    expect(messages(digestSchema.safeParse(minimal))).toEqual([]);
  });

  it('enforces the word limits', () => {
    const long = (n: number) => Array.from({ length: n }, () => 'word').join(' ');
    const input = {
      ...digestInput,
      oneLine: long(41),
      summary: long(201),
      mechanism: [...digestInput.mechanism.slice(0, 2), { title: long(5), body: long(21) }],
    };
    expect(messages(digestSchema.safeParse(input))).toEqual([
      'oneLine: use at most 40 words',
      'summary: use at most 200 words',
      'mechanism.2.title: use at most 4 words',
      'mechanism.2.body: use at most 20 words',
    ]);
  });

  it('needs the check question to belong to the lesson', () => {
    const input = {
      ...digestInput,
      checkQuestion: { ...mcInput, id: '9.2-check', sectionNumber: '9.2' },
    };
    expect(messages(digestSchema.safeParse(input))).toEqual([
      'checkQuestion.sectionNumber: is 9.2, but the digest is for 9.1',
    ]);
  });

  it('needs every worked-example row to match the columns', () => {
    const input = {
      ...digestInput,
      workedExample: {
        ...digestInput.workedExample!,
        table: { columns: ['Batch', 'Tokens/s'], rows: [[1, 50, 'extra']] },
      },
    };
    expect(messages(digestSchema.safeParse(input))).toEqual([
      'workedExample.table.rows.0: has 3 cells for 2 columns',
    ]);
  });

  it('accepts the Preface and Chapter 0 as lessons', () => {
    for (const lesson of ['preface', '0']) {
      const input = {
        ...digestInput,
        lesson,
        checkQuestion: {
          ...mcInput,
          sectionNumber: lesson,
          subsectionNumber: null,
          reread: lesson,
        },
        subsectionCards: [],
      };
      expect(messages(digestSchema.safeParse(input))).toEqual([]);
    }
  });
});

describe('chapterManifestSchema', () => {
  it('refuses duplicate lessons and exercises', () => {
    const input = {
      slug: '09-fixture',
      title: 'Fixture',
      lessons: ['9.1', '9.1'],
      exercises: ['a', 'a'],
    };
    expect(messages(chapterManifestSchema.safeParse(input))).toEqual([
      'lessons: "9.1" is listed twice',
      'exercises: "a" is listed twice',
    ]);
  });
});
