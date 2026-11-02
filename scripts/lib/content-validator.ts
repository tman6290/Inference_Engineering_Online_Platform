import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { figuresIn, parseGlossary, slugify, stripPageHeader } from '@forward-pass/api/book/parse';
import {
  type ChapterManifest,
  type CheckpointBank,
  type Digest,
  type Exercise,
  type LessonId,
  type Outline,
  type Question,
  chapterManifestSchema,
  checkpointBankSchema,
  digestSchema,
  exerciseSchema,
  gradeExercise,
  normaliseText,
  outlineSchema,
} from '@forward-pass/shared';
import type { z } from 'zod';

// Checks authored content under <content>/chapters/ against the shared schemas and the outline.
// With the ingested book on disk (an authoring machine) it also checks figures, glossary terms,
// source quotes and verbatim copying. Without it (CI, a fresh clone) those checks are skipped.

export interface Issue {
  /** Path relative to the content directory. */
  file: string;
  message: string;
}

export interface ValidationReport {
  errors: Issue[];
  warnings: Issue[];
  /** Plain statements about what was and wasn't checked. */
  notes: string[];
  counts: {
    chapters: number;
    digests: number;
    banks: number;
    questions: number;
    exercises: number;
  };
}

export interface ValidateOptions {
  /** The folder holding outline.json and chapters/. */
  contentDir: string;
  /** The ingested book. Book checks are skipped when it is missing. */
  bookDir?: string;
}

/** A run of this many words found in the book counts as copied. */
export const COPY_RUN_WORDS = 10;

interface LessonInfo {
  id: LessonId;
  /** Folder under chapters/: the chapter slug, or "preface". */
  folder: string;
  /** Figure number prefix: the chapter number, or "P" for the Preface. */
  figurePrefix: string;
  subsections: { number: string; title: string }[];
  /** Path of the lesson's page inside the book folder. */
  bookFile: string;
  numbered: boolean;
}

interface BookLesson {
  text: string;
  tokens: string;
  figures: Set<string>;
}

function lessonsFromOutline(outline: Outline): Map<string, LessonInfo> {
  const lessons = new Map<string, LessonInfo>();
  if (outline.frontMatter.some((page) => page.slug === 'preface')) {
    lessons.set('preface', {
      id: 'preface',
      folder: 'preface',
      figurePrefix: 'P',
      subsections: [],
      bookFile: 'preface.md',
      numbered: false,
    });
  }
  for (const chapter of outline.chapters) {
    if (chapter.number === 0) {
      lessons.set('0', {
        id: '0',
        folder: chapter.slug,
        figurePrefix: '0',
        subsections: [],
        bookFile: `${chapter.slug}.md`,
        numbered: false,
      });
    }
    for (const section of chapter.sections) {
      lessons.set(section.number, {
        id: section.number,
        folder: chapter.slug,
        figurePrefix: String(chapter.number),
        subsections: section.subsections,
        bookFile: `${chapter.slug}/${section.number}-${section.slug}.md`,
        numbered: true,
      });
    }
  }
  return lessons;
}

/** Lowercase words of running text, with Markdown syntax, quotes and dashes smoothed out. */
function plainWords(markdown: string): string[] {
  const plain = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>|]/g, ' ');
  return normaliseText(plain, { foldHyphens: true }).split(' ').filter(Boolean);
}

const wordsKey = (words: string[]) => ` ${words.join(' ')} `;

/** The first run of COPY_RUN_WORDS words in `text` that also appears in the book, if any. */
function copiedRun(text: string, book: BookLesson): string | null {
  const words = plainWords(text);
  for (let start = 0; start + COPY_RUN_WORDS <= words.length; start++) {
    const run = words.slice(start, start + COPY_RUN_WORDS);
    if (book.tokens.includes(wordsKey(run))) return run.join(' ');
  }
  return null;
}

