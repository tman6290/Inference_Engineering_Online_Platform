import {
  answerInputSchema,
  CHECKPOINT_PASS,
  MAX_TRIES,
  toPublic,
  type AnswerInput,
  type AttemptQuestion,
  type AttemptSummary,
  type Question,
} from '@forward-pass/shared';
import type { AnswerRow, AttemptRow } from '../db';

// Turns an attempt's stored answers into what the Checkpoint page shows. Keys, explanations and
// worked solutions appear only for closed questions.

/** The text behind "Show a hint". Calculation questions hint at the method. */
export function hintOf(question: Question): string {
  return question.kind === 'calculation' ? question.methodHint : question.hint;
}

/** The key, shaped like an answer so the page can show it in the same inputs. */
export function solutionOf(question: Question): AnswerInput {
  switch (question.kind) {
    case 'scenario_mc':
      return { kind: 'scenario_mc', choice: question.correctIndex };
    case 'calculation':
      return { kind: 'calculation', value: question.answer, unit: question.unit };
    case 'text':
      return { kind: 'text', text: question.acceptedAnswers[0]! };
  }
}

const storedAnswer = (row: AnswerRow): AnswerInput | null => {
  const parsed = answerInputSchema.safeParse(row.answer);
  return parsed.success ? parsed.data : null;
};

export function questionState(
  question: Question,
  answers: AnswerRow[],
  hinted: boolean,
  attemptDone: boolean,
): AttemptQuestion {
  const tries = answers.length;
  const accepted = answers.some((answer) => answer.accepted);
  const status = accepted ? 'accepted' : tries >= MAX_TRIES || attemptDone ? 'missed' : 'open';
  const closed = status !== 'open';
  const last = answers.at(-1);
  const usedHint = hinted || answers.some((answer) => answer.usedHint);
  return {
    question: toPublic(question),
    status,
    tries,
    firstTry: answers[0] ? (answers[0].accepted ? 'accepted' : 'missed') : null,
    usedHint,
    hint: hinted ? hintOf(question) : null,
    feedback: last?.feedback ?? null,
    lastAnswer: last ? storedAnswer(last) : null,
    explanation: closed ? question.explanation : null,
    workedSolution: closed && question.kind === 'calculation' ? question.workedSolution : null,
    solution: closed ? solutionOf(question) : null,
    reread: closed ? question.reread : null,
  };
}

/** Answers grouped by question, oldest first. */
export function answersByQuestion(answers: AnswerRow[]): Map<string, AnswerRow[]> {
  const grouped = new Map<string, AnswerRow[]>();
  const sorted = [...answers].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const answer of sorted) {
    grouped.set(answer.questionId, [...(grouped.get(answer.questionId) ?? []), answer]);
  }
  return grouped;
}

/** A solo checkpoint passes at CHECKPOINT_PASS of 10; a recall attempt at 70% of its questions. */
export function passMark(attempt: Pick<AttemptRow, 'kind' | 'questionIds'>): number {
  return attempt.kind === 'recall' ? Math.ceil(0.7 * attempt.questionIds.length) : CHECKPOINT_PASS;
}

/** First-try acceptances and hinted questions, counted from the answers and hint log. */
export function tally(
  attempt: Pick<AttemptRow, 'questionIds' | 'kind'>,
  answers: AnswerRow[],
  hintedIds: ReadonlySet<string>,
) {
  const grouped = answersByQuestion(answers);
  let firstTryAccepted = 0;
  let hints = 0;
  for (const id of attempt.questionIds) {
    const rows = grouped.get(id) ?? [];
    if (rows[0]?.accepted) firstTryAccepted++;
    if (hintedIds.has(id) || rows.some((row) => row.usedHint)) hints++;
  }
  return { firstTryAccepted, hints, passed: firstTryAccepted >= passMark(attempt) };
}

export function summarize(
  attempt: AttemptRow,
  counts: { firstTryAccepted: number; hints: number },
): AttemptSummary {
  const done = attempt.completedAt !== null;
  const firstTryAccepted = done ? (attempt.firstTryAccepted ?? 0) : counts.firstTryAccepted;
  return {
    id: attempt.id,
    kind: attempt.kind === 'recall' || attempt.kind === 'duel' ? attempt.kind : 'solo',
    sectionNumber: attempt.sectionNumber,
    startedAt: attempt.startedAt.toISOString(),
    completedAt: attempt.completedAt?.toISOString() ?? null,
    firstTryAccepted,
    acceptance: attempt.questionIds.length ? firstTryAccepted / attempt.questionIds.length : 0,
    hints: done ? (attempt.hints ?? 0) : counts.hints,
    passed: done ? (attempt.passed ?? false) : null,
  };
}
