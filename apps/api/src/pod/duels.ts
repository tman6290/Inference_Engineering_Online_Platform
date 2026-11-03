import type { DuelView, TeachBackView } from '@forward-pass/shared';
import type { LoadedContent } from '../content/load';
import type { AttemptRow, Db } from '../db';
import { answersByQuestion } from '../checkpoints/state';

// Duels: both learners take the same ten questions on one section, alone, within 48 hours.
// Resolution compares first-try acceptance, then hints (fewer wins), then time taken.

type DuelRow = NonNullable<Awaited<ReturnType<Db['duel']['findUnique']>>>;
type UserRow = NonNullable<Awaited<ReturnType<Db['user']['findUnique']>>>;

const LIVE = ['pending', 'open'];

export interface Result {
  firstTryAccepted: number;
  hints: number;
  /** Milliseconds from start to finish. */
  took: number;
}

/** Which result wins: 'a', 'b' or a draw. Higher first-try count, then fewer hints, then faster. */
export function compareResults(a: Result, b: Result): 'a' | 'b' | 'draw' {
  if (a.firstTryAccepted !== b.firstTryAccepted)
    return a.firstTryAccepted > b.firstTryAccepted ? 'a' : 'b';
  if (a.hints !== b.hints) return a.hints < b.hints ? 'a' : 'b';
  if (a.took !== b.took) return a.took < b.took ? 'a' : 'b';
  return 'draw';
}

const resultOf = (attempt: AttemptRow): Result => ({
  firstTryAccepted: attempt.firstTryAccepted ?? 0,
  hints: attempt.hints ?? 0,
  took: attempt.completedAt!.getTime() - attempt.startedAt.getTime(),
});

/** Expires live duels past their deadline. Called before any read, so state is never stale. */
export async function expireDuels(db: Db, now = new Date()): Promise<void> {
  await db.duel.updateMany({
    where: { status: { in: LIVE }, deadline: { lt: now } },
    data: { status: 'expired', resolvedAt: now },
  });
}

/** Resolves an open duel once both attempts are finished. Safe to call more than once. */
export async function resolveDuel(db: Db, duelId: string, now = new Date()): Promise<void> {
  const duel = await db.duel.findUnique({ where: { id: duelId } });
  if (!duel || duel.status !== 'open' || !duel.challengerAttemptId || !duel.opponentAttemptId)
    return;
  if (duel.deadline < now) {
    await db.duel.updateMany({
      where: { id: duel.id, status: 'open' },
      data: { status: 'expired', resolvedAt: now },
    });
    return;
  }
  const [mine, theirs] = await Promise.all([
    db.attempt.findUnique({ where: { id: duel.challengerAttemptId } }),
    db.attempt.findUnique({ where: { id: duel.opponentAttemptId } }),
  ]);
  if (!mine?.completedAt || !theirs?.completedAt) return;
  const verdict = compareResults(resultOf(mine), resultOf(theirs));
  await db.duel.updateMany({
    where: { id: duel.id, status: 'open' },
    data: {
      status: 'complete',
      resolvedAt: now,
      winnerId: verdict === 'a' ? duel.challengerId : verdict === 'b' ? duel.opponentId : null,
    },
  });
}

/** The loser of a complete duel, who owes a teach-back; null for a draw or an unfinished duel. */
export const loserOf = (duel: DuelRow): string | null =>
  duel.status === 'complete' && duel.winnerId
    ? duel.winnerId === duel.challengerId
      ? duel.opponentId
      : duel.challengerId
    : null;

/** A teach-back counts once it has audio, or text for every question the author missed. */
export async function teachBackRecorded(db: Db, duel: DuelRow): Promise<boolean> {
  const loser = loserOf(duel);
  if (!loser) return false;
  const row = await db.teachBack.findUnique({ where: { duelId: duel.id } });
  if (!row) return false;
  if (row.audioFile) return true;
  const missed = await missedQuestions(db, duel, loser);
  const entries = (row.entries as { questionId: string; text: string }[]) ?? [];
  return missed.every((id) =>
    entries.some((entry) => entry.questionId === id && entry.text.trim()),
  );
}

