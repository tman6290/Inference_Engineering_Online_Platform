import {
  CHECKPOINT_PASS,
  MAX_TRIES,
  type AnswerInput,
  type AttemptQuestion,
  type AttemptResponse,
  type CheckpointSectionResponse,
  type CheckpointsResponse,
  type ExerciseResponse,
  type PublicQuestion,
} from '@forward-pass/shared';

// A toy checkpoint and exercise backend for page tests. Keys live here, as they do on the server:
// option 0, the number 10 (GB) and the text "kv cache" are always right.

const base = (n: number) => ({
  id: `5.2-q${n}`,
  sectionNumber: '5.2',
  subsectionNumber: '5.2.1',
  difficulty: 1 as const,
  hasHint: true,
});

const questions: PublicQuestion[] = [
  ...[1, 2, 3, 4].map((n) => ({
    ...base(n),
    kind: 'scenario_mc' as const,
    prompt: `Toy scenario ${n}: which lever helps?`,
    answerFormat: 'one option',
    options: [`Right lever ${n}`, `Wrong lever a${n}`, `Wrong lever b${n}`, `Wrong lever c${n}`],
  })),
  ...[5, 6, 7].map((n) => ({
    ...base(n),
    kind: 'calculation' as const,
    prompt: `Toy sum ${n}: how much memory?`,
    answerFormat: 'number, in GB',
    unit: 'GB',
    units: ['GB', 'MB'],
    tolerance: { kind: 'relative' as const, value: 0.05 },
  })),
  ...[8, 9, 10].map((n) => ({
    ...base(n),
    kind: 'text' as const,
    prompt: `Toy term ${n}: what stores past keys?`,
    answerFormat: '** *****',
  })),
];

function grade(question: PublicQuestion, answer: AnswerInput): boolean {
  if (answer.kind === 'scenario_mc') return answer.choice === 0;
  if (answer.kind === 'calculation') {
    const value = answer.unit === 'MB' ? answer.value / 1000 : answer.value;
    return question.kind === 'calculation' && Math.abs(value - 10) <= 0.5;
  }
  return answer.text.trim().toLowerCase() === 'kv cache';
}

