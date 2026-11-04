# Forward Pass — project context for Claude Code

Read this file before every task. It is the source of truth for scope, stack, and rules.
Build prompts live in `docs/BUILD_PROMPTS.md`; run them in order.

## What this is

A private, two-user web app for studying *Inference Engineering* by Philip Kiely (Baseten Books, 2026).
Two learners (a "pod") read the book section by section, pass checkpoints, build solo projects that get
critiqued against a rubric, and track progress. Not a public product. No signup page, no marketing.

The UI is already designed. Screenshots of the boards live in `design/`.
Home, Lesson and Foundations survive as reduced-resolution JPEGs; Checkpoint, Project and Progress are
missing (see `design/MISSING.txt`). Match what exists and extend its language for the rest. When the design
and these notes disagree, follow these notes and say so in the commit message.

## Content model (decided 2 November 2026)

Like TryHackMe: every chapter ships ready-made. Nothing is generated while a learner uses the app.

- **Authored during development, committed to the repo:** one digest per section (the Lesson page's notes:
  one-liner, summary, mechanism, worked example, key cards, check question, reflect prompt), checkpoint
  banks (≥ 24 questions) with answers and explanations, exercises with solutions and local tests, and
  project specs with their checks. Claude Code writes these in development sessions, chapter by chapter
  (build prompt 05), against the locally ingested book text; they are reviewed and committed like code.
  The Lesson page also shows the ingested book text itself, from the local database, never from git.
- **Graded deterministically, no AI:** every checkpoint and exercise answer has an answer key. Question
  kinds: `scenario_mc` (one of four options), `calculation` (number with tolerance and unit conversion) and
  `text` (exact answer after normalisation of case, whitespace and punctuation, with accepted variants).
  Each question shows its answer format up front (e.g. `*****` or "number, in GB"), the way TryHackMe does,
  and carries an explanation and the subsection to re-read. Open "explain it" prompts are `reflect` blocks
  in the digest: the learner writes, then compares with a model answer; they are never graded.
- **The only runtime AI:** project critiques. They call `packages/llm` with `LLM_PROVIDER=anthropic` and
  the user's Anthropic API key. Runner output and the project's checks run first; the critique reads them.
- **Digests are original writing, not the book.** They explain and cite subsections (e.g. "see 5.2.1");
  quotes stay short. The book text itself never enters git (Hard rule 1).
- Schemas live in `packages/shared` (build prompt 04); `pnpm content:validate` must pass before a commit.

## Stack (fixed)

- Monorepo, pnpm workspaces, TypeScript everywhere, Node 20+.
- `apps/web`: React 19 + Vite + React Router 8 + TanStack Query. CSS Modules with design tokens in `tokens.css`. No Tailwind.
- `apps/api`: Express + Prisma + PostgreSQL 16 + zod for validation. Sessions in httpOnly cookies.
- `apps/runner`: project-check sandbox service (Docker, CPU only, no network, hard timeouts).
- `packages/shared`: zod schemas and TS types shared by web, api, runner, and scripts, including the
  content schemas (chapters, sections, questions, answer keys, exercises).
- `scripts/`: book ingestion, content validation and seeding (run manually, idempotent).
- LLM calls go through `packages/llm` only, server side only, and only for project critiques.
  `LLM_PROVIDER` picks `anthropic` or `openai-compatible`; `LLM_MODEL` names the model. No vendor SDK is
  imported anywhere else, and no model name is hard-coded.
- Docker Compose for Postgres (host port 5433) and the runner. `pnpm dev` starts web + api.

## Design tokens (from the Foundations board)

```
--ink-green: #0D2A1D   (app chrome, verdict panels, worked examples)
--moss:      #163A29   (surfaces on dark)
--deep:      #0A2117   (inset panels on dark)
--line-dark: #1E4532
--forest:    #1B6A44   (primary action on paper; hover #0F4A2E)
--lime:      #C9F25E   (active/progress on DARK only; never on paper)
--paper:     #F3F1E8   (page ground)
--card:      #FBFAF5
--line:      #DCD9CC
--ink:       #0F1F17   (body text)
--mute:      #5B6B61   (secondary text; passes 4.5:1 on paper)
--mint:      #DDF3E6 / text #0F4A2E   (accepted)
--cream:     #FFF6E2 / text #7A4A05   (retry, needs work)
--amber:     #C77B0F   (retry marks, shaky)
--butter:    #F5C864   (study partner colour)
--mute-dark: #9FB3A6   (secondary text on dark)
```
Type: Bricolage Grotesque (display 800, headings 700, body 400 at 17px/1.65) and JetBrains Mono
(eyebrow labels 10–13px, letter-spacing 0.14em, uppercase; numbers; code). Load from Google Fonts.
Radii: 12 / 16 / 20 / 24 / pill. Touch targets ≥ 44px. Icons: inline stroke SVG at 1.6px, no icon font, no emoji.
Paper surfaces for reading; dark surfaces for "the machine talking" (verdicts, worked examples, stats).
The tokens, semantic roles and UI primitives are built: `apps/web/src/styles/tokens.css`, `apps/web/src/ui`,
showcase at `/dev/ui`.

