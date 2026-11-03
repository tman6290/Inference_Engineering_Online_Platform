import type { ReadState } from '@forward-pass/shared';
import type { Db } from '../db';

export interface ProgressRow {
  lessonId: string;
  maxScrollPct: number;
  readAt: Date | null;
}

export function readStateOf(row: ProgressRow | undefined): ReadState {
  if (!row) return 'unread';
  if (row.readAt) return 'read';
  return row.maxScrollPct > 0 ? 'reading' : 'unread';
}

/** Every lesson's progress for one learner, keyed by lesson id. */
export async function progressByLesson(db: Db, userId: string): Promise<Map<string, ProgressRow>> {
  const rows = await db.lessonProgress.findMany({ where: { userId } });
  return new Map(rows.map((row) => [row.lessonId, row]));
}

/** The latest confidence rating per lesson for one learner. */
export async function confidenceByLesson(db: Db, userId: string) {
  const rows = await db.confidenceRating.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  const latest = new Map<string, (typeof rows)[number]['level']>();
  for (const row of rows) if (!latest.has(row.lessonId)) latest.set(row.lessonId, row.level);
  return latest;
}

export interface LessonRef {
  id: string;
  title: string;
}

/** Reading order: the Preface, Chapter 0, then every numbered section. */
export async function readingOrder(db: Db): Promise<LessonRef[]> {
  const [preface, chapterZero, sections] = await Promise.all([
    db.bookPage.findUnique({ where: { slug: 'preface' }, select: { title: true } }),
    db.chapter.findUnique({ where: { number: 0 }, select: { title: true } }),
    db.section.findMany({ orderBy: { orderIndex: 'asc' }, select: { number: true, title: true } }),
  ]);
  return [
    ...(preface ? [{ id: 'preface', title: preface.title }] : []),
    ...(chapterZero ? [{ id: '0', title: chapterZero.title }] : []),
    ...sections.map((section) => ({ id: section.number, title: section.title })),
  ];
}
