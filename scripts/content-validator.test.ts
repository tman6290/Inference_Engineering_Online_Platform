import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { formatReport, validateContent } from './lib/content-validator';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const chapter = 'chapters/09-fixture-serving';

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway copy of the fixture content and book that a test may break. */
function copyFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'content-fixture-'));
  temps.push(root);
  const contentDir = path.join(root, 'content');
  const bookDir = path.join(root, 'book');
  cpSync(path.join(fixtures, 'content'), contentDir, { recursive: true });
  cpSync(path.join(fixtures, 'book'), bookDir, { recursive: true });

  const file = (relative: string) => path.join(contentDir, relative);
  return {
    contentDir,
    bookDir,
    file,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures are edited as plain JSON
    edit(relative: string, change: (json: any) => void) {
      const json = JSON.parse(readFileSync(file(relative), 'utf8'));
      change(json);
      writeFileSync(file(relative), JSON.stringify(json, null, 2));
    },
    validate(withBook = true) {
      return validateContent({
        contentDir,
        bookDir: withBook ? bookDir : path.join(root, 'no-book'),
      });
    },
  };
}

const errorsOf = (report: ReturnType<typeof validateContent>) =>
  report.errors.map((issue) => `${issue.file}: ${issue.message}`);

describe('validateContent on the fixture', () => {
  it('passes with every check, book included', () => {
    const report = validateContent({
      contentDir: path.join(fixtures, 'content'),
      bookDir: path.join(fixtures, 'book'),
    });
    expect(errorsOf(report)).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.notes).toEqual([]);
    expect(report.counts).toEqual({
      chapters: 3,
      digests: 4,
      banks: 2,
      questions: 52,
      exercises: 2,
    });
  });

  it('passes without the book and says which checks it skipped', () => {
    const report = copyFixture().validate(false);
    expect(errorsOf(report)).toEqual([]);
    expect(report.notes).toEqual([
      expect.stringContaining('figure, glossary, source-quote and copy checks were skipped'),
    ]);
  });

  it('reports a content folder without chapters', () => {
    const fixture = copyFixture();
    rmSync(fixture.file('chapters'), { recursive: true });
    const report = fixture.validate();
    expect(errorsOf(report)).toEqual([]);
    expect(report.notes).toContain('No authored chapters yet (chapters/ does not exist).');
  });

  it('formats a readable report', () => {
    const fixture = copyFixture();
    fixture.edit(`${chapter}/checkpoints/9.1.json`, (bank) => bank.questions.pop());
    const text = formatReport(fixture.validate());
    expect(text).toContain(
      `error ${chapter}/checkpoints/9.1.json\n  - questions: needs at least 24 questions, has 23`,
    );
    expect(text).toMatch(/2 error\(s\), 0 warning\(s\)\.$/);
  });
});

