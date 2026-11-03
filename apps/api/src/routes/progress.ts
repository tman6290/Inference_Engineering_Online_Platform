import {
  SECTION_COUNT,
  SHAKY_ACCEPTANCE,
  WEEK_GOAL_MINUTES,
  type HomeResponse,
  type ProgressPage,
  type Standing,
  type StandingsResponse,
} from '@forward-pass/shared';
import { Router } from 'express';
import { authLocals, requireAuth } from '../auth/middleware';
import { countWords, readingMinutes, stripPageHeader } from '../book/parse';
import type { LoadedContent } from '../content/load';
import type { Db } from '../db';
import { sendError } from '../http';
import { readingOrder } from '../lessons/progress';
import { challengeFor, duelRecord, duelsFor } from '../pod/duels';
import {
  addDays,
  bestWeekday,
  lastGap,
  mean,
  sectionMastery,
  studyDate,
  typicalSession,
  uptime,
  weekdayOf,
} from '../progress/days';
import {
  firstTryCounts,
  freshStudyDays,
  latestAcceptance,
  latestRatings,
  rebuildAll,
  recallQueue,
} from '../progress/store';

interface ProgressRouterDeps {
  db: Db;
  content: LoadedContent;
  /** Mounts POST /api/progress/rebuild. Off in production. */
  devRoutes: boolean;
}

const HEATMAP_WEEKS = 12;
const PACE_WINDOW_DAYS = 28;
/** Seven chapter projects; none ship until build prompt 11. */
const PROJECTS_TOTAL = 7;
const round1 = (value: number) => Math.round(value * 10) / 10;

