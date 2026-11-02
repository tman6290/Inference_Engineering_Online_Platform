import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './lib/env';

// Checks authored content under content/chapters/ against the shared content schemas:
// every question has an answer key, an explanation and a section link. The schemas arrive with
// the first authored chapter; until then this only reports what is on disk.
const chaptersDir = path.join(repoRoot, 'content', 'chapters');

if (!existsSync(chaptersDir)) {
  console.info('content:validate: no authored chapters yet (content/chapters/ is empty).');
} else {
  const chapters = readdirSync(chaptersDir, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );
  console.info(
    `content:validate: found ${chapters.length} chapter folder(s); schemas not wired yet.`,
  );
}
