# Build prompts

Run in order. Committed with the rest of the repo since 2 November 2026.

Restored on 2 November 2026. The original file was lost; prompts 1 and 2 survived word for word.
Prompts 3 to 17 were rewritten the same day for the content model in CLAUDE.md: everything is authored
during development, and the only runtime AI is the project critique.

Every prompt ends the same way: `pnpm lint && pnpm typecheck && pnpm test` pass, then commit to `main`
and push (CLAUDE.md rules 10 and 11). Update the status table when a prompt is done.

| # | Prompt | Status |
|---|---|---|
| 1 | Monorepo setup | done (1749544, f7b09d0) |
| 2 | App shell and UI primitives | done (bfc6875; React 19 upgrade 0f49c18) |
| 3 | Content schemas, grading and validation | |
| 4 | Book ingestion and the outline | |
| 5 | Database, accounts and sessions | |
| 6 | Content API | |
| 7 | Author a chapter (template; pilot: Preface, Chapter 0, Chapter 1 and section 5.2) | |
| 8 | Lesson page | |
| 9 | Checkpoints and exercises | |
| 10 | Home, Progress, uptime and the recall queue | |
| 11 | Glossary and search | |
| 12 | Pod: standings, duels, teach-backs and shared notes | |
| 13 | Runner sandbox | |
| 14 | Projects: specs, submission and checks | |
| 15 | Critiques | |
| 16 | Author the remaining chapters (repeat prompt 7) | |
| 17 | Deploy, backups and the admin CLI | |

---

## Prompt 1 — Monorepo setup (done)

Read CLAUDE.md. Set up the monorepo it describes and nothing more.

1. pnpm workspace with apps/web (Vite + React + TS), apps/api (Express + TS + Prisma), apps/runner (TS, empty service with a health route), packages/shared (zod + types), scripts/ (tsx).
2. Root scripts: dev (web + api concurrently), build, lint (eslint + prettier), typecheck, test (vitest), db:migrate, db:seed, content:ingest, content:digests, content:checkpoints.
3. docker-compose.yml with postgres:16 (volume, healthcheck) and the runner service (built from apps/runner/Dockerfile, CPU only, `network_mode: none` for job containers is handled later; the service itself needs the Docker socket).
4. .env.example with: DATABASE_URL, SESSION_SECRET, LLM_PROVIDER (anthropic | openai-compatible), LLM_API_KEY, LLM_BASE_URL (openai-compatible only), LLM_MODEL, INVITE_CODE_1, INVITE_CODE_2, APP_URL, TZ=Africa/Lagos.
5. .gitignore: node_modules, dist, .env*, content/book/, content/figures/, uploads/, runner-jobs/, backups/. Nothing else.
5b. Tooling stays invisible (see CLAUDE.md "Keep the tooling invisible"): append `CLAUDE.md`, `docs/BUILD_PROMPTS.md`, `.claude/`, `design/` to `.git/info/exclude` (never to .gitignore); write `.claude/settings.json` with `{"includeCoAuthoredBy": false}`; confirm with `git status` that none of those paths show as untracked.

> Note (2 Nov 2026): superseded. These files are now committed; see CLAUDE.md "What goes in git".

5c. packages/llm: a provider interface `complete({system, messages, schema, temperature, maxTokens})` returning zod-validated JSON, with two implementations selected by LLM_PROVIDER: `anthropic` and `openai-compatible` (works with any OpenAI-style /chat/completions endpoint). Both log tokens and cost. Nothing outside packages/llm imports a vendor SDK.
6. README.md with setup steps (clone, pnpm i, docker compose up -d, pnpm db:migrate, pnpm content:ingest, pnpm dev).
7. docs/ARCHITECTURE.md: one page describing the four apps and how a request flows. docs/DECISIONS.md: a dated log; add the first entry (stack choice).
8. GitHub Actions: lint + typecheck + test on push.

