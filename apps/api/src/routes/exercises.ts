import path from 'node:path';
import {
  answerInputSchema,
  exerciseAnswerRequestSchema,
  gradeExercise,
  toPublicExercise,
  type ExerciseAnswerResponse,
  type ExerciseResponse,
  type ExerciseSummary,
} from '@forward-pass/shared';
import { Router } from 'express';
import { authLocals, requireAuth } from '../auth/middleware';
import type { LoadedContent, LoadedExercise } from '../content/load';
import type { AnswerRow, Db } from '../db';
import { sendError, sendValidationError } from '../http';
import { readingOrder } from '../lessons/progress';

interface ExerciseRouterDeps {
  db: Db;
  content: LoadedContent;
}

const statusOf = (answers: AnswerRow[]): ExerciseSummary['status'] =>
  answers.some((answer) => answer.accepted) ? 'accepted' : answers.length ? 'tried' : 'new';

/** A lesson's exercises with the learner's status, for the Lesson page. */
export async function exerciseSummaries(
  db: Db,
  content: LoadedContent,
  userId: string,
  lessonId: string,
): Promise<ExerciseSummary[]> {
  const mine = [...content.exercises.values()].filter(
    ({ exercise }) => exercise.sectionNumber === lessonId,
  );
  if (!mine.length) return [];
  const answers = await db.answer.findMany({
    where: { userId, context: 'exercise', questionId: { in: mine.map((e) => e.exercise.id) } },
  });
  return mine.map(({ exercise }) => ({
    id: exercise.id,
    title: exercise.title,
    estimatedMinutes: exercise.estimatedMinutes,
    hasTests: Boolean(exercise.tests),
    status: statusOf(answers.filter((answer) => answer.questionId === exercise.id)),
  }));
}

export function exerciseRouter({ db, content }: ExerciseRouterDeps): Router {
  const router = Router();
  router.use('/exercises', requireAuth);

  async function stateOf(loaded: LoadedExercise, userId: string): Promise<ExerciseResponse> {
    const { exercise } = loaded;
    const [answers, reveal, order] = await Promise.all([
      db.answer.findMany({
        where: { userId, context: 'exercise', questionId: exercise.id },
        orderBy: { createdAt: 'asc' },
      }),
      db.exerciseReveal.findUnique({
        where: { userId_exerciseId: { userId, exerciseId: exercise.id } },
      }),
      readingOrder(db),
    ]);
    const status = statusOf(answers);
    const last = answers.at(-1);
    const lastAnswer = last ? answerInputSchema.safeParse(last.answer) : null;
    return {
      exercise: toPublicExercise(exercise),
      section: {
        id: exercise.sectionNumber,
        title:
          order.find((lesson) => lesson.id === exercise.sectionNumber)?.title ??
          exercise.sectionNumber,
      },
      status,
      tries: answers.length,
      feedback: last?.feedback ?? null,
      lastAnswer: lastAnswer?.success ? lastAnswer.data : null,
      revealed: Boolean(reveal),
      solution:
        status === 'accepted' || reveal
          ? {
              walkthrough: exercise.solution.walkthrough,
              finalAnswer: exercise.solution.finalAnswer,
              files: loaded.solutionFiles,
            }
          : null,
    };
  }

  router.get('/exercises/:id', async (req, res) => {
    const loaded = content.exercises.get(req.params.id);
    if (!loaded) return sendError(res, 404, 'not_found', 'No such exercise.');
    res.json(await stateOf(loaded, authLocals(res).userId!));
  });

  router.post('/exercises/:id/answers', async (req, res) => {
    const loaded = content.exercises.get(req.params.id);
    if (!loaded) return sendError(res, 404, 'not_found', 'No such exercise.');
    const parsed = exerciseAnswerRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const userId = authLocals(res).userId!;
    const { exercise } = loaded;

    const previous = await db.answer.count({
      where: { userId, context: 'exercise', questionId: exercise.id },
    });
    const result = gradeExercise(exercise, parsed.data.answer);
    await db.answer.create({
      data: {
        userId,
        lessonId: exercise.sectionNumber,
        questionId: exercise.id,
        context: 'exercise',
        answer: parsed.data.answer,
        accepted: result.accepted,
        firstTry: previous === 0,
        feedback: result.feedback,
      },
    });
    const body: ExerciseAnswerResponse = {
      result: { accepted: result.accepted, feedback: result.feedback },
      state: await stateOf(loaded, userId),
    };
    res.json(body);
  });

  /** Shows the solution before acceptance. Logged, so it isn't hidden from the learner's record. */
  router.post('/exercises/:id/reveal', async (req, res) => {
    const loaded = content.exercises.get(req.params.id);
    if (!loaded) return sendError(res, 404, 'not_found', 'No such exercise.');
    const userId = authLocals(res).userId!;
    await db.exerciseReveal.upsert({
      where: { userId_exerciseId: { userId, exerciseId: loaded.exercise.id } },
      create: { userId, exerciseId: loaded.exercise.id },
      update: {},
    });
    res.json(await stateOf(loaded, userId));
  });

  // Starter and test files always; solution files once unlocked. Only listed paths are served.
  router.get('/exercises/:id/files/*file', async (req, res) => {
    const loaded = content.exercises.get(req.params.id);
    if (!loaded) return sendError(res, 404, 'not_found', 'No such exercise.');
    const raw = (req.params as unknown as { file: string | string[] }).file;
    const file = Array.isArray(raw) ? raw.join('/') : raw;
    const { exercise } = loaded;
    const open = [...exercise.starterFiles, ...(exercise.tests?.files ?? [])];
    let allowed = open.includes(file);
    if (!allowed && loaded.solutionFiles.includes(file)) {
      const state = await stateOf(loaded, authLocals(res).userId!);
      if (!state.solution) {
        return sendError(res, 403, 'locked', 'The solution unlocks after acceptance or a reveal.');
      }
      allowed = true;
    }
    if (!allowed) return sendError(res, 404, 'not_found', 'No such file in this exercise.');
    res.download(path.join(loaded.dir, ...file.split('/')), path.basename(file), {
      dotfiles: 'deny',
    });
  });

  return router;
}