## Product vocabulary (use these words in UI and code)

- **Section**: one numbered book section (1.1, 5.2 …). 36 of them across Chapters 1–7. Chapter 0 has no sections; it and the Preface are lesson pages outside the count.
- **Decode progress**: numbered sections read / 36 (`SECTION_COUNT`; the book itself says 42, but publishes 36).
- **Checkpoint**: 10-question quiz per section (4 scenario_mc, 3 calculation, 3 text) drawn from an authored bank of ≥ 24, graded against answer keys. Pass = ≥ 7 accepted first try.
- **Exercise**: a hands-on task inside a section with a ready-made solution and, where it involves code, tests to run.
- **Acceptance rate**: answers accepted on the first try / answers submitted. Hints and retries are logged, not hidden.
- **Confidence**: learner's own rating per section: shaky / okay / solid.
- **Uptime**: consecutive study days (timezone Africa/Lagos). A study day = any graded activity or ≥ 10 min reading.
- **Recall queue**: spaced-repetition set of sections rated solid ≥ 21 days ago or okay ≥ 10 days ago.
- **Project**: a solo deliverable per chapter (seven total). Submitted as a repo URL plus optional files. Graded by checks + critique.
- **Critique**: structured grading output: per-dimension scores, right / wrong / work on, inline file:line comments, portfolio flag.
  The one feature that calls an LLM at runtime.
- **Pod**: the two users. Standings, duels, shared notes. Nothing in a project is shared work.
- **Duel**: both users take a fresh checkpoint on the same section, alone, within 48 h. Higher first-try acceptance wins;
  fewer hints breaks ties. Loser records a 3-minute teach-back (text or audio) on the questions they missed.

## Hard rules

1. **The book text and figures never enter git.** `content/book/`, `content/figures/`, `uploads/`, `.env*` are gitignored.
   Ingestion fetches from `https://www.baseten.co/inference-engineering/llms.txt` at setup time. The repo is public on GitHub.
   Authored digests are original explanations that cite subsections; never paste or closely paraphrase long passages.
2. Projects are **individual**. No shared submissions, no joint grading. Partners see each other's scores, never the work,
   until a project is portfolio-public.
3. Critiques read the book, not the internet. Every critique prompt includes the relevant section text and must cite sections.
4. The grader never trusts claims. README statements are checked against `results.json` and runner output; unsupported claims
   are called out under "What is wrong".
5. No GPU in the sandbox. Projects that need a GPU ship a `--dry-run` path that runs on CPU with a tiny model so the pipeline
   is proven to execute. Real numbers come from the learner's `results.json`, validated against the project schema.
6. Two seats only. Invite codes in env. No password reset by email; an admin CLI resets passwords.
7. Every LLM call has a zod output schema, `temperature: 0` for grading, a token budget, and a retry on schema failure. Log cost per call.
8. Accessible by default: real buttons and inputs, labels, focus rings, 4.5:1 contrast, keyboard-only works.
9. Tests before "done": API routes get integration tests against a test database; grading logic gets unit tests with fixtures.
   Every authored question bank passes `pnpm content:validate` (schema, answer keys, explanations, section links).
10. Commit messages: `area: what changed` (e.g. `api: checkpoint grading for numeric answers`). One concern per commit.
11. No pull requests while one person works on the repo: commit to `main` and push. CI on push is the gate.

## What goes in git (decided 2 November 2026)

Everything is committed except secrets, so the project can be picked up on any machine from a clone.
This replaces the earlier "keep the tooling invisible" rule.

- **Committed:** code, content, `CLAUDE.md`, `docs/BUILD_PROMPTS.md`, `.claude/settings.json`, `design/`.
- **Never committed:** `.env` and any other secret (API keys, invite codes, passwords), `.claude/settings.local.json`.
  Check `git status` and the staged file list before every commit; if a secret is ever staged, unstage it.
