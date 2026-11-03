// Spreads scenario_mc correct answers evenly across positions A–D, so the letter gives nothing
// away. Deterministic: the target positions come from a shuffle seeded by the question ids, so a
// second run moves nothing. Only `options` order and `correctIndex` change; wording never does.

interface ChoiceQuestion {
  id: string;
  kind: string;
  options?: string[];
  correctIndex?: number;
}

/** FNV-1a: a small, stable string hash. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/** mulberry32: a seeded pseudo-random generator in [0, 1). */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Moves the correct option to `target`, keeping the wrong options in their existing order. */
function moveCorrect(
  question: Required<Pick<ChoiceQuestion, 'options' | 'correctIndex'>>,
  target: number,
) {
  const correct = question.options[question.correctIndex]!;
  const others = question.options.filter((_, index) => index !== question.correctIndex);
  others.splice(target, 0, correct);
  question.options = others;
  question.correctIndex = target;
}

/**
 * Reorders the options of every scenario_mc question in `questions` (mutating them) so the correct
 * answers are spread evenly over the four positions. Returns how many questions moved.
 */
export function balancePositions(questions: ChoiceQuestion[]): number {
  const choice = questions.filter(
    (question): question is ChoiceQuestion & { options: string[]; correctIndex: number } =>
      question.kind === 'scenario_mc' &&
      Array.isArray(question.options) &&
      question.options.length === 4 &&
      typeof question.correctIndex === 'number',
  );
  if (choice.length === 0) return 0;

  // An even share of each position, then a shuffle seeded by the ids so the order isn't A, B, C, D.
  const targets = choice.map((_, index) => index % 4);
  const next = random(hash(choice.map((question) => question.id).join('|')));
  for (let i = targets.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [targets[i], targets[j]] = [targets[j]!, targets[i]!];
  }

  let moved = 0;
  choice.forEach((question, index) => {
    const target = targets[index]!;
    if (question.correctIndex !== target) {
      moveCorrect(question, target);
      moved++;
    }
  });
  return moved;
}

/** A lone question (a digest's check question) gets a position from its id alone. */
export function balanceSingle(question: ChoiceQuestion): boolean {
  if (question.kind !== 'scenario_mc' || !question.options || question.correctIndex === undefined) {
    return false;
  }
  const target = hash(question.id) % 4;
  if (question.correctIndex === target) return false;
  moveCorrect(question as Required<Pick<ChoiceQuestion, 'options' | 'correctIndex'>>, target);
  return true;
}