/** Question ids a learner missed on the first try in their duel attempt. */
export async function missedQuestions(db: Db, duel: DuelRow, userId: string): Promise<string[]> {
  const attemptId =
    userId === duel.challengerId ? duel.challengerAttemptId : duel.opponentAttemptId;
  if (!attemptId) return [];
  const answers = await db.answer.findMany({ where: { attemptId } });
  const grouped = answersByQuestion(answers);
  return duel.questionIds.filter((id) => !grouped.get(id)?.[0]?.accepted);
}

/** What one learner sees of a duel. The partner's score stays hidden until both have finished. */
export async function duelView(
  db: Db,
  duel: DuelRow,
  userId: string,
  users: UserRow[],
  sectionTitle: string,
): Promise<DuelView> {
  const role = duel.challengerId === userId ? 'challenger' : 'opponent';
  const partnerId = role === 'challenger' ? duel.opponentId : duel.challengerId;
  const partner = users.find((user) => user.id === partnerId)!;
  const myAttemptId = role === 'challenger' ? duel.challengerAttemptId : duel.opponentAttemptId;
  const theirAttemptId = role === 'challenger' ? duel.opponentAttemptId : duel.challengerAttemptId;
  const [mine, theirs] = await Promise.all([
    myAttemptId ? db.attempt.findUnique({ where: { id: myAttemptId } }) : null,
    theirAttemptId ? db.attempt.findUnique({ where: { id: theirAttemptId } }) : null,
  ]);
  const bothDone = Boolean(mine?.completedAt && theirs?.completedAt);
  const loser = loserOf(duel);
  return {
    id: duel.id,
    section: { number: duel.sectionNumber, title: sectionTitle },
    status: duel.status as DuelView['status'],
    role,
    partner: {
      id: partner.id,
      displayName: partner.displayName,
      initial: partner.initial,
      colour: partner.colour,
    },
    createdAt: duel.createdAt.toISOString(),
    deadline: duel.deadline.toISOString(),
    questionCount: duel.questionIds.length,
    mine: {
      attemptId: mine?.id ?? null,
      finished: Boolean(mine?.completedAt),
      firstTryAccepted: mine?.completedAt ? (mine.firstTryAccepted ?? 0) : null,
      hints: mine?.completedAt ? (mine.hints ?? 0) : null,
    },
    theirs: {
      started: Boolean(theirs),
      finished: Boolean(theirs?.completedAt),
      firstTryAccepted: bothDone ? (theirs!.firstTryAccepted ?? 0) : null,
      hints: bothDone ? (theirs!.hints ?? 0) : null,
    },
    outcome:
      duel.status !== 'complete'
        ? null
        : duel.winnerId === null
          ? 'draw'
          : duel.winnerId === userId
            ? 'won'
            : 'lost',
    teachBack: {
      owedBy: loser ? (loser === userId ? 'me' : 'partner') : null,
      recorded: loser ? await teachBackRecorded(db, duel) : false,
    },
  };
}

/** Every duel this learner is in, newest first, as they see it. */
export async function duelsFor(db: Db, userId: string): Promise<DuelView[]> {
  await expireDuels(db);
  const [duels, users, sections] = await Promise.all([
    db.duel.findMany({
      where: { OR: [{ challengerId: userId }, { opponentId: userId }] },
      orderBy: { createdAt: 'desc' },
    }),
    db.user.findMany(),
    db.section.findMany({ select: { number: true, title: true } }),
  ]);
  const titles = new Map(sections.map((section) => [section.number, section.title]));
  return Promise.all(
    duels.map((duel) =>
      duelView(db, duel, userId, users, titles.get(duel.sectionNumber) ?? duel.sectionNumber),
    ),
  );
}