- **Not committed because they are regenerated, not because they are secret:** `node_modules`, `dist`, `uploads/`,
  `runner-jobs/`, `backups/`, and the fetched book in `content/book/` and `content/figures/` (`pnpm content:ingest`
  fetches it again on a new machine).
- No `Co-Authored-By` or other attribution trailers in commits (`.claude/settings.json` sets `"includeCoAuthoredBy": false`).
- README, ARCHITECTURE.md and DECISIONS.md are written in the first person as the project author.
- Commit messages describe the change only: `api: checkpoint grading for numeric answers`.

## Working on another machine

1. Clone `git@github.com:tman6290/Inference_Engineering_Online_Platform.git`, then `corepack enable` (pnpm is pinned
   in `package.json`) and `pnpm i`.
2. `cp .env.example .env` and fill in the secrets: `SESSION_SECRET`, `LLM_API_KEY` (an Anthropic key, for critiques),
   `LLM_MODEL`, both invite codes. `.env` never travels through git; copy values by hand or from a password manager.
3. `docker compose up -d` (Postgres on host port 5433, so a locally installed Postgres on 5432 doesn't clash),
   `pnpm db:migrate`, `pnpm content:ingest`, `pnpm dev`.
4. Machine-specific notes (paths, shims, ports) belong in the Claude Code memory on that machine, not here.

## Copyright stance (decided 2 November 2026)

This is a personal learning platform, so following the book closely is fine and the repo stays public. If it ever
becomes a public service (our own TryHackMe), replace book-derived scenarios, analogies and worked examples with
original ones before launch. Don't re-raise the question otherwise.

## Folder layout

```
apps/web            React app
apps/api            Express API + Prisma schema in apps/api/prisma
apps/runner         sandbox check service
packages/shared     zod schemas, types, constants (incl. content schemas)
packages/llm        provider interface + anthropic / openai-compatible adapters (critiques only)
scripts/            ingest-book.ts, validate-content.ts, seed.ts, admin.ts
content/chapters/   authored digests, checkpoint banks, exercises + solutions (committed)
                    <nn>-<slug>/chapter.json, digests/<section>.json, checkpoints/<section>.json, exercises/<id>/
content/projects/   project specs (committed): <nn>-<slug>/project.json, README.md, checks/
content/outline.json chapter, section and subsection numbers and titles (committed; written by the ingest)
content/book/       fetched book markdown (gitignored; reference for authoring and critiques)
content/figures/    fetched figures (gitignored)
docs/               ARCHITECTURE.md, DECISIONS.md, BUILD_PROMPTS.md
design/             board screenshots
```

## Done means

`pnpm lint && pnpm typecheck && pnpm test` pass, `docker compose up` works from a clean clone with only `.env` filled,
and the README explains setup in under ten steps.

## Build status (updated 4 November 2026)

Prompts 00 to 10 are done (see the status table in docs/BUILD_PROMPTS.md). Prompt 11 is code-complete:

- Done and committed: A (ProjectSpecSchema, seven specs in content/projects, fixture repo
  tests/fixtures/spec-bench-sample, project rows synced at API start and by `pnpm db:seed`;
  demo study history now needs `pnpm db:seed --demo`), B (submissions API, uploads, internal
  runner routes), C (apps/runner: clone, checks, Docker sandbox; `pnpm runner:image` builds
  docker/sandbox), D (critique in apps/api/src/projects/critique.ts and claims.ts), E (web:
  ProjectsPage with seven cards, ProjectPage and CritiquePanel routed; fake project routes in
  apps/web/src/test/fake-projects.ts; ProjectPage.test.tsx renders a mocked critique fully,
  with axe on every view).
- Still open before 11 is marked done:
  1. Browser width checks of /projects and /projects/:slug at 1440, 1024 and 390 px (no
     horizontal scroll). They need the e2e database, so run them on a machine with Docker up.
  2. The one real critique run (prompt 11 "Done when"). It needs LLM_API_KEY, LLM_MODEL and the
     LLM_PRICE_* values in .env, plus RUNNER_TOKEN for the runner (see .env.example). Ask before
     spending the key.
- Browser checks use a throwaway `forwardpass_e2e` database on API 4001 and web
  127.0.0.1:5180 (a different host keeps the real session cookie on localhost untouched).
