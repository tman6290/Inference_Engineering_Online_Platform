import {
  critiqueOutputSchema,
  PORTFOLIO_DIMENSION_SHARE,
  PORTFOLIO_TOTAL,
  runnerReportSchema,
  type CritiqueOutput,
  type ProjectSpec,
  type RunnerReport,
} from '@forward-pass/shared';
import type { LlmClient } from '@forward-pass/llm';
import type { LoadedContent } from '../content/load';
import type { Db } from '../db';
import { findUnsupportedClaims } from './claims';

// The critique: the app's one runtime model call (CLAUDE.md, hard rules 3, 4 and 7). The model
// grades against the rubric with the book's own text; this module then refuses to trust it on
// arithmetic, the portfolio gate, failed checks and unsupported claims.

/** Output budget per attempt; the client retries once on a schema failure. */
export const CRITIQUE_MAX_TOKENS = 8000;
/** Book text per section, so seven sections stay inside the input budget. */
const BOOK_CHARS_PER_SECTION = 14_000;
const LOG_CHARS = 6000;

interface CritiqueInput {
  spec: ProjectSpec;
  brief: string;
  book: { number: string; title: string; text: string }[];
  report: Pick<RunnerReport, 'checks' | 'artifacts'>;
  checkLabels: Record<string, string>;
  noteToGrader: string | null;
  files: string[];
}

export const CRITIQUE_RULES = [
  'Grade only against the rubric below. Each dimension scores 0 to its weight; the total is their sum.',
  'Interpretation calls (whether a method, measurement or conclusion is sound) cite the book section they rest on, like "(see 5.2.3)". Use the book text supplied here, not outside knowledge.',
  'Every item under "wrong" points at evidence: a file (path or path:line), a key path in results.json, or a check id.',
  'Never award rigor points for a measurement that results.json does not contain. A number that appears only in the README earns nothing and belongs under unsupportedClaims.',
  'Say so explicitly when a check failed, and treat what it was meant to prove as unproven.',
  '"workOn" items each name one concrete next step, with the book section to read where one applies, else null.',
  'Inline comments use paths and line numbers from the files shown. Keep the headline to 12 words or fewer.',
  `portfolioReady is true only when the total is at least ${PORTFOLIO_TOTAL} and every dimension scores at least ${Math.round(PORTFOLIO_DIMENSION_SHARE * 100)}% of its weight.`,
];

export function buildCritiquePrompt(input: CritiqueInput): { system: string; user: string } {
  const { spec, report } = input;
  const system = [
    `You are the grader for Forward Pass, a study app for the book "Inference Engineering". You critique one learner's solo project: "${spec.title}" (project ${spec.number}, chapter ${spec.chapter}).`,
    'Be specific and fair, and write like a senior engineer reviewing a colleague: plain sentences, no filler.',
    'Rules:',
    ...CRITIQUE_RULES.map((rule, index) => `${index + 1}. ${rule}`),
    'Reply with JSON only, matching the schema.',
  ].join('\n');

  const block = (title: string, body: string) => `<${title}>\n${body}\n</${title}>`;
  const checks = report.checks.length
    ? report.checks
        .map((check) => {
          const log = check.log.length > LOG_CHARS ? `…${check.log.slice(-LOG_CHARS)}` : check.log;
          return `- ${check.checkId} (${input.checkLabels[check.checkId] ?? check.kind}): ${check.passed ? 'PASSED' : 'FAILED'}\n${log}`;
        })
        .join('\n\n')
    : 'No checks ran.';
  const user = [
    block('brief', input.brief),
    block(
      'rubric',
      spec.rubric
        .map((row) => `- ${row.dimension} (weight ${row.weight}): ${row.criteria.join('; ')}`)
        .join('\n'),
    ),
    block('deliverables', spec.deliverables.map((item) => `- ${item}`).join('\n')),
    block('constraints', spec.constraints.map((item) => `- ${item}`).join('\n') || 'None.'),
    ...input.book.map((section) =>
      block(`book_section number="${section.number}" title="${section.title}"`, section.text),
    ),
    block('check_results', checks),
    block('file_tree', report.artifacts.fileTree.join('\n') || '(empty)'),
    block('readme', report.artifacts.readme ?? '(README.md is missing)'),
    block(
      'results_json',
      report.artifacts.results === null
        ? '(results.json is missing or invalid)'
        : JSON.stringify(report.artifacts.results, null, 2),
    ),
    ...report.artifacts.sources.map((file) => block(`source path="${file.path}"`, file.content)),
    block('uploaded_files', input.files.join('\n') || 'None.'),
    block('note_to_grader', input.noteToGrader ?? 'None.'),
  ].join('\n\n');
  return { system, user };
}

/**
 * Makes the model's output consistent with the spec and the evidence: dimensions follow the
 * rubric, scores are clamped, the total and portfolio gate are recomputed, every failed check is
 * named under "wrong", and claims results.json doesn't back are listed whatever the model said.
 */