describe('validateContent on broken copies', () => {
  it('rejects invalid JSON', () => {
    const fixture = copyFixture();
    writeFileSync(fixture.file(`${chapter}/digests/9.2.json`), '{ "lesson": ');
    expect(errorsOf(fixture.validate())).toEqual([
      expect.stringMatching(new RegExp(`^${chapter}/digests/9.2.json: is not valid JSON`)),
    ]);
  });

  it('rejects a bank with too few questions of a kind', () => {
    const fixture = copyFixture();
    fixture.edit(`${chapter}/checkpoints/9.1.json`, (bank) => {
      bank.questions = bank.questions.filter((q: { id: string }) => q.id !== '9.1-text-07');
    });
    expect(errorsOf(fixture.validate())).toEqual([
      `${chapter}/checkpoints/9.1.json: questions: needs at least 24 questions, has 23`,
      `${chapter}/checkpoints/9.1.json: questions: needs at least 7 text questions, has 6`,
    ]);
  });

  it('rejects a question id used in two files', () => {
    const fixture = copyFixture();
    fixture.edit(`${chapter}/checkpoints/9.2.json`, (bank) => {
      bank.questions[0].id = '9.1-mc-01';
    });
    expect(errorsOf(fixture.validate())).toEqual([
      `${chapter}/checkpoints/9.2.json: questions.0 (9.1-mc-01): id is already used in ${chapter}/checkpoints/9.1.json`,
    ]);
  });

  it('rejects subsections and rereads outside the lesson, and subsections left uncovered', () => {
    const fixture = copyFixture();
    fixture.edit(`${chapter}/checkpoints/9.1.json`, (bank) => {
      for (const question of bank.questions) {
        if (question.subsectionNumber === '9.1.2') question.subsectionNumber = '9.1.1';
      }
      bank.questions[0].subsectionNumber = '9.1.7';
      bank.questions[2].reread = '9.2';
    });
    expect(errorsOf(fixture.validate())).toEqual([
      `${chapter}/checkpoints/9.1.json: questions.0 (9.1-mc-01): subsection 9.1.7 is not in 9.1`,
      `${chapter}/checkpoints/9.1.json: questions.2 (9.1-mc-03): reread 9.2 is not 9.1 or one of its subsections`,
      `${chapter}/checkpoints/9.1.json: no question covers subsection 9.1.2`,
    ]);
  });

  it('needs a subsection for questions in a lesson that has them', () => {
    const fixture = copyFixture();
    fixture.edit(`${chapter}/checkpoints/9.1.json`, (bank) => {
      bank.questions[1].subsectionNumber = null;
    });
    expect(errorsOf(fixture.validate())).toEqual([
      `${chapter}/checkpoints/9.1.json: questions.1 (9.1-mc-02): subsectionNumber is null, but 9.1 has subsections; name the one it tests`,
    ]);
  });

  it('checks a masked answer format against the canonical answer', () => {
    const fixture = copyFixture();
    fixture.edit(`${chapter}/checkpoints/9.1.json`, (bank) => {
      const question = bank.questions.find((q: { id: string }) => q.id === '9.1-text-01');
      question.answerFormat = '*****';
    });
    expect(errorsOf(fixture.validate())).toEqual([
      `${chapter}/checkpoints/9.1.json: questions.17 (9.1-text-01): answerFormat "*****" doesn't match the first accepted answer's shape "********"`,
    ]);
  });

  it('warns when a calculation format does not name its unit', () => {
    const fixture = copyFixture();
    fixture.edit(`${chapter}/checkpoints/9.1.json`, (bank) => {
      bank.questions[10].answerFormat = 'a number';
    });
    const report = fixture.validate();
    expect(errorsOf(report)).toEqual([]);
    expect(report.warnings.map((issue) => issue.message)).toEqual([
      'questions.10 (9.1-calc-01): answerFormat "a number" doesn\'t mention the unit ms',
    ]);
  });

  it('rejects a source quote that is not in the book', () => {
    const fixture = copyFixture();
    fixture.edit(`${chapter}/checkpoints/9.2.json`, (bank) => {
      bank.questions[3].sourceQuote = 'A sentence the book never says.';
    });
    expect(errorsOf(fixture.validate())).toEqual([
      `${chapter}/checkpoints/9.2.json: questions.3 (9.2-mc-04): sourceQuote is not in the book text of 9.2`,
    ]);
  });

  it('rejects prose copied from the book', () => {
    const fixture = copyFixture();
    fixture.edit(`${chapter}/digests/9.1.json`, (digest) => {
      digest.summary =
        'As the book puts it, a decode step reads every weight once, whatever the batch size.';
    });
    expect(errorsOf(fixture.validate())).toEqual([
      `${chapter}/digests/9.1.json: copies 10+ words from the book: "a decode step reads every weight once whatever the batch"`,
    ]);
  });

  it('rejects unknown figures, figures from another chapter, and terms outside the glossary', () => {
    const fixture = copyFixture();
    fixture.edit(`${chapter}/digests/9.1.json`, (digest) => {
      digest.figureRefs = [
        { figure: '9.3', lookFor: 'Not in this section.' },
        { figure: '5.1', lookFor: 'Another chapter.' },
      ];
      digest.terms[0] = 'Speculation';
    });
    expect(errorsOf(fixture.validate())).toEqual([
      `${chapter}/digests/9.1.json: figure 9.3 does not appear in 9.1`,
      `${chapter}/digests/9.1.json: figure 5.1 is not a figure of 9.1's chapter`,
      `${chapter}/digests/9.1.json: term "Speculation" is not in the glossary`,
    ]);
  });

  it('needs subsection cards to match the outline', () => {
    const fixture = copyFixture();
    fixture.edit(`${chapter}/digests/9.1.json`, (digest) => {
      digest.subsectionCards.reverse();
    });
    expect(errorsOf(fixture.validate())).toEqual([
      `${chapter}/digests/9.1.json: subsectionCards must list 9.1's subsections in order with the outline's titles: ` +
        'expected [9.1.1 Why Batch; 9.1.2 Batch Limits], found [9.1.2 Batch Limits; 9.1.1 Why Batch]',
    ]);
  });

  it('needs a digest and a bank for every listed section, and nothing unlisted', () => {
    const fixture = copyFixture();
    rmSync(fixture.file(`${chapter}/checkpoints/9.2.json`));
    fixture.edit(`${chapter}/chapter.json`, (manifest) => {
      manifest.lessons = ['9.1'];
      manifest.exercises = ['9.1-batch-cost'];
    });
    expect(errorsOf(fixture.validate())).toEqual([
      `${chapter}/digests/9.2.json: digest is not listed in chapter.json's lessons`,
      `${chapter}/exercises/9.2-name-the-fix: exercise is not listed in chapter.json`,
    ]);

    fixture.edit(`${chapter}/chapter.json`, (manifest) => {
      manifest.lessons = ['9.1', '9.2'];
      manifest.exercises = ['9.1-batch-cost', '9.2-name-the-fix'];
    });
    expect(errorsOf(fixture.validate())).toEqual([
      `${chapter}/checkpoints/9.2.json: is missing; chapter.json lists 9.2`,
    ]);
  });

  it('rejects lessons in the wrong chapter and folders that are not chapters', () => {
    const fixture = copyFixture();
    fixture.edit('chapters/00-basics/chapter.json', (manifest) => {
      manifest.lessons = ['0', '9.1'];
    });
    mkdirSync(fixture.file('chapters/10-extra'));
    expect(errorsOf(fixture.validate())).toEqual([
      'chapters/00-basics/chapter.json: lesson 9.1 belongs in 09-fixture-serving, not 00-basics',
      'chapters/10-extra: is not a chapter in the outline; use one of: preface, 00-basics, 09-fixture-serving',
    ]);
  });

  it('rejects a checkpoint bank for an unnumbered lesson', () => {
    const fixture = copyFixture();
    mkdirSync(fixture.file('chapters/00-basics/checkpoints'), { recursive: true });
    cpSync(
      fixture.file(`${chapter}/checkpoints/9.2.json`),
      fixture.file('chapters/00-basics/checkpoints/0.json'),
    );
    expect(errorsOf(fixture.validate())).toEqual([
      'chapters/00-basics/checkpoints/0.json: 0 is not a numbered section, so it has no checkpoint',
    ]);
  });

  it('rejects an exercise whose solution fails its own key', () => {
    const fixture = copyFixture();
    fixture.edit(`${chapter}/exercises/9.1-batch-cost/exercise.json`, (exercise) => {
      exercise.solution.finalAnswer.value = 0.02;
    });
    expect(errorsOf(fixture.validate())).toEqual([
      `${chapter}/exercises/9.1-batch-cost/exercise.json: the solution's final answer fails its own answer key ` +
        '(Not within tolerance. Check the method and the units.)',
    ]);
  });

  it('rejects missing exercise files, escaping paths and an id that differs from its folder', () => {
    const fixture = copyFixture();
    rmSync(fixture.file(`${chapter}/exercises/9.1-batch-cost/test_batch_cost.py`));
    fixture.edit(`${chapter}/exercises/9.2-name-the-fix/exercise.json`, (exercise) => {
      exercise.id = '9.2-other';
      exercise.starterFiles = ['../../chapter.json'];
    });
    expect(errorsOf(fixture.validate())).toEqual([
      `${chapter}/exercises/9.1-batch-cost/exercise.json: file test_batch_cost.py does not exist in the exercise folder`,
      `${chapter}/exercises/9.2-name-the-fix/exercise.json: starterFiles.0: must stay inside the exercise folder`,
    ]);

    fixture.edit(`${chapter}/exercises/9.2-name-the-fix/exercise.json`, (exercise) => {
      exercise.starterFiles = [];
    });
    expect(errorsOf(fixture.validate())).toContain(
      `${chapter}/exercises/9.2-name-the-fix/exercise.json: id "9.2-other" must match its folder name "9.2-name-the-fix"`,
    );
  });

  it('rejects a bank whose answers bunch in one position', () => {
    const fixture = copyFixture();
    fixture.edit(`${chapter}/checkpoints/9.2.json`, (bank) => {
      for (const question of bank.questions) {
        if (question.kind !== 'scenario_mc') continue;
        const [correct] = question.options.splice(question.correctIndex, 1);
        question.options.unshift(correct);
        question.correctIndex = 0;
      }
    });
    expect(errorsOf(fixture.validate())).toEqual([
      expect.stringMatching(/9\.2\.json: 17 of 17 correct answers are option A/),
    ]);
  });

  it('rejects a bank where the longest option is usually right', () => {
    const fixture = copyFixture();
    fixture.edit(`${chapter}/checkpoints/9.1.json`, (bank) => {
      for (const question of bank.questions) {
        if (question.kind !== 'scenario_mc') continue;
        question.options[question.correctIndex] += ', which is the full and careful answer';
      }
    });
    expect(errorsOf(fixture.validate())).toEqual([
      expect.stringMatching(/9\.1\.json: the correct option is the longest in 10 of 10/),
    ]);
  });

  it('reports a missing outline', () => {
    const fixture = copyFixture();
    rmSync(fixture.file('outline.json'));
    expect(errorsOf(fixture.validate())).toEqual([
      'outline.json: is missing; run `pnpm content:ingest` to write it',
    ]);
  });
});
