import { describe, expect, it } from 'vitest';
import { answerCues } from './lib/content-validator';
import { balancePositions, balanceSingle } from './lib/balance-options';

const question = (id: string, correct = 'right answer here') => ({
  id,
  kind: 'scenario_mc',
  options: [correct, 'wrong one first', 'wrong one second', 'wrong one third'],
  correctIndex: 0,
});

const bank = (count: number) =>
  Array.from({ length: count }, (_, i) => question(`9.9-mc-${i + 1}`));

describe('balancePositions', () => {
  it('spreads correct answers evenly over A–D', () => {
    const questions = bank(12);
    balancePositions(questions);
    const counts = [0, 0, 0, 0];
    for (const q of questions) counts[q.correctIndex]!++;
    expect(counts).toEqual([3, 3, 3, 3]);
  });

  it('keeps every question answerable: the correct text moves with its index', () => {
    const questions = bank(10);
    balancePositions(questions);
    for (const q of questions) {
      expect(q.options[q.correctIndex]).toBe('right answer here');
      expect(new Set(q.options).size).toBe(4);
    }
  });

  it('keeps the wrong options in their original relative order', () => {
    const [q] = bank(1);
    balancePositions([q!]);
    expect(q!.options.filter((option) => option !== 'right answer here')).toEqual([
      'wrong one first',
      'wrong one second',
      'wrong one third',
    ]);
  });

  it('is idempotent and deterministic', () => {
    const first = bank(9);
    balancePositions(first);
    const snapshot = JSON.stringify(first);
    expect(balancePositions(first)).toBe(0);
    expect(JSON.stringify(first)).toBe(snapshot);

    const again = bank(9);
    balancePositions(again);
    expect(JSON.stringify(again)).toBe(snapshot);
  });

  it('does not follow a plain A, B, C, D cycle', () => {
    const questions = bank(16);
    balancePositions(questions);
    const sequence = questions.map((q) => q.correctIndex).join('');
    expect(sequence).not.toBe('0123012301230123');
  });

  it('leaves other question kinds alone', () => {
    const calc = { id: '9.9-calc-1', kind: 'calculation' };
    expect(balancePositions([calc])).toBe(0);
    expect(calc).toEqual({ id: '9.9-calc-1', kind: 'calculation' });
  });

  it('places a lone check question by its id, stably', () => {
    const q = question('9.9-check');
    balanceSingle(q);
    const position = q.correctIndex;
    expect(balanceSingle(q)).toBe(false);
    expect(q.correctIndex).toBe(position);
    expect(q.options[position]).toBe('right answer here');
  });
});

describe('answerCues', () => {
  const asQuestions = (items: ReturnType<typeof question>[]) => items as never;

  it('flags correct answers bunched in one position', () => {
    expect(answerCues(asQuestions(bank(10)))).toEqual([
      expect.stringContaining('10 of 10 correct answers are option A'),
      expect.stringContaining('the correct option is the longest in 10 of 10'),
    ]);
  });

  it('passes a balanced bank with matched option lengths', () => {
    const questions = Array.from({ length: 12 }, (_, i) => ({
      ...question(`9.9-mc-${i + 1}`, 'wrong one fourth'),
    }));
    balancePositions(questions);
    expect(answerCues(asQuestions(questions))).toEqual([]);
  });

  it('ignores banks with too few multiple-choice questions to judge', () => {
    expect(answerCues(asQuestions(bank(5)))).toEqual([]);
  });
});