/** Mask of an answer's shape: letters and digits become "*", separators stay. */
function maskOf(answer: string): string {
  return answer.replace(/[\p{L}\p{N}]/gu, '*');
}

const MASK = /^\*+(?:[ \-./]\*+)*$/;

function readJson(file: string): { value?: unknown; error?: string } {
  try {
    return { value: JSON.parse(readFileSync(file, 'utf8')) };
  } catch (error) {
    return { error: `is not valid JSON: ${(error as Error).message}` };
  }
}

function listDir(dir: string, kind: 'file' | 'dir'): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => (kind === 'dir' ? entry.isDirectory() : entry.isFile()))
    .map((entry) => entry.name)
    .sort();
}

/** Prose a learner reads, for the copy check. Source quotes are allowed and left out. */
function questionProse(question: Question): string[] {
  const prose = [question.prompt, question.explanation];
  if (question.kind === 'scenario_mc') {
    prose.push(...question.options, question.acceptedCopy, question.rejectedCopy, question.hint);
  } else if (question.kind === 'calculation') {
    prose.push(question.methodHint, question.workedSolution);
  } else {
    prose.push(question.hint);
  }
  return prose;
}

function digestProse(digest: Digest): string[] {
  return [
    digest.oneLine,
    digest.summary,
    ...digest.mechanism.flatMap((step) => [step.title, step.body]),
    ...(digest.callout ? [digest.callout.body] : []),
    ...digest.figureRefs.map((ref) => ref.lookFor),
    ...digest.keyCards.flatMap((card) => [card.title, card.body]),
    ...(digest.workedExample
      ? [digest.workedExample.setup, digest.workedExample.conclusion.text]
      : []),
    ...(digest.reflect
      ? [digest.reflect.prompt, digest.reflect.modelAnswer, ...digest.reflect.points]
      : []),
    ...digest.subsectionCards.map((card) => card.hook),
  ];
}