const keyOf = (question: PublicQuestion): AnswerInput =>
  question.kind === 'scenario_mc'
    ? { kind: 'scenario_mc', choice: 0 }
    : question.kind === 'calculation'
      ? { kind: 'calculation', value: 10, unit: 'GB' }
      : { kind: 'text', text: 'kv cache' };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function createFakeCheckpoint() {
  let attempt: AttemptResponse | null = null;
  const finished: AttemptResponse[] = [];
  const exercise: ExerciseResponse = {
    exercise: {
      id: '5.2-toy-speedup',
      sectionNumber: '5.2',
      title: 'Work out a toy speedup',
      brief: 'A pass takes **25 ms**. Work out tokens per second.',
      steps: ['Count tokens per pass.', 'Divide by the pass time.'],
      answerFormat: 'number, in tokens/s',
      answerKind: 'calculation',
      units: ['tokens/s'],
      starterFiles: ['speedup.py'],
      tests: { runner: 'pytest', command: 'python -m pytest -q', files: ['test_speedup.py'] },
      estimatedMinutes: 10,
    },
    section: { id: '5.2', title: 'Speculative Decoding' },
    status: 'new',
    tries: 0,
    feedback: null,
    lastAnswer: null,
    revealed: false,
    solution: null,
  };
  const solution = {
    walkthrough: 'Three tokens per 25 ms pass is **120 tokens/s**.',
    finalAnswer: { kind: 'calculation' as const, value: 120, unit: 'tokens/s' },
    files: ['solution/speedup.py'],
  };

  const recount = (state: AttemptResponse) => {
    const firstTryAccepted = state.questions.filter((q) => q.firstTry === 'accepted').length;
    const done = state.questions.every((q) => q.status !== 'open');
    state.attempt = {
      ...state.attempt,
      firstTryAccepted,
      acceptance: firstTryAccepted / state.questions.length,
      hints: state.questions.filter((q) => q.usedHint).length,
    };
    if (done && !state.attempt.completedAt) {
      state.attempt.completedAt = new Date().toISOString();
      state.attempt.passed = firstTryAccepted >= CHECKPOINT_PASS;
      finished.unshift(structuredClone(state));
      attempt = null;
    }
    return state;
  };

  const close = (entry: AttemptQuestion) => {
    entry.solution = keyOf(entry.question);
    entry.explanation = `Why ${entry.question.id} works that way.`;
    entry.reread = '5.2.1';
  };

  const sectionResponse = (): CheckpointSectionResponse => ({
    section: { number: '5.2', title: 'Speculative Decoding', chapterNumber: 5 },
    bankSize: 29,
    openAttemptId: attempt?.attempt.id ?? null,
    attempts: finished.map((state) => state.attempt),
    project: null,
  });

  /** Handles checkpoint and exercise routes; returns null for anything else. */
  function handle(path: string, method: string, body: Record<string, unknown> | undefined) {
    if (path === '/api/checkpoints') {
      const response: CheckpointsResponse = {
        sections: [
          {
            number: '5.2',
            title: 'Speculative Decoding',
            chapterNumber: 5,
            chapterTitle: 'Techniques',
            openAttemptId: attempt?.attempt.id ?? null,
            attempts: finished.length,
            best: finished.length ? Math.max(...finished.map((s) => s.attempt.acceptance)) : null,
            latest: finished[0]?.attempt ?? null,
            passed: finished.some((s) => s.attempt.passed),
          },
        ],
        recall: [
          {
            lessonId: '1.1',
            title: 'Cost',
            confidence: 'solid',
            ratedAt: '2026-10-01T09:00:00.000Z',
          },
        ],
      };
      return json(200, response);
    }
    if (path === '/api/checkpoints/5.2') return json(200, sectionResponse());
    if (path === '/api/checkpoints/5.2/attempts' && method === 'POST') {
      if (attempt) return json(200, attempt);
      attempt = {
        attempt: {
          id: `attempt-${finished.length + 1}`,
          kind: 'solo',
          sectionNumber: '5.2',
          startedAt: new Date().toISOString(),
          completedAt: null,
          firstTryAccepted: 0,
          acceptance: 0,
          hints: 0,
          passed: null,
        },
        section: { number: '5.2', title: 'Speculative Decoding', chapterNumber: 5 },
        questions: questions.map((question) => ({
          question,
          status: 'open',
          tries: 0,
          firstTry: null,
          usedHint: false,
          hint: null,
          feedback: null,
          lastAnswer: null,
          explanation: null,
          workedSolution: null,
          solution: null,
          reread: null,
        })),
        project: null,
        next: { id: '5.3', title: 'Disaggregation' },
      };
      return json(201, attempt);
    }

    const attemptRoute = /^\/api\/attempts\/([^/]+)(\/.*)?$/.exec(path);
    if (attemptRoute) {
      const state =
        attempt?.attempt.id === attemptRoute[1]
          ? attempt
          : finished.find((s) => s.attempt.id === attemptRoute[1]);
      if (!state) return json(404, { error: 'not_found' });
      const rest = attemptRoute[2] ?? '';
      if (!rest) return json(200, state);
      if (rest === '/answers') {
        const entry = state.questions.find((q) => q.question.id === body?.questionId)!;
        const accepted = grade(entry.question, body!.answer as AnswerInput);
        entry.tries++;
        entry.firstTry ??= accepted ? 'accepted' : 'missed';
        entry.lastAnswer = body!.answer as AnswerInput;
        entry.feedback = accepted ? 'Accepted.' : 'Not within reach. Check the method.';
        if (accepted) entry.status = 'accepted';
        else if (entry.tries >= MAX_TRIES) entry.status = 'missed';
        if (entry.status !== 'open') close(entry);
        const result = { questionId: entry.question.id, accepted, feedback: entry.feedback };
        return json(200, { result, state: recount(state) });
      }
      const hint = /^\/questions\/([^/]+)\/hint$/.exec(rest);
      if (hint) {
        const entry = state.questions.find((q) => q.question.id === hint[1])!;
        entry.usedHint = true;
        entry.hint = `Think about the toy lever for ${entry.question.id}.`;
        return json(200, recount(state));
      }
      if (rest === '/finish') {
        for (const entry of state.questions) {
          if (entry.status === 'open') {
            entry.status = 'missed';
            close(entry);
          }
        }
        return json(200, recount(state));
      }
    }

    if (path === `/api/exercises/${exercise.exercise.id}`) return json(200, exercise);
    if (path === `/api/exercises/${exercise.exercise.id}/answers`) {
      const answer = body!.answer as AnswerInput;
      const accepted = answer.kind === 'calculation' && Math.abs(answer.value - 120) <= 1;
      exercise.tries++;
      exercise.lastAnswer = answer;
      exercise.status = accepted || exercise.status === 'accepted' ? 'accepted' : 'tried';
      exercise.feedback = accepted ? 'Accepted: 120 tokens/s.' : 'Not within tolerance.';
      if (exercise.status === 'accepted') exercise.solution = solution;
      return json(200, { result: { accepted, feedback: exercise.feedback }, state: exercise });
    }
    if (path === `/api/exercises/${exercise.exercise.id}/reveal`) {
      exercise.revealed = true;
      exercise.solution = solution;
      return json(200, exercise);
    }
    return null;
  }

  return { handle, exercise: () => exercise, current: () => attempt, finished };
}