Done when: `pnpm i && docker compose up -d && pnpm dev` serves a "Forward Pass" placeholder page at the web URL and `GET /api/health` returns `{ok:true}`; CI is green on a clean clone.

> Note (2 Nov 2026): `content:digests` and `content:checkpoints` were replaced by `content:validate` under the new content model.

---

## Prompt 2 — App shell and UI primitives (done)

Read CLAUDE.md, especially the design tokens and vocabulary. Study the screenshots in design/ (Home and Foundations first).

Build the app shell in apps/web:
1. tokens.css with every token in CLAUDE.md as CSS variables, plus a dark-mode set for reading (same hues, paper becomes #0F1F17-based) behind `[data-theme="dark"]`. Load Bricolage Grotesque and JetBrains Mono from Google Fonts with proper fallbacks.
2. Layout: a 264px dark sidebar (logo, Home / The Book / Checkpoints / Projects / Progress / Glossary, pod card, uptime card) that collapses to a 76px icon rail on the Lesson and Checkpoint routes and to a top bar below 900px. Content area on paper.
3. Primitive components in apps/web/src/ui: Button (primary-on-paper, primary-on-dark with the nested arrow circle, ghost, secondary), Chip (status variants from the Foundations board), ProgressBar (continuous and segmented), StatTile, Card, Eyebrow, ConfidencePills, AnswerOption (idle / accepted / rejected), Textarea, Input, Toggle. Each gets a story-style demo route at /dev/ui (dev only).
4. Routes with placeholder pages: /, /book, /book/:sectionId, /checkpoint/:sectionId, /projects, /projects/:slug, /progress, /glossary, /login.
5. Icons as inline SVG components (stroke 1.6). No icon library.

Rules: CSS Modules, no Tailwind, no emoji, real <button>/<a>/<input>, visible focus rings, 44px targets. Keep the lime on dark surfaces only.

Done when: /dev/ui renders every primitive in every state, the shell renders at 1440, 1024 and 390 widths without horizontal scroll, and axe-core (vitest + jsdom) reports no violations on the shell.

---

## Prompt 3 — Content schemas, grading and validation

Read CLAUDE.md, especially "Content model". Define how authored content is shaped and graded, before any of it is written.

1. In packages/shared, zod schemas and types for:
   - `Chapter` (number, slug, title, summary, section ids, project slug or none) and `Section` (id like `5.2`, title,
     chapter, estimated minutes, subsections, prerequisites, terms introduced).
   - Section notes: one Markdown file per section with front matter (id, title, minutes, terms). Allowed blocks beyond
     plain Markdown, written as fenced blocks: `oneline` (the "in one line" summary), `worked-example`, `callout`,
     `check-yourself` (an inline question by id), `figure-ref` (points at a book figure; never embeds it).
   - `Question` as a discriminated union: `single` (options + key), `multi` (options + set of keys), `numeric`
     (value, tolerance absolute or relative, unit, accepted units with conversion), `text` (accepted answers,
     normalisation rules). Every question has: id, section, kind (scenario / calculation / concept), prompt,
     answer format hint shown to the learner (e.g. `number, in ms` or `*******`), up to 2 hints, explanation,
     re-read reference (section or subsection id), difficulty 1–3.
   - `CheckpointBank`: section id plus ≥ 20 questions, with at least 4 calculation and 4 scenario questions.
   - `Exercise`: id, section, title, brief, steps, answer (reuses the Question answer types), solution walkthrough,
     optional starter files and tests the learner runs locally (`pytest` or `vitest`), estimated minutes.
2. Pure grading functions in packages/shared: `grade(question, answer) -> { accepted, normalised, feedback }`.
   Numeric grading converts units before applying tolerance. Text grading trims, folds case and whitespace, strips
   trailing punctuation, and matches any accepted variant. Unit tests with fixtures for every answer type, including
   edge cases (wrong unit, near-miss tolerance, empty answer).
3. A `PublicQuestion` type and `toPublic()` that strips keys, accepted answers and explanations. Answer keys never
   leave the server; add a test that fails if any key field survives `toPublic()`.
4. `scripts/validate-content.ts` (`pnpm content:validate`): loads `content/chapters/**`, validates every file
   against the schemas, and checks cross-references (every re-read reference and `check-yourself` id exists, every
   bank has ≥ 20 questions, ids are unique, every exercise's answer passes its own grader against its solution).
   Prints a readable report and exits non-zero on any error. Run it in CI after the tests.
5. One small fixture chapter under `scripts/fixtures/` that exercises every block and answer type; the validator's
   tests run against it.

Done when: grading has full unit coverage of the answer types, `pnpm content:validate` passes on the fixture and
fails with clear messages on broken copies of it, and CI runs the validator.

---

## Prompt 4 — Book ingestion and the outline

Read CLAUDE.md, Hard rule 1.

1. `pnpm content:ingest` fetches `https://www.baseten.co/inference-engineering/llms.txt`, follows the links it lists,
   and writes the book as one Markdown file per section to `content/book/` plus figures to `content/figures/`
   (both gitignored). Idempotent: unchanged files are skipped; `content/book/manifest.json` records source URLs,
   fetch times and content hashes.
2. From the fetched book, write the committed outline `content/outline.json`: Preface, Chapter 0 and the other
   chapters with section ids, titles and subsection titles only (no body text). Validate it against the Chapter and
   Section schemas from prompt 3. If the real structure differs from "42 sections, eight chapters, seven projects",
   stop and report the actual numbers before changing any constant.
3. A small server-side loader that reads a section's book text by id, used later by authoring and critiques. Clear
   error when the book has not been ingested yet.
4. Tests run against saved fixture responses, not the live site.

Done when: a clean clone can run `pnpm content:ingest` and get the whole book locally, `content/outline.json` is
committed and valid, and `git status` shows no book text staged.

---

## Prompt 5 — Database, accounts and sessions

Read CLAUDE.md, Hard rule 6 and the vocabulary.

1. Prisma models: `User` (username, display name, password hash, colour lime or butter, timezone), `Session`,
   `SectionProgress` (read state, reading seconds, last position), `Attempt` (question or exercise id, answer,
   accepted, first try, hints used, checkpoint run id), `CheckpointRun` (section, drawn question ids, started,
   finished, score), `ConfidenceRating`, `StudyDay`, `Note` (section, body, shared with the pod or private),
   `Duel`, `TeachBack`, `ProjectSubmission`, `Critique`, `LlmCall` (the cost log). Content stays in files,
   referenced by id; the database never stores notes or questions.
2. Registration with `INVITE_CODE_1` / `INVITE_CODE_2`: each code creates exactly one account, then stops working.
   Login, logout, `GET /api/me`. Passwords hashed with argon2id. Sessions stored in Postgres, sent as httpOnly,
   SameSite=Lax cookies (Secure in production). Rate-limit login.
3. Wire the `/login` page from prompt 2 to the API, add a first-run "Create your account" form that takes the invite
   code, and protect every other route (redirect to `/login`). The shell's pod card and avatars use the real users.
4. Integration tests against a separate test database (`DATABASE_URL_TEST`), including: a third registration fails,
   a used code fails, a wrong password fails, a protected route without a session returns 401.
5. CI: add a Postgres 16 service to the GitHub Actions job so the integration tests run on every push.

Done when: both seats can be created once, login and logout work in the browser, and CI runs the integration tests
against Postgres.

---

## Prompt 6 — Content API

1. On start, the API loads `content/outline.json` and `content/chapters/**`, validates them with the prompt 3 schemas,
   and refuses to start on invalid content (clear error naming the file).
2. Endpoints: `GET /api/book` (outline with the learner's read state, confidence and checkpoint score per section),
   `GET /api/sections/:id` (rendered notes as structured blocks, terms, previous and next, public exercises and
   check-yourself questions, the learner's notes), `POST /api/sections/:id/progress` (reading position and seconds,
   capped so an idle tab can't farm uptime).
3. Markdown is rendered server side to a typed block list that the web app renders with its own components; no raw
   HTML from content reaches the browser.
4. `pnpm db:seed` creates realistic local data (both users, some progress, some attempts) and refuses to run against
   a production database.
5. Integration tests for every endpoint, including one that fails if any answer key appears in a response body.

Done when: the endpoints serve the fixture chapter (and any authored chapters) with progress, and the key-leak test
passes.

---

## Prompt 7 — Author a chapter (template; run once per chapter)

Run with: "Run prompt 7 for <chapter or sections>". Pilot run: Preface, Chapter 0, Chapter 1, and section 5.2 (the
section the Lesson board shows). Review the pilot before running prompt 16.

Read CLAUDE.md ("Content model", "Copyright stance"), the prompt 3 schemas, and the chapter's book text in
`content/book/`.

For every section in scope, write under `content/chapters/<nn>-<slug>/`:

1. **Notes** (`sections/<id>.md`): a one-line summary, then the section explained for a working engineer in
   400–900 words: the mechanism, why it matters, the numbers that matter, and how it connects to earlier sections.
   At least one worked example with real arithmetic, and one or two `check-yourself` questions placed where the idea
   lands. Terms introduced go in front matter with one-sentence definitions (they feed the glossary). Cite
   subsections ("see 5.2.1"); quotes stay short.
2. **Checkpoint bank** (`checkpoints/<id>.json`): 20–30 questions covering every subsection. At least 4 calculation
   questions with numeric answers and units, at least 4 scenario questions ("your p99 TTFT doubled after ..."), the
   rest concept checks. Every question gets an answer format hint, up to 2 hints that teach rather than give the
   answer away, an explanation of why the right answer is right and why the tempting wrong one is wrong, and a
   re-read reference. No trick wording; distractors are mistakes a real engineer makes.
3. **Exercises** (`exercises/<id>/`): 1–3 per section where hands-on work helps (estimating memory, computing
   throughput, reading a benchmark, writing a tiny script). Each has a brief, steps, an answer the app can check,
   a full solution walkthrough, and, when it involves code, starter files plus tests the learner can run locally on
   a CPU.
4. Update `chapter.json` and run `pnpm content:validate` until clean. Then work every numeric answer out again from
   scratch, independently of the first pass, and fix any disagreement.
5. Report: sections done, question and exercise counts per section, and any place where the book was ambiguous or
   where a question was hard to make checkable (those become candidates for the chapter's project instead).

Done when: the validator passes, every numeric answer was double-checked, and the report is in the commit message
body.

---

## Prompt 8 — Lesson page

Read CLAUDE.md and study `design/02 Lesson · 5.2 Speculative Decoding.jpg`.

1. `/book/:sectionId` as on the board: the rail sidebar, a chapter outline column (sections with read state and
   checkpoint score, subsections, the locked project at the end), the reading column, and a right column with
   "On this page", "Terms on this page", "Your notes" (autosave, private or shared with the pod) and the partner's
   latest note or rating.
2. Components for every notes block: the in-one-line panel (dark), numbered "moves" cards, levers, the worked example
   (dark, with its arithmetic table), callout, figure reference (links to the book's online figure), and inline
   check-yourself questions using `AnswerOption` and the prompt 3 grader through the API (they count toward the
   acceptance rate).
3. Footer: confidence rating (`ConfidencePills`) and the "Take the <id> checkpoint" button. Reading time posts to the
   progress endpoint while the page is visible and the learner is active.
4. `/book` table of contents: chapters as the pipeline from the Home board, with sections, read state and scores.
5. Accessible: headings in order, the outline is a nav with `aria-current`, keyboard works end to end, axe clean, no
   horizontal scroll at 1440, 1024 and 390.

Done when: section 5.2 renders from authored content and matches the board, and every pilot section renders.

---

## Prompt 9 — Checkpoints and exercises

The Checkpoint board was lost; extend the Foundations language (answer states, segmented progress, chips) and the
Lesson page's layout.

1. API: `POST /api/checkpoints/:sectionId/runs` draws 10 questions from the bank (avoiding the learner's last run
   where the bank allows; at least 2 calculation and 2 scenario). `POST .../answers` grades one answer with the
   prompt 3 grader, logs first try and hints, and returns accepted or not with feedback; the explanation comes back
   after acceptance or a third miss. `POST .../hints` reveals the next hint and logs it. Finishing computes the score.
2. `/checkpoint/:sectionId`: one question at a time with its answer format hint, segmented progress across ten, the
   retry state in cream with the re-read link, hints behind a button, and a results screen with per-question review,
   this run's acceptance, and links back to the sections to re-read.
3. Exercises on the lesson page and at `/book/:sectionId/exercises/:id`: brief, steps, starter file download, answer
   box checked by the grader, solution walkthrough unlocked after acceptance or on request (logged as a reveal), and
   the command to run the local tests.
4. `/checkpoints`: history by section, open runs, and the recall queue (from prompt 10) once it exists.
5. Integration tests for the run lifecycle, and a test that answers and explanations never appear in a response
   before they should.

Done when: a full checkpoint can be taken on a pilot section with correct grading, hints and retries are logged, and
the acceptance rate updates.

---

## Prompt 10 — Home, Progress, uptime and the recall queue

Read the vocabulary in CLAUDE.md and study `design/01 Home · Dashboard.jpg`. The Progress board was lost; build it
from the same parts.

1. Server-side stats: decode progress (sections read / 42), acceptance rate (first-try accepted / submitted),
   projects shipped, time this week against a 5 h goal, uptime (consecutive study days in Africa/Lagos; a study day
   is any graded activity or ≥ 10 min reading), the recall queue (solid ≥ 21 days ago, okay ≥ 10 days ago) and shaky
   concepts. Unit tests for uptime across midnight, timezone edges and gaps, and for the recall rules.
2. Home as on the board: greeting with the date, the "Continue decoding" hero, four stat tiles, the book as a
   pipeline, pod standings, the next project, and shaky concepts with review links. The sidebar's uptime card shows
   the real streak.
3. `/progress`: decode progress over time, acceptance by chapter, confidence by section (a heat strip), checkpoint
   history, portfolio (projects marked public), and the recall queue.

Done when: Home and Progress show real numbers from seeded data and Home matches the board.

---

## Prompt 11 — Glossary and search

1. Build the glossary from the terms in the notes' front matter: `/glossary` with A–Z, each term's definition, the
   section that introduces it, and every section that uses it.
2. Search (`Ctrl+K` / `⌘K` and the search field from the Home board) across sections, terms and question topics,
   using an index generated from authored content at build time. No external search service.
3. Accessible combobox pattern, keyboard first.

Done when: every term in the pilot chapters is in the glossary, and search finds sections and terms from any page.

---

## Prompt 12 — Pod: standings, duels, teach-backs and shared notes

Read the Pod and Duel entries in CLAUDE.md.

1. Standings on Home and Progress: decoded, acceptance, projects and uptime for both learners. A partner activity
   feed (read a section, passed a checkpoint, shipped a project). Notes stay private unless shared.
2. Duels: either learner challenges on a section; both take a fresh checkpoint run alone within 48 hours; higher
   first-try acceptance wins and fewer hints breaks ties; the loser records a teach-back (text, or up to 3 minutes of
   audio stored in `uploads/`) on the questions they missed; the winner can react. Expired duels close
   automatically.
3. Shared notes appear in the lesson page's right column for the partner.
4. Tests for duel resolution, ties, expiry and the 48-hour window.

Done when: a full duel runs between the two seeded users, including the teach-back.

---

## Prompt 13 — Runner sandbox

Read CLAUDE.md, Hard rule 5.

1. The runner accepts a job from the API (repo URL or uploaded archive, plus the project slug), fetches it into
   `runner-jobs/`, and runs the project's checks and tests in a fresh container: CPU only, `--network none` once
   dependencies are installed from a pinned image, memory and CPU limits, read-only root, hard timeout, non-root user.
2. It streams logs back to the API and returns exit codes, the collected `results.json`, and structured test
   results, then removes the container and the job folder.
3. Base images for Python and Node with common inference tooling at CPU versions, built once and pinned by digest.
4. Tests with tiny fixture projects: one that passes, one that fails, one that times out, and one that tries to reach
   the network.

Done when: the four fixture jobs behave as expected, and nothing a job does can reach the network or the host.

---

## Prompt 14 — Projects: specs, submission and checks

The Project board was lost; extend the Foundations language and the Home board's "Next project" card.

1. Author the seven project specs under `content/projects/<nn>-<slug>/`: brief, learning goals tied to sections,
   rubric dimensions with level descriptors, the `results.json` schema, the checks and tests the runner executes,
   the `--dry-run` requirement for anything that needs a GPU, and an estimated time. Each project unlocks after its
   chapter's checkpoints.
2. `/projects` and `/projects/:slug`: brief, rubric, unlock state, submission (repo URL plus optional files), run
   status with live logs, check and test results, and later the critique.
3. Validate `results.json` against the project schema; README claims get cross-checked in prompt 15.

Done when: a fixture submission runs end to end through the runner and shows its check results.

---

## Prompt 15 — Critiques

Read CLAUDE.md Hard rules 3, 4 and 7. This is the only runtime model call.

1. The critique schema in packages/shared: per-dimension scores with the rubric level, "What is right", "What is
   wrong", "Work on", inline comments with `file:line`, claims checked against evidence, cited sections, and a
   portfolio-ready flag.
2. `critique(submission)` builds the prompt from the rubric, the relevant book sections (from `content/book/`), the
   runner output, test results, `results.json` and the repo's key files. It calls `packages/llm` with
   `LLM_PROVIDER=anthropic`, `temperature: 0` where the model accepts it, a token budget and the critique schema;
   retries once on schema failure; and logs tokens and cost to `LlmCall`. Unsupported README claims go under
   "What is wrong".
3. The critique view on the project page: dark verdict panel, scores, the three lists, inline comments grouped by
   file, and "Request re-critique" after a new submission (rate-limited, with the cost shown).
4. Unit tests with a fake provider and fixture submissions; one manual end-to-end run against the real API, with its
   cost reported.

Done when: a fixture submission gets a schema-valid critique that cites sections and flags an unsupported claim, and
its cost is logged.

---

## Prompt 16 — Author the remaining chapters

Run prompt 7 for each remaining chapter in book order, one chapter per commit, applying whatever the pilot review
changed. After each chapter, open its lesson pages and one checkpoint in the browser to confirm they render.

Done when: all 42 sections, Chapter 0 and the Preface have notes, banks of ≥ 20 questions and exercises, and
`pnpm content:validate` passes on the whole book.

---

## Prompt 17 — Deploy, backups and the admin CLI

1. A production setup for two users on one small server: Docker Compose with the web build served by the API (or a
   reverse proxy), Postgres, the runner, HTTPS, and secrets from the server's environment only.
2. Nightly `pg_dump` to `backups/` with rotation, and a tested restore script.
3. Admin CLI (`pnpm admin`): reset a password, revoke sessions, re-issue an invite code, show LLM spend by month.
4. A short `docs/DEPLOY.md` written in the first person.

Done when: a fresh server can be brought up from the docs, a backup restores into a scratch database, and the admin
CLI resets a password.