export function validateContent(options: ValidateOptions): ValidationReport {
  const { contentDir } = options;
  const report: ValidationReport = {
    errors: [],
    warnings: [],
    notes: [],
    counts: { chapters: 0, digests: 0, banks: 0, questions: 0, exercises: 0 },
  };
  const rel = (file: string) => path.relative(contentDir, file).split(path.sep).join('/');
  const error = (file: string, message: string) => report.errors.push({ file: rel(file), message });
  const warn = (file: string, message: string) =>
    report.warnings.push({ file: rel(file), message });

  /** Parses a JSON file with a schema, reporting every issue against the file. */
  function load<T>(file: string, schema: z.ZodType<T>): T | null {
    const raw = readJson(file);
    if (raw.error) {
      error(file, raw.error);
      return null;
    }
    const result = schema.safeParse(raw.value);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
        error(file, `${where}${issue.message}`);
      }
      return null;
    }
    return result.data;
  }

  // Outline -----------------------------------------------------------------------------------
  const outlineFile = path.join(contentDir, 'outline.json');
  if (!existsSync(outlineFile)) {
    error(outlineFile, 'is missing; run `pnpm content:ingest` to write it');
    return report;
  }
  const outline = load(outlineFile, outlineSchema);
  if (!outline) return report;
  const lessons = lessonsFromOutline(outline);
  const folders = new Set([...lessons.values()].map((lesson) => lesson.folder));

  // Book --------------------------------------------------------------------------------------
  const bookDir = options.bookDir;
  const hasBook = Boolean(bookDir && existsSync(bookDir) && statSync(bookDir).isDirectory());
  const bookCache = new Map<string, BookLesson | null>();
  let glossary: Set<string> | null = null;

  if (hasBook) {
    const glossaryFile = path.join(bookDir!, 'appendix-a-inference-glossary.md');
    if (existsSync(glossaryFile)) {
      glossary = new Set(
        parseGlossary(readFileSync(glossaryFile, 'utf8')).map((term) => term.slug),
      );
    } else {
      report.notes.push('The book has no glossary page; skipped the glossary-term check.');
    }
  } else {
    report.notes.push(
      'The ingested book was not found, so figure, glossary, source-quote and copy checks were skipped. ' +
        'Run `pnpm content:ingest` to enable them.',
    );
  }

  function bookLesson(lesson: LessonInfo, forFile: string): BookLesson | null {
    if (!hasBook) return null;
    if (!bookCache.has(lesson.id)) {
      const file = path.join(bookDir!, lesson.bookFile);
      if (!existsSync(file)) {
        warn(
          forFile,
          `book page ${lesson.bookFile} not found; skipped the book checks for ${lesson.id}`,
        );
        bookCache.set(lesson.id, null);
      } else {
        const { body } = stripPageHeader(readFileSync(file, 'utf8'));
        bookCache.set(lesson.id, {
          text: body,
          tokens: wordsKey(plainWords(body)),
          figures: new Set(figuresIn(body).map((figure) => figure.number)),
        });
      }
    }
    return bookCache.get(lesson.id) ?? null;
  }

  // Content -----------------------------------------------------------------------------------
  const chaptersDir = path.join(contentDir, 'chapters');
  if (!existsSync(chaptersDir)) {
    report.notes.push('No authored chapters yet (chapters/ does not exist).');
    return report;
  }

  const questionOwners = new Map<string, string>();
  const exerciseOwners = new Map<string, string>();

  function checkQuestion(
    question: Question,
    lesson: LessonInfo,
    file: string,
    where: string,
  ): void {
    const at = `${where} (${question.id})`;
    report.counts.questions++;

    const owner = questionOwners.get(question.id);
    if (owner) error(file, `${at}: id is already used in ${owner}`);
    else questionOwners.set(question.id, rel(file));

    const subsections = new Set(lesson.subsections.map((sub) => sub.number));
    if (question.subsectionNumber === null) {
      if (subsections.size > 0) {
        error(
          file,
          `${at}: subsectionNumber is null, but ${lesson.id} has subsections; name the one it tests`,
        );
      }
    } else if (!subsections.has(question.subsectionNumber)) {
      error(file, `${at}: subsection ${question.subsectionNumber} is not in ${lesson.id}`);
    }
    if (question.reread !== lesson.id && !subsections.has(question.reread)) {
      error(file, `${at}: reread ${question.reread} is not ${lesson.id} or one of its subsections`);
    }

    if (question.kind === 'text') {
      const normalised = question.acceptedAnswers.map((answer) =>
        normaliseText(answer, question.normalisation),
      );
      if (normalised.some((answer) => !answer)) {
        error(file, `${at}: an accepted answer is empty after normalisation`);
      }
      const duplicates = normalised.filter(
        (answer, index) => answer && normalised.indexOf(answer) !== index,
      );
      if (duplicates.length) {
        warn(
          file,
          `${at}: accepted answers repeat after normalisation: ${[...new Set(duplicates)].join(', ')}`,
        );
      }
      if (MASK.test(question.answerFormat)) {
        const mask = maskOf(question.acceptedAnswers[0]!);
        if (mask !== question.answerFormat) {
          error(
            file,
            `${at}: answerFormat "${question.answerFormat}" doesn't match the first accepted answer's shape "${mask}"`,
          );
        }
      }
    }
    if (question.kind === 'calculation' && !question.answerFormat.includes(question.unit)) {
      warn(
        file,
        `${at}: answerFormat "${question.answerFormat}" doesn't mention the unit ${question.unit}`,
      );
    }

    const book = bookLesson(lesson, file);
    if (book) {
      if (!book.tokens.includes(wordsKey(plainWords(question.sourceQuote)))) {
        error(file, `${at}: sourceQuote is not in the book text of ${lesson.id}`);
      }
      for (const prose of questionProse(question)) {
        const run = copiedRun(prose, book);
        if (run) error(file, `${at}: copies ${COPY_RUN_WORDS}+ words from the book: "${run}"`);
      }
    }
  }

  function checkDigest(digest: Digest, lesson: LessonInfo, file: string): void {
    report.counts.digests++;
    const expected = lesson.subsections.map((sub) => `${sub.number} ${sub.title}`);
    const actual = digest.subsectionCards.map((card) => `${card.number} ${card.title}`);
    if (expected.join('\n') !== actual.join('\n')) {
      error(
        file,
        `subsectionCards must list ${lesson.id}'s subsections in order with the outline's titles: ` +
          `expected [${expected.join('; ')}], found [${actual.join('; ')}]`,
      );
    }

    checkQuestion(digest.checkQuestion, lesson, file, 'checkQuestion');

    const book = bookLesson(lesson, file);
    for (const ref of digest.figureRefs) {
      if (!ref.figure.startsWith(`${lesson.figurePrefix}.`)) {
        error(file, `figure ${ref.figure} is not a figure of ${lesson.id}'s chapter`);
      } else if (book && !book.figures.has(ref.figure)) {
        error(file, `figure ${ref.figure} does not appear in ${lesson.id}`);
      }
    }
    if (glossary) {
      for (const term of digest.terms) {
        if (!glossary.has(slugify(term))) error(file, `term "${term}" is not in the glossary`);
      }
    }
    if (book) {
      for (const prose of digestProse(digest)) {
        const run = copiedRun(prose, book);
        if (run) error(file, `copies ${COPY_RUN_WORDS}+ words from the book: "${run}"`);
      }
    }
  }

  function checkBank(bank: CheckpointBank, lesson: LessonInfo, file: string): void {
    report.counts.banks++;
    bank.questions.forEach((question, index) =>
      checkQuestion(question, lesson, file, `questions.${index}`),
    );
    const covered = new Set(bank.questions.map((question) => question.subsectionNumber));
    for (const sub of lesson.subsections) {
      if (!covered.has(sub.number)) error(file, `no question covers subsection ${sub.number}`);
    }
  }

  function checkExercise(
    exercise: Exercise,
    dir: string,
    manifest: ChapterManifest,
    file: string,
  ): void {
    report.counts.exercises++;
    const id = path.basename(dir);
    if (exercise.id !== id) error(file, `id "${exercise.id}" must match its folder name "${id}"`);
    const owner = exerciseOwners.get(exercise.id);
    if (owner) error(file, `id "${exercise.id}" is already used in ${owner}`);
    else exerciseOwners.set(exercise.id, rel(file));

    if (!manifest.lessons.includes(exercise.sectionNumber)) {
      error(file, `sectionNumber ${exercise.sectionNumber} is not one of chapter.json's lessons`);
    }
    for (const listed of [...exercise.starterFiles, ...(exercise.tests?.files ?? [])]) {
      if (!existsSync(path.join(dir, listed)))
        error(file, `file ${listed} does not exist in the exercise folder`);
    }
    const result = gradeExercise(exercise, exercise.solution.finalAnswer);
    if (!result.accepted) {
      error(file, `the solution's final answer fails its own answer key (${result.feedback})`);
    }
  }

  for (const folder of listDir(chaptersDir, 'dir')) {
    const dir = path.join(chaptersDir, folder);
    if (!folders.has(folder)) {
      error(dir, `is not a chapter in the outline; use one of: ${[...folders].join(', ')}`);
      continue;
    }
    report.counts.chapters++;

    const manifestFile = path.join(dir, 'chapter.json');
    if (!existsSync(manifestFile)) {
      error(manifestFile, 'is missing');
      continue;
    }
    const manifest = load(manifestFile, chapterManifestSchema);
    if (!manifest) continue;
    if (manifest.slug !== folder)
      error(manifestFile, `slug "${manifest.slug}" must match the folder "${folder}"`);

    const listedLessons: LessonInfo[] = [];
    for (const id of manifest.lessons) {
      const lesson = lessons.get(id);
      if (!lesson) error(manifestFile, `lesson ${id} is not in the outline`);
      else if (lesson.folder !== folder)
        error(manifestFile, `lesson ${id} belongs in ${lesson.folder}, not ${folder}`);
      else listedLessons.push(lesson);
    }

    // Digests and banks: one per listed lesson, nothing unlisted.
    const digestDir = path.join(dir, 'digests');
    const bankDir = path.join(dir, 'checkpoints');
    for (const lesson of listedLessons) {
      const digestFile = path.join(digestDir, `${lesson.id}.json`);
      if (!existsSync(digestFile)) error(digestFile, `is missing; chapter.json lists ${lesson.id}`);
      else {
        const digest = load(digestFile, digestSchema);
        if (digest && digest.lesson !== lesson.id)
          error(digestFile, `lesson is ${digest.lesson}, but the file is for ${lesson.id}`);
        else if (digest) checkDigest(digest, lesson, digestFile);
      }

      const bankFile = path.join(bankDir, `${lesson.id}.json`);
      if (!lesson.numbered) {
        if (existsSync(bankFile))
          error(bankFile, `${lesson.id} is not a numbered section, so it has no checkpoint`);
        continue;
      }
      if (!existsSync(bankFile)) error(bankFile, `is missing; chapter.json lists ${lesson.id}`);
      else {
        const bank = load(bankFile, checkpointBankSchema);
        if (bank && bank.sectionNumber !== lesson.id)
          error(
            bankFile,
            `sectionNumber is ${bank.sectionNumber}, but the file is for ${lesson.id}`,
          );
        else if (bank) checkBank(bank, lesson, bankFile);
      }
    }
    const listedIds = new Set(listedLessons.map((lesson) => `${lesson.id}.json`));
    for (const [sub, label] of [
      [digestDir, 'digest'],
      [bankDir, 'checkpoint bank'],
    ] as const) {
      for (const name of listDir(sub, 'file')) {
        if (!listedIds.has(name))
          error(path.join(sub, name), `${label} is not listed in chapter.json's lessons`);
      }
    }

    // Exercises: a folder per listed id, each with exercise.json.
    const exerciseDir = path.join(dir, 'exercises');
    const exerciseFolders = listDir(exerciseDir, 'dir');
    for (const id of manifest.exercises) {
      const file = path.join(exerciseDir, id, 'exercise.json');
      if (!existsSync(file)) {
        error(file, `is missing; chapter.json lists exercise ${id}`);
        continue;
      }
      const exercise = load(file, exerciseSchema);
      if (exercise) checkExercise(exercise, path.join(exerciseDir, id), manifest, file);
    }
    for (const id of exerciseFolders) {
      if (!manifest.exercises.includes(id))
        error(path.join(exerciseDir, id), 'exercise is not listed in chapter.json');
    }
  }

  return report;
}

/** A readable report: errors and warnings grouped by file, then the totals. */
export function formatReport(report: ValidationReport): string {
  const lines: string[] = [];
  const group = (label: string, issues: Issue[]) => {
    const byFile = new Map<string, string[]>();
    for (const issue of issues)
      byFile.set(issue.file, [...(byFile.get(issue.file) ?? []), issue.message]);
    for (const [file, messages] of byFile) {
      lines.push(`${label} ${file}`);
      for (const message of messages) lines.push(`  - ${message}`);
    }
  };
  group('error', report.errors);
  group('warning', report.warnings);
  for (const note of report.notes) lines.push(`note: ${note}`);
  const { chapters, digests, banks, questions, exercises } = report.counts;
  lines.push(
    `content:validate: ${chapters} chapter(s), ${digests} digest(s), ${banks} bank(s), ` +
      `${questions} question(s), ${exercises} exercise(s); ` +
      `${report.errors.length} error(s), ${report.warnings.length} warning(s).`,
  );
  return lines.join('\n');
}