export function finalise(
  raw: CritiqueOutput,
  spec: ProjectSpec,
  report: Pick<RunnerReport, 'checks' | 'artifacts'>,
  checkLabels: Record<string, string>,
): CritiqueOutput {
  const dimensions = spec.rubric.map((row) => {
    const given = raw.dimensions.find(
      (entry) => entry.dimension.toLowerCase() === row.dimension.toLowerCase(),
    );
    const score = Math.round(Math.min(row.weight, Math.max(0, given?.score ?? 0)) * 10) / 10;
    return {
      dimension: row.dimension,
      score,
      max: row.weight,
      reasoning: given?.reasoning ?? 'Not scored.',
    };
  });
  const total = Math.round(dimensions.reduce((sum, row) => sum + row.score, 0));
  const portfolioReady =
    total >= PORTFOLIO_TOTAL &&
    dimensions.every((row) => row.score >= PORTFOLIO_DIMENSION_SHARE * row.max);

  const wrong = [...raw.wrong];
  for (const check of report.checks.filter((entry) => !entry.passed)) {
    const named = wrong.some(
      (item) => item.evidence.kind === 'check' && item.evidence.ref === check.checkId,
    );
    if (!named) {
      wrong.unshift({
        text: `The "${checkLabels[check.checkId] ?? check.checkId}" check failed, so what it proves is unproven.`,
        evidence: { kind: 'check', ref: check.checkId },
      });
    }
  }

  const unsupported = [...raw.unsupportedClaims];
  for (const claim of findUnsupportedClaims(report.artifacts.readme, report.artifacts.results)) {
    if (!unsupported.some((entry) => entry.claim === claim.claim)) unsupported.push(claim);
  }

  return {
    ...raw,
    dimensions,
    total,
    headline: raw.headline.split(/\s+/).slice(0, 12).join(' '),
    wrong,
    unsupportedClaims: unsupported,
    portfolioReady,
  };
}

/** The book text for each of a spec's sections, from the ingested book in the database. */
async function bookText(db: Db, numbers: string[]) {
  const sections = await db.section.findMany({
    where: { number: { in: numbers } },
    include: { subsections: { orderBy: { orderIndex: 'asc' } } },
    orderBy: { orderIndex: 'asc' },
  });
  return sections.map((section) => {
    const text = [
      section.intro,
      ...section.subsections.map((sub) => `## ${sub.number} ${sub.title}\n${sub.markdown}`),
    ].join('\n\n');
    return {
      number: section.number,
      title: section.title,
      text:
        text.length > BOOK_CHARS_PER_SECTION
          ? `${text.slice(0, BOOK_CHARS_PER_SECTION)}\n… cut for length`
          : text,
    };
  });
}

/** Critiques a checked submission and stores the result with its cost. Never throws. */
export function createCritiqueRunner(db: Db, content: LoadedContent, llm: LlmClient) {
  return async (submissionId: string): Promise<void> => {
    const submission = await db.submission.findUnique({
      where: { id: submissionId },
      include: { checks: { orderBy: { position: 'asc' } }, files: true },
    });
    const loaded = submission ? content.projects.get(submission.projectSlug) : undefined;
    if (!submission || !loaded) return;
    try {
      const artifacts = runnerReportSchema.shape.artifacts.parse(submission.artifacts);
      const report = {
        artifacts,
        checks: submission.checks.map((check) => ({
          checkId: check.checkId,
          kind: check.kind as RunnerReport['checks'][number]['kind'],
          passed: check.passed,
          log: check.log,
          durationMs: check.durationMs,
        })),
      };
      const checkLabels = Object.fromEntries(
        loaded.spec.checks.map((check) => [check.id, check.label]),
      );
      const prompt = buildCritiquePrompt({
        spec: loaded.spec,
        brief: loaded.brief,
        book: await bookText(db, loaded.spec.bookSections),
        report,
        checkLabels,
        noteToGrader: submission.noteToGrader,
        files: submission.files.map((file) => file.name),
      });
      const result = await llm.complete({
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        schema: critiqueOutputSchema,
        temperature: 0,
        maxTokens: CRITIQUE_MAX_TOKENS,
        label: `critique:${loaded.spec.slug}:v${submission.version}`,
      });
      const critique = finalise(result.data, loaded.spec, report, checkLabels);
      await db.$transaction([
        db.critique.upsert({
          where: { submissionId },
          create: {
            submissionId,
            json: critique,
            model: result.model,
            costUsd: result.usage.costUsd,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
          },
          update: {
            json: critique,
            model: result.model,
            costUsd: result.usage.costUsd,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
          },
        }),
        db.submission.update({
          where: { id: submissionId },
          data: { status: 'graded', gradedAt: new Date(), failure: null },
        }),
      ]);
    } catch (error) {
      await db.submission.update({
        where: { id: submissionId },
        data: {
          status: 'failed',
          failure: `The critique could not be completed: ${(error as Error).message}`.slice(0, 500),
        },
      });
    }
  };
}
