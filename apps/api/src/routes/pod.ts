import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createDuelRequestSchema,
  DUEL_HOURS,
  TEACH_BACK_AUDIO_MAX_BYTES,
  TEACH_BACK_AUDIO_TYPES,
  teachBackRequestSchema,
  type DuelsResponse,
  type TeachBackForm,
} from '@forward-pass/shared';
import express, { Router, type Response } from 'express';
import { authLocals, requireAuth } from '../auth/middleware';
import { sampleQuestions } from '../checkpoints/sample';
import type { LoadedContent } from '../content/load';
import type { Db } from '../db';
import { sendError, sendValidationError } from '../http';
import {
  duelsFor,
  duelView,
  expireDuels,
  loserOf,
  missedQuestions,
  sharedSections,
  teachBackView,
} from '../pod/duels';

interface PodRouterDeps {
  db: Db;
  content: LoadedContent;
  /** uploads/, gitignored. Teach-back audio goes in uploads/teach-backs. */
  uploadsDir: string;
}

const HOUR = 60 * 60 * 1000;
const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
};

export function podRouter({ db, content, uploadsDir }: PodRouterDeps): Router {
  const router = Router();
  router.use('/duels', requireAuth);
  const audioDir = path.join(uploadsDir, 'teach-backs');

  /** A duel the signed-in learner is in, or null after sending a 404. */
  async function ownDuel(res: Response, id: string) {
    await expireDuels(db);
    const duel = await db.duel.findUnique({ where: { id } });
    const userId = authLocals(res).userId!;
    if (!duel || (duel.challengerId !== userId && duel.opponentId !== userId)) {
      sendError(res, 404, 'not_found', 'No such duel.');
      return null;
    }
    return { duel, userId };
  }

  async function viewOf(
    duel: NonNullable<Awaited<ReturnType<Db['duel']['findUnique']>>>,
    userId: string,
  ) {
    const [users, section] = await Promise.all([
      db.user.findMany(),
      db.section.findUnique({ where: { number: duel.sectionNumber } }),
    ]);
    return duelView(db, duel, userId, users, section?.title ?? duel.sectionNumber);
  }

  router.get('/duels', async (_req, res) => {
    const body: DuelsResponse = { duels: await duelsFor(db, authLocals(res).userId!) };
    res.json(body);
  });

  // A challenge: both must have read the section, and the pair can have one live duel per section.
  router.post('/duels', async (req, res) => {
    const parsed = createDuelRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const { sectionNumber } = parsed.data;
    const userId = authLocals(res).userId!;
    const partner = await db.user.findFirst({ where: { id: { not: userId } } });
    if (!partner)
      return sendError(res, 409, 'no_partner', 'Duels need your partner in the second seat.');
    const bank = content.banks.get(sectionNumber);
    if (!bank)
      return sendError(res, 404, 'not_found', `Section ${sectionNumber} has no checkpoint yet.`);
    const shared = await sharedSections(db, content, userId, partner.id);
    if (!shared.some((section) => section.number === sectionNumber)) {
      return sendError(
        res,
        409,
        'not_unlocked',
        `You both need to have read ${sectionNumber} first.`,
      );
    }
    await expireDuels(db);
    const live = await db.duel.findFirst({
      where: { sectionNumber, status: { in: ['pending', 'open'] } },
    });
    if (live)
      return sendError(res, 409, 'duel_exists', `There is already a duel on ${sectionNumber}.`);

    // Fresh for both: leave out every question either has answered before.
    const seen = await db.answer.findMany({
      where: { userId: { in: [userId, partner.id] }, lessonId: sectionNumber },
      select: { questionId: true },
    });
    const seed = randomUUID();
    const now = new Date();
    const duel = await db.duel.create({
      data: {
        sectionNumber,
        challengerId: userId,
        opponentId: partner.id,
        seed,
        questionIds: sampleQuestions(bank.questions, {
          seed,
          exclude: new Set(seen.map((row) => row.questionId)),
        }),
        createdAt: now,
        deadline: new Date(now.getTime() + DUEL_HOURS * HOUR),
      },
    });
    res.status(201).json(await viewOf(duel, userId));
  });

  router.post('/duels/:id/accept', async (req, res) => {
    const found = await ownDuel(res, req.params.id);
    if (!found) return;
    const { duel, userId } = found;
    if (duel.opponentId !== userId) {
      return sendError(res, 403, 'not_opponent', 'Only the challenged learner can accept.');
    }
    if (duel.status !== 'pending') {
      return sendError(res, 409, 'not_pending', `This duel is ${duel.status}.`);
    }
    const accepted = await db.duel.update({
      where: { id: duel.id },
      data: { status: 'open', acceptedAt: new Date() },
    });
    res.json(await viewOf(accepted, userId));
  });

  /** The loser's form (missed questions), or the finished teach-back for either learner. */
  router.get('/duels/:id/teach-back', async (req, res) => {
    const found = await ownDuel(res, req.params.id);
    if (!found) return;
    const { duel, userId } = found;
    const loser = loserOf(duel);
    if (!loser)
      return sendError(res, 409, 'no_teach_back', 'Only a decided duel has a teach-back.');
    const bank = content.banks.get(duel.sectionNumber);
    const missed = await missedQuestions(db, duel, loser);
    const body: TeachBackForm = {
      duel: await viewOf(duel, userId),
      missed: missed.map((questionId) => {
        const question = bank?.questions.find((entry) => entry.id === questionId);
        return {
          questionId,
          prompt: question?.prompt ?? '',
          explanation: question?.explanation ?? '',
        };
      }),
      teachBack: await teachBackView(db, content, duel),
    };
    res.json(body);
  });

  /** Saves the loser's written answers. Text for every missed question, or audio, makes it count. */
  router.put('/duels/:id/teach-back', async (req, res) => {
    const found = await ownDuel(res, req.params.id);
    if (!found) return;
    const { duel, userId } = found;
    if (loserOf(duel) !== userId) {
      return sendError(
        res,
        403,
        'not_owed',
        'Only the loser of a decided duel records a teach-back.',
      );
    }
    const parsed = teachBackRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const missed = new Set(await missedQuestions(db, duel, userId));
    const entries = parsed.data.entries.filter((entry) => missed.has(entry.questionId));
    await db.teachBack.upsert({
      where: { duelId: duel.id },
      create: { duelId: duel.id, userId, entries },
      update: { entries },
    });
    res.json(await viewOf(duel, userId));
  });

  router.put(
    '/duels/:id/teach-back/audio',
    express.raw({ type: 'audio/*', limit: TEACH_BACK_AUDIO_MAX_BYTES }),
    async (req, res) => {
      const found = await ownDuel(res, req.params.id);
      if (!found) return;
      const { duel, userId } = found;
      if (loserOf(duel) !== userId) {
        return sendError(
          res,
          403,
          'not_owed',
          'Only the loser of a decided duel records a teach-back.',
        );
      }
      const mime = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
      if (!(TEACH_BACK_AUDIO_TYPES as readonly string[]).includes(mime)) {
        return sendError(res, 415, 'unsupported_audio', 'Upload WebM, Ogg, MP3, M4A or WAV audio.');
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return sendError(res, 400, 'empty_audio', 'The recording is empty.');
      }
      await mkdir(audioDir, { recursive: true });
      const previous = await db.teachBack.findUnique({ where: { duelId: duel.id } });
      const file = `${duel.id}.${EXTENSIONS[mime]}`;
      await writeFile(path.join(audioDir, file), req.body);
      if (previous?.audioFile && previous.audioFile !== file) {
        await unlink(path.join(audioDir, previous.audioFile)).catch(() => undefined);
      }
      await db.teachBack.upsert({
        where: { duelId: duel.id },
        create: { duelId: duel.id, userId, entries: [], audioFile: file, audioMime: mime },
        update: { audioFile: file, audioMime: mime },
      });
      res.json(await viewOf(duel, userId));
    },
  );

  router.get('/duels/:id/teach-back/audio', async (req, res) => {
    const found = await ownDuel(res, req.params.id);
    if (!found) return;
    const row = await db.teachBack.findUnique({ where: { duelId: found.duel.id } });
    const file = row?.audioFile ? path.join(audioDir, row.audioFile) : null;
    if (!file || !existsSync(file)) return sendError(res, 404, 'not_found', 'No recording.');
    res.type(row!.audioMime ?? 'application/octet-stream');
    createReadStream(file).pipe(res);
  });

  return router;
}