export function progressRouter({ db, content, devRoutes }: ProgressRouterDeps): Router {
  const router = Router();
  router.use(['/progress', '/home', '/pod'], requireAuth);

  /** Everything both pages need about one learner. */
  async function learner(userId: string, now: Date) {
    const today = studyDate(now);
    const [days, user, reads, [acceptedFirstTry, answered], acceptance, ratings, events] =
      await Promise.all([
        freshStudyDays(db, userId, now),
        db.user.findUniqueOrThrow({ where: { id: userId } }),
        db.lessonProgress.findMany({ where: { userId, readAt: { not: null } } }),
        firstTryCounts(db, userId),
        latestAcceptance(db, userId),
        latestRatings(db, userId),
        db.readingEvent.findMany({
          where: { userId },
          select: { startedAt: true, endedAt: true },
        }),
      ]);
    const sections = await db.section.findMany({ select: { number: true } });
    const numbered = new Set(sections.map((section) => section.number));
    const readSections = reads.filter((row) => numbered.has(row.lessonId));
    const windowStart = addDays(today, -(PACE_WINDOW_DAYS - 1));
    const recent = readSections.filter((row) => studyDate(row.readAt!) >= windowStart).length;
    const sectionsPerWeek = round1((recent / PACE_WINDOW_DAYS) * 7);
    const decoded = readSections.length;
    const remaining = SECTION_COUNT - decoded;
    const projectedFinish =
      remaining <= 0
        ? today
        : sectionsPerWeek > 0
          ? addDays(today, Math.ceil((remaining / sectionsPerWeek) * 7))
          : null;
    const current = uptime(days, today);
    return {
      user,
      today,
      days,
      uptime: current,
      longest: Math.max(user.longestUptime, current),
      readingHours: round1(days.reduce((sum, day) => sum + day.readingMinutes, 0) / 60),
      decoded,
      sectionsPerWeek,
      projectedFinish,
      acceptanceRate: answered ? acceptedFirstTry / answered : null,
      typicalSessionMinutes: typicalSession(events),
      mastery: (number: string) =>
        sectionMastery(acceptance.get(number) ?? null, ratings.get(number)?.level ?? null),
      acceptance,
      ratings,
    };
  }

  const partnerOf = (userId: string) =>
    db.user.findFirst({ where: { id: { not: userId } }, orderBy: { createdAt: 'asc' } });

  router.get('/progress', async (_req, res) => {
    const userId = authLocals(res).userId!;
    const now = new Date();
    const partnerUser = await partnerOf(userId);
    const [me, partner, chapters, recall] = await Promise.all([
      learner(userId, now),
      partnerUser ? learner(partnerUser.id, now) : null,
      db.chapter.findMany({
        where: { number: { gt: 0 } },
        orderBy: { number: 'asc' },
        include: { sections: { orderBy: { orderIndex: 'asc' } } },
      }),
      recallQueue(db, userId, now),
    ]);

    // Twelve full weeks of cells, Monday first, ending with today.
    const start = addDays(me.today, -(weekdayOf(me.today) + 7 * (HEATMAP_WEEKS - 1)));
    const byDate = new Map(me.days.map((day) => [day.date, day]));
    const grid: ProgressPage['days'] = [];
    for (let date = start; date <= me.today; date = addDays(date, 1)) {
      const day = byDate.get(date);
      grid.push({
        date,
        intensity: day?.intensity ?? 0,
        readingMinutes: day?.readingMinutes ?? 0,
        sectionsRead: day?.sectionsRead ?? 0,
        answersGraded: day?.answersGraded ?? 0,
      });
    }

    const body: ProgressPage = {
      today: me.today,
      days: grid,
      uptime: { current: me.uptime, longest: me.longest },
      stats: {
        readingHours: me.readingHours,
        decoded: me.decoded,
        sectionsPerWeek: me.sectionsPerWeek,
        projectedFinish: me.projectedFinish,
        acceptanceRate: me.acceptanceRate,
      },
      patterns: {
        bestWeekday: bestWeekday(me.days),
        typicalSessionMinutes: me.typicalSessionMinutes,
        lastGapDays: lastGap(me.days),
      },
      partner:
        partner && partnerUser
          ? {
              displayName: partnerUser.displayName,
              sectionsPerWeek: partner.sectionsPerWeek,
              uptime: partner.uptime,
              readingHours: partner.readingHours,
            }
          : null,
      mastery: chapters.map((chapter) => {
        const sections = chapter.sections.map((section) => ({
          number: section.number,
          title: section.title,
          mine: me.mastery(section.number),
          partner: partner ? partner.mastery(section.number) : null,
        }));
        return {
          number: chapter.number,
          title: chapter.title,
          mine: mean(sections.map((section) => section.mine)),
          partner: partner ? mean(sections.map((section) => section.partner!)) : null,
          sections,
        };
      }),
      recall,
    };
    res.json(body);
  });

  /** The lesson to resume: the latest one started and not yet read, else the first unread. */
  async function continueFor(userId: string): Promise<HomeResponse['continue']> {
    const [order, progress] = await Promise.all([
      readingOrder(db),
      db.lessonProgress.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } }),
    ]);
    const read = new Set(progress.filter((row) => row.readAt).map((row) => row.lessonId));
    const started = progress.find((row) => !row.readAt && row.maxScrollPct > 0);
    const id = started?.lessonId ?? order.find((lesson) => !read.has(lesson.id))?.id;
    if (!id) return null;
    const pct = progress.find((row) => row.lessonId === id)?.maxScrollPct ?? 0;
    const title = order.find((lesson) => lesson.id === id)?.title ?? id;

    let minutes = 0;
    let chapter: { number: number; title: string } | null = null;
    let position: { index: number; of: number } | null = null;
    if (id === 'preface') {
      const page = await db.bookPage.findUnique({ where: { slug: 'preface' } });
      minutes = readingMinutes(countWords(stripPageHeader(page?.markdown ?? '').body));
    } else if (id === '0') {
      const zero = await db.chapter.findUnique({ where: { number: 0 } });
      minutes = readingMinutes(countWords(zero?.intro ?? ''));
      chapter = zero ? { number: 0, title: zero.title } : null;
    } else {
      const section = await db.section.findUnique({
        where: { number: id },
        include: { chapter: { include: { sections: { orderBy: { orderIndex: 'asc' } } } } },
      });
      if (section) {
        minutes = section.readingMinutes;
        chapter = { number: section.chapter.number, title: section.chapter.title };
        position = {
          index: section.chapter.sections.findIndex((entry) => entry.number === id) + 1,
          of: section.chapter.sections.length,
        };
      }
    }
    return {
      lessonId: id,
      title,
      number: id === 'preface' || id === '0' ? null : id,
      chapter,
      position,
      maxScrollPct: pct,
      minutesLeft: Math.max(1, Math.round(minutes * (1 - pct / 100))),
      hasCheckpoint: content.banks.has(id),
    };
  }

  async function lastActivity(userId: string) {
    const [progress, answer, reading, order] = await Promise.all([
      db.lessonProgress.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' } }),
      db.answer.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      db.readingEvent.findFirst({ where: { userId }, orderBy: { endedAt: 'desc' } }),
      readingOrder(db),
    ]);
    const candidates = [
      progress ? { at: progress.updatedAt, lessonId: progress.lessonId } : null,
      answer ? { at: answer.createdAt, lessonId: answer.lessonId } : null,
      reading ? { at: reading.endedAt, lessonId: reading.lessonId } : null,
    ].filter((entry): entry is { at: Date; lessonId: string } => Boolean(entry));
    const latest = candidates.sort((a, b) => b.at.getTime() - a.at.getTime())[0];
    if (!latest) return null;
    return {
      at: latest.at.toISOString(),
      lessonId: latest.lessonId,
      title: order.find((lesson) => lesson.id === latest.lessonId)?.title ?? latest.lessonId,
    };
  }

  /** Both seats, the signed-in learner first, with where a duel could be offered. */
  async function standingsFor(
    userId: string,
    now: Date,
    me?: Awaited<ReturnType<typeof learner>>,
  ): Promise<StandingsResponse> {
    const users = await db.user.findMany({ orderBy: { createdAt: 'asc' } });
    const ordered = [
      users.find((user) => user.id === userId)!,
      ...users.filter((user) => user.id !== userId),
    ];
    const members: Standing[] = await Promise.all(
      ordered.map(async (user) => {
        const stats = user.id === userId && me ? me : await learner(user.id, now);
        return {
          id: user.id,
          displayName: user.displayName,
          initial: user.initial,
          colour: user.colour,
          isYou: user.id === userId,
          decoded: stats.decoded,
          acceptanceRate: stats.acceptanceRate,
          projectsShipped: 0,
          uptime: stats.uptime,
          lastActivity: await lastActivity(user.id),
          duels: await duelRecord(db, user.id),
        };
      }),
    );
    const partner = ordered[1];
    return {
      members,
      challenge: partner ? await challengeFor(db, content, userId, partner.id) : null,
    };
  }

  router.get('/pod/standings', async (_req, res) => {
    res.json(await standingsFor(authLocals(res).userId!, new Date()));
  });

  router.get('/home', async (_req, res) => {
    const userId = authLocals(res).userId!;
    const now = new Date();
    const [me, cont, order] = await Promise.all([
      learner(userId, now),
      continueFor(userId),
      readingOrder(db),
    ]);
    const [{ members: standings, challenge }, duels] = await Promise.all([
      standingsFor(userId, now, me),
      duelsFor(db, userId),
    ]);

    // This week, Monday to Sunday.
    const monday = addDays(me.today, -weekdayOf(me.today));
    const byDate = new Map(me.days.map((day) => [day.date, day.readingMinutes]));
    const weekDays = Array.from({ length: 7 }, (_, i) => byDate.get(addDays(monday, i)) ?? 0);

    // The next project: the chapter being read, or the first one with unread sections.
    const chapterNumber =
      cont?.chapter && cont.chapter.number > 0
        ? cont.chapter.number
        : (await db.section.findFirst({ orderBy: { orderIndex: 'asc' } }))?.chapterNumber;
    let nextProject: HomeResponse['nextProject'] = null;
    if (chapterNumber) {
      const chapter = await db.chapter.findUnique({
        where: { number: chapterNumber },
        include: { sections: { orderBy: { orderIndex: 'desc' }, take: 1 } },
      });
      const last = chapter?.sections[0];
      if (chapter && last) {
        const passed = await db.attempt.findFirst({
          where: { userId, kind: 'solo', sectionNumber: last.number, passed: true },
        });
        nextProject = {
          chapterNumber: chapter.number,
          chapterTitle: chapter.title,
          unlockAfter: last.number,
          unlocked: Boolean(passed),
        };
      }
    }

    // Shaky: rated shaky, or a latest checkpoint under 60%.
    const shakyIds = new Set<string>();
    for (const [lessonId, rating] of me.ratings)
      if (rating.level === 'shaky') shakyIds.add(lessonId);
    for (const [lessonId, value] of me.acceptance)
      if (value < SHAKY_ACCEPTANCE) shakyIds.add(lessonId);
    const shaky = [...shakyIds]
      .sort(
        (a, b) =>
          order.findIndex((lesson) => lesson.id === a) -
          order.findIndex((lesson) => lesson.id === b),
      )
      .map((lessonId) => ({
        lessonId,
        title: order.find((lesson) => lesson.id === lessonId)?.title ?? lessonId,
        reason:
          me.ratings.get(lessonId)?.level === 'shaky'
            ? ('rated-shaky' as const)
            : ('low-score' as const),
        acceptance: me.acceptance.get(lessonId) ?? null,
      }));

    const body: HomeResponse = {
      today: me.today,
      continue: cont,
      tiles: {
        decoded: me.decoded,
        acceptanceRate: me.acceptanceRate,
        projectsShipped: 0,
        projectsTotal: PROJECTS_TOTAL,
        weekMinutes: weekDays.reduce((sum, minutes) => sum + minutes, 0),
        weekDays,
        weekGoalMinutes: WEEK_GOAL_MINUTES,
      },
      standings,
      challenge,
      duels: {
        incoming: duels.filter((duel) => duel.status === 'pending' && duel.role === 'opponent'),
        active: duels.filter(
          (duel) =>
            (duel.status === 'pending' && duel.role === 'challenger') || duel.status === 'open',
        ),
        owed: duels.filter((duel) => duel.teachBack.owedBy === 'me' && !duel.teachBack.recorded),
      },
      nextProject,
      shaky,
    };
    res.json(body);
  });

  router.post('/progress/rebuild', async (_req, res) => {
    if (!devRoutes) return sendError(res, 404, 'not_found');
    res.json({ rebuilt: await rebuildAll(db) });
  });

  return router;
}
