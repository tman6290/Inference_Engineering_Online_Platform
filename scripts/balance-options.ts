import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { balancePositions, balanceSingle } from './lib/balance-options';
import { repoRoot } from './lib/env';

// pnpm content:balance [--content <dir>]
// Spreads multiple-choice correct answers evenly across A–D in every checkpoint bank and digest
// check question. Only option order and correctIndex change. Safe to run repeatedly.

const index = process.argv.indexOf('--content');
const contentDir = path.resolve(
  index >= 0 ? process.argv[index + 1]! : path.join(repoRoot, 'content'),
);
const chaptersDir = path.join(contentDir, 'chapters');

const jsonFiles = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => path.join(dir, name))
    : [];

let moved = 0;
let files = 0;
for (const chapter of existsSync(chaptersDir) ? readdirSync(chaptersDir) : []) {
  const dir = path.join(chaptersDir, chapter);
  for (const file of jsonFiles(path.join(dir, 'checkpoints'))) {
    const bank = JSON.parse(readFileSync(file, 'utf8'));
    const count = balancePositions(bank.questions ?? []);
    if (count > 0) {
      writeFileSync(file, `${JSON.stringify(bank, null, 2)}\n`);
      moved += count;
      files++;
    }
  }
  for (const file of jsonFiles(path.join(dir, 'digests'))) {
    const digest = JSON.parse(readFileSync(file, 'utf8'));
    if (digest.checkQuestion && balanceSingle(digest.checkQuestion)) {
      writeFileSync(file, `${JSON.stringify(digest, null, 2)}\n`);
      moved++;
      files++;
    }
  }
}
console.info(
  moved === 0
    ? 'content:balance: every correct answer is already in its balanced position.'
    : `content:balance: moved ${moved} correct answer(s) in ${files} file(s).`,
);
