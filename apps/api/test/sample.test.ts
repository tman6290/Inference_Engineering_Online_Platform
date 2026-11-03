import { CHECKPOINT_SIZE, type QuestionKind } from '@forward-pass/shared';
import { describe, expect, it } from 'vitest';
import { sampleQuestions } from '../src/checkpoints/sample';

const bankOf = (counts: Record<QuestionKind, number>) =>
  (Object.entries(counts) as [QuestionKind, number][]).flatMap(([kind, count]) =>
    Array.from({ length: count }, (_, index) => ({ id: `${kind}-${index}`, kind })),
  );

const kindsOf = (ids: string[]) => {
  const counts: Record<string, number> = {};
  for (const id of ids) {
    const kind = id.replace(/-\d+$/, '');
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
};

const full = bankOf({ scenario_mc: 10, calculation: 7, text: 7 });

describe('sampleQuestions', () => {
  it('draws 4 scenario_mc, 3 calculation and 3 text, without repeats', () => {
    const ids = sampleQuestions(full, { seed: 'a' });
    expect(ids).toHaveLength(CHECKPOINT_SIZE);
    expect(new Set(ids).size).toBe(CHECKPOINT_SIZE);
    expect(kindsOf(ids)).toEqual({ scenario_mc: 4, calculation: 3, text: 3 });
  });

  it('gives the same draw for the same seed and a different one for another seed', () => {
    expect(sampleQuestions(full, { seed: 'duel-1' })).toEqual(
      sampleQuestions(full, { seed: 'duel-1' }),
    );
    expect(sampleQuestions(full, { seed: 'duel-1' })).not.toEqual(
      sampleQuestions(full, { seed: 'duel-2' }),
    );
  });

  it('leaves out excluded questions while the bank has others', () => {
    const first = sampleQuestions(full, { seed: 'one' });
    const second = sampleQuestions(full, { seed: 'two', exclude: new Set(first) });
    expect(second.filter((id) => first.includes(id))).toEqual([]);
    expect(kindsOf(second)).toEqual({ scenario_mc: 4, calculation: 3, text: 3 });
  });

  it('uses excluded questions only when a kind runs out', () => {
    const exclude = new Set(
      full
        .filter((q) => q.kind === 'text')
        .map((q) => q.id)
        .slice(0, 6),
    );
    const ids = sampleQuestions(full, { seed: 's', exclude });
    // One fresh text question left; the other two text slots go to fresh scenario_mc first.
    expect(kindsOf(ids)).toEqual({ scenario_mc: 6, calculation: 3, text: 1 });
    expect(ids.some((id) => exclude.has(id))).toBe(false);
  });

  it('makes up missing calculation questions with scenario_mc', () => {
    const ids = sampleQuestions(bankOf({ scenario_mc: 17, calculation: 1, text: 7 }), {
      seed: 'x',
    });
    expect(kindsOf(ids)).toEqual({ scenario_mc: 6, calculation: 1, text: 3 });
  });

  it('falls back to excluded questions when everything has been seen', () => {
    const ids = sampleQuestions(full, { seed: 'z', exclude: new Set(full.map((q) => q.id)) });
    expect(ids).toHaveLength(CHECKPOINT_SIZE);
    expect(kindsOf(ids)).toEqual({ scenario_mc: 4, calculation: 3, text: 3 });
  });
});
