// `pnpm db:migrate [--name x]`: Prisma 7's `migrate dev` no longer regenerates the client, so
// run both, passing any arguments to `migrate dev` (a plain `a && b` script would hand them to b).
import { spawnSync } from 'node:child_process';

const run = (args) => {
  const result = spawnSync('prisma', args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(['migrate', 'dev', ...process.argv.slice(2)]);
run(['generate']);
