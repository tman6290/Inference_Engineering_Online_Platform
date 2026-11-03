import { CHECKPOINT_MIX, CHECKPOINT_SIZE, type QuestionKind } from '@forward-pass/shared';

// Draws a checkpoint's questions from a bank. Pure and seeded: the same bank, seed and exclusions
// always give the same draw, which is what lets a duel hand both learners the same questions.

/** 32-bit FNV-1a, to turn a seed string into a PRNG state. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast and good enough for shuffling a few dozen questions. */
export function seededRandom(seed: string): () => number {
  let state = hash(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const KINDS: QuestionKind[] = ['scenario_mc', 'calculation', 'text'];

/**
 * Picks CHECKPOINT_SIZE question ids: 4 scenario_mc, 3 calculation and 3 text. Questions in
 * `exclude` (answered right first try recently, or seen by either duellist) are used only when the
 * bank runs out of others. A kind that falls short is made up with scenario_mc first, then any kind.
 */
export function sampleQuestions(
  bank: readonly { id: string; kind: QuestionKind }[],
  { seed, exclude = new Set<string>() }: { seed: string; exclude?: ReadonlySet<string> },
): string[] {
  const random = seededRandom(seed);
  // Per kind: fresh questions in random order, then excluded ones as a last resort.
  const pools = new Map(
    KINDS.map((kind) => {
      const ofKind = bank.filter((question) => question.kind === kind).map((q) => q.id);
      const fresh = shuffle(
        ofKind.filter((id) => !exclude.has(id)),
        random,
      );
      const stale = shuffle(
        ofKind.filter((id) => exclude.has(id)),
        random,
      );
      return [kind, { fresh, stale }];
    }),
  );
  const picked: string[] = [];
  const take = (kind: QuestionKind, from: 'fresh' | 'stale', count: number) => {
    const pool = pools.get(kind)![from];
    picked.push(...pool.splice(0, Math.max(0, Math.min(count, CHECKPOINT_SIZE - picked.length))));
  };

  for (const from of ['fresh', 'stale'] as const) {
    for (const kind of KINDS) {
      const have = picked.filter((id) => bank.find((q) => q.id === id)?.kind === kind).length;
      take(kind, from, CHECKPOINT_MIX[kind] - have);
    }
    for (const kind of KINDS) take(kind, from, CHECKPOINT_SIZE - picked.length);
  }
  return shuffle(picked, random);
}