/** Wins, losses and draws over complete duels. Expired duels count for nobody. */
export async function duelRecord(db: Db, userId: string) {
  const complete = await db.duel.findMany({
    where: { status: 'complete', OR: [{ challengerId: userId }, { opponentId: userId }] },
  });
  return {
    wins: complete.filter((duel) => duel.winnerId === userId).length,
    losses: complete.filter((duel) => duel.winnerId && duel.winnerId !== userId).length,
    draws: complete.filter((duel) => !duel.winnerId).length,
  };
}

/** Sections both learners have read that have a bank, in reading order. */
export async function sharedSections(db: Db, content: LoadedContent, a: string, b: string) {
  const [reads, sections] = await Promise.all([
    db.lessonProgress.findMany({ where: { userId: { in: [a, b] }, readAt: { not: null } } }),
    db.section.findMany({ orderBy: { orderIndex: 'asc' }, select: { number: true, title: true } }),
  ]);
  const readBy = (userId: string) =>
    new Set(reads.filter((row) => row.userId === userId).map((row) => row.lessonId));
  const [readA, readB] = [readBy(a), readBy(b)];
  return sections.filter(
    (section) =>
      content.banks.has(section.number) && readA.has(section.number) && readB.has(section.number),
  );
}

/**
 * The section the pod table offers a duel on: the latest shared one never duelled on, else the
 * latest without a live duel (a rematch).
 */
export async function challengeFor(
  db: Db,
  content: LoadedContent,
  userId: string,
  partnerId: string,
) {
  const [shared, duels] = await Promise.all([
    sharedSections(db, content, userId, partnerId),
    db.duel.findMany({ select: { sectionNumber: true, status: true } }),
  ]);
  const busy = new Set(duels.filter((d) => LIVE.includes(d.status)).map((d) => d.sectionNumber));
  const duelled = new Set(duels.map((d) => d.sectionNumber));
  const latest = [...shared].reverse();
  const pick =
    latest.find((section) => !duelled.has(section.number)) ??
    latest.find((section) => !busy.has(section.number));
  return pick ? { sectionNumber: pick.number, title: pick.title } : null;
}

/** Teach-backs on a section that this learner wrote or was owed, newest first. */
export async function teachBacksFor(
  db: Db,
  content: LoadedContent,
  userId: string,
  sectionNumber: string,
): Promise<TeachBackView[]> {
  const duels = await db.duel.findMany({
    where: {
      sectionNumber,
      status: 'complete',
      OR: [{ challengerId: userId }, { opponentId: userId }],
    },
    orderBy: { resolvedAt: 'desc' },
  });
  const views: TeachBackView[] = [];
  for (const duel of duels) {
    const view = await teachBackView(db, content, duel);
    if (view) views.push(view);
  }
  return views;
}

export async function teachBackView(
  db: Db,
  content: LoadedContent,
  duel: DuelRow,
): Promise<TeachBackView | null> {
  const row = await db.teachBack.findUnique({ where: { duelId: duel.id } });
  if (!row || !(await teachBackRecorded(db, duel))) return null;
  const [author, section] = await Promise.all([
    db.user.findUnique({ where: { id: row.userId } }),
    db.section.findUnique({ where: { number: duel.sectionNumber } }),
  ]);
  const bank = content.banks.get(duel.sectionNumber);
  const entries = (row.entries as { questionId: string; text: string }[]) ?? [];
  return {
    duelId: duel.id,
    section: { number: duel.sectionNumber, title: section?.title ?? duel.sectionNumber },
    author: { displayName: author?.displayName ?? 'Your partner' },
    entries: entries
      .filter((entry) => entry.text.trim())
      .map((entry) => ({
        questionId: entry.questionId,
        prompt: bank?.questions.find((question) => question.id === entry.questionId)?.prompt ?? '',
        text: entry.text,
      })),
    audioUrl: row.audioFile ? `/api/duels/${duel.id}/teach-back/audio` : null,
    createdAt: row.createdAt.toISOString(),
  };
}
