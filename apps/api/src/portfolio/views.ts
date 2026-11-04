import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CASE_STUDY_CHARTS,
  critiqueOutputSchema,
  extractDecision,
  type CaseStudy,
  type CritiqueOutput,
  type PortfolioEntry,
  type PublicProfile,
} from '@forward-pass/shared';
import type { LoadedContent } from '../content/load';
import type { Db } from '../db';
import { firstTryCounts } from '../progress/store';

// What the public layer and the "projects shipped" count are built from. Public views are put
// together field by field from the critique, so private fields never reach them.

type UserRow = NonNullable<Awaited<ReturnType<Db['user']['findUnique']>>>;
type SubmissionWithCritique = NonNullable<Awaited<ReturnType<Db['submission']['findFirst']>>> & {
  critique: { json: unknown } | null;
};

export const submissionFilesDir = (uploadsDir: string, submissionId: string) =>
  path.join(uploadsDir, 'submissions', submissionId);

export function critiqueOf(row: { critique: { json: unknown } | null }): CritiqueOutput | null {
  if (!row.critique) return null;
  const parsed = critiqueOutputSchema.safeParse(row.critique.json);
  return parsed.success ? parsed.data : null;
}

/** Graded, portfolio-ready submissions of a learner, newest version first. */
async function readySubmissions(db: Db, userId: string) {
  const rows = await db.submission.findMany({
    where: { userId, status: 'graded' },
    orderBy: [{ projectSlug: 'asc' }, { version: 'desc' }],
    include: { critique: true },
  });
  return rows.filter((row) => critiqueOf(row)?.portfolioReady);
}

/** Projects with a portfolio-ready version: what "projects shipped" counts. */
export async function shippedProjects(
  db: Db,
  content: LoadedContent,
  userId: string,
): Promise<PortfolioEntry[]> {
  const ready = await readySubmissions(db, userId);
  const publicRows = await db.submission.findMany({
    where: { userId, public: true },
    select: { projectSlug: true, version: true },
  });
  const entries: PortfolioEntry[] = [];
  for (const row of ready) {
    if (entries.some((entry) => entry.slug === row.projectSlug)) continue;
    const spec = content.projects.get(row.projectSlug)?.spec;
    if (!spec) continue;
    entries.push({
      slug: spec.slug,
      number: spec.number,
      title: spec.title,
      submissionId: row.id,
      version: row.version,
      total: critiqueOf(row)!.total,
      publicVersion: publicRows.find((pub) => pub.projectSlug === spec.slug)?.version ?? null,
    });
  }
  return entries.sort((a, b) => a.number - b.number);
}

/** The owner of a live page, or null: the whole public layer answers 404 without one. */
export async function liveOwner(db: Db, username: string): Promise<UserRow | null> {
  const user = await db.user.findUnique({ where: { username: username.toLowerCase() } });
  return user?.pageLive ? user : null;
}

async function publicSubmissions(db: Db, userId: string) {
  const rows = await db.submission.findMany({
    where: { userId, public: true, status: 'graded' },
    include: { critique: true },
  });
  // Public stays tied to a portfolio-ready critique; anything else is never shown.
  return rows.filter((row) => critiqueOf(row)?.portfolioReady);
}

/** Chapters whose every numbered section has a passed checkpoint. */
async function chaptersComplete(db: Db, userId: string) {
  const [chapters, passed] = await Promise.all([
    db.chapter.findMany({ where: { number: { gt: 0 } }, include: { sections: true } }),
    db.attempt.findMany({
      where: { userId, kind: 'solo', passed: true },
      select: { sectionNumber: true },
    }),
  ]);
  const done = new Set(passed.map((attempt) => attempt.sectionNumber));
  const complete = chapters.filter(
    (chapter) =>
      chapter.sections.length > 0 && chapter.sections.every((section) => done.has(section.number)),
  ).length;
  return { complete, total: chapters.length };
}

export async function profileOf(
  db: Db,
  content: LoadedContent,
  user: UserRow,
): Promise<PublicProfile> {
  const [rows, chapters, [acceptedFirstTry, answered]] = await Promise.all([
    publicSubmissions(db, user.id),
    chaptersComplete(db, user.id),
    firstTryCounts(db, user.id),
  ]);
  const projects: PublicProfile['projects'] = [];
  const skills = new Set<string>();
  for (const row of rows) {
    const spec = content.projects.get(row.projectSlug)?.spec;
    const critique = critiqueOf(row);
    if (!spec || !critique) continue;
    critique.skillsDemonstrated.forEach((skill) => skills.add(skill));
    projects.push({
      slug: spec.slug,
      number: spec.number,
      title: spec.title,
      chapterNumber: spec.chapter,
      total: critique.total,
      decision: decisionOf(row),
    });
  }
  return {
    username: user.username!,
    displayName: user.displayName,
    chaptersComplete: chapters.complete,
    chaptersTotal: chapters.total,
    acceptanceRate: answered ? acceptedFirstTry / answered : null,
    skills: [...skills].sort((a, b) => a.localeCompare(b)),
    projects: projects.sort((a, b) => a.number - b.number),
  };
}

function decisionOf(row: { artifacts: unknown }): string | null {
  const readme = (row.artifacts as { readme?: unknown } | null)?.readme;
  return extractDecision(typeof readme === 'string' ? readme : null);
}

/** Up to three PNG charts uploaded with the submission, oldest first. */
export async function chartsOf(db: Db, submissionId: string) {
  return db.submissionFile.findMany({
    where: { submissionId, mime: 'image/png' },
    orderBy: { createdAt: 'asc' },
    take: CASE_STUDY_CHARTS,
  });
}

/** The public case study of one submission. `chartUrl` decides where each chart is served. */
export async function caseStudyOf(
  db: Db,
  content: LoadedContent,
  user: UserRow,
  row: SubmissionWithCritique,
  chartUrl: (name: string) => string,
): Promise<CaseStudy | null> {
  const spec = content.projects.get(row.projectSlug)?.spec;
  const critique = critiqueOf(row);
  if (!spec || !critique) return null;
  const [chapter, charts] = await Promise.all([
    db.chapter.findUnique({ where: { number: spec.chapter } }),
    chartsOf(db, row.id),
  ]);
  return {
    username: user.username ?? '',
    displayName: user.displayName,
    slug: spec.slug,
    number: spec.number,
    title: spec.title,
    chapter: { number: spec.chapter, title: chapter?.title ?? `Chapter ${spec.chapter}` },
    decision: decisionOf(row),
    charts: charts.map((file) => ({ name: file.name, url: chartUrl(file.name) })),
    total: critique.total,
    dimensions: critique.dimensions.map(({ dimension, score, max }) => ({ dimension, score, max })),
    skillsDemonstrated: [...critique.skillsDemonstrated],
    right: [...critique.right],
    repoUrl: row.repoUrl,
    commitSha: row.commitSha,
    version: row.version,
    gradedAt: row.gradedAt?.toISOString() ?? null,
  };
}

/** The public submission of a project for a live page, or null. */
export async function publicSubmission(db: Db, userId: string, slug: string) {
  const row = await db.submission.findFirst({
    where: { userId, projectSlug: slug, public: true, status: 'graded' },
    include: { critique: true },
  });
  return row && critiqueOf(row)?.portfolioReady ? row : null;
}

/** A chart's bytes as a data: URI, for the PDF. */
export async function chartDataUri(uploadsDir: string, submissionId: string, name: string) {
  const bytes = await readFile(path.join(submissionFilesDir(uploadsDir, submissionId), name));
  return `data:image/png;base64,${bytes.toString('base64')}`;
}
