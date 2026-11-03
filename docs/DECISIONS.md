# Decisions

A dated log of choices that shape the project. Newest at the bottom.

## 2026-10-14: Stack

**Decision.** A pnpm workspace in TypeScript throughout: React 18 with Vite, React Router and
TanStack Query for the web app; Express, Prisma and PostgreSQL 16 for the API; zod for every
boundary; Vitest for tests; Docker Compose for Postgres and the check runner.

**Why.**

- One language end to end lets the web app, API, runner and scripts share zod schemas from
  `packages/shared`. A payload gets validated by the same code on both sides.
- Two users don't need a framework with server rendering. A Vite SPA talking to a small Express
  API keeps the moving parts few and the build fast.
- Postgres with Prisma gives typed queries and checked-in migrations. Spaced-repetition and
  streak queries are relational, and Postgres handles them without extra services.
- Workspace packages ship TypeScript source. Vite, tsx and Vitest read it directly, and the API
  and runner bundle it with tsup for production. No per-package build step, no stale `dist`.
- Model access sits behind `packages/llm` with two adapters, `anthropic` and
  `openai-compatible`. I can switch vendors or point at a self-hosted model by changing `.env`.
- pnpm is pinned to the 10.x line through `packageManager`.

**Trade-offs.** Express has no built-in validation or typing of routes, so every route parses its
input with zod by hand. Prisma 7 needs a driver adapter (`@prisma/adapter-pg`) and a
`prisma.config.ts`, which adds a little setup in exchange for a client with no native engine.

## 2026-10-14: React 19 and React Router 8

**Decision.** The web app moves from React 18 to React 19, and from React Router 7 to 8.

**Why.** React 19 is the supported line, and React Router 8 requires it. The app was only a shell
and a set of UI primitives when I switched, so the move cost nothing: no code changes, and every
test and accessibility check passed unchanged. Staying on 18 would have meant a bigger migration
later, once real features depend on it.

**Trade-offs.** The production bundle grows by about 23 kB gzipped (110 kB to 133 kB), mostly from
React DOM 19 and the newer router.

## 2026-11-02: Authored content, AI only for critiques

**Decision.** Every chapter is written ahead of time and committed: section notes, worked
examples, checkpoint banks with answer keys and explanations, exercises with solutions, and
project specs with checks and tests. Checkpoints and exercises are graded in code against their
keys. The only runtime model call is the project critique, through `packages/llm`.

**Why.**

- Studying should never wait on a model or depend on one being up. Ready-made material behaves
  the same for both of us, every time, which matters for duels and for comparing acceptance rates.
- Answer keys make grading cheap, instant and testable. A question either has a defensible key or
  it gets rewritten; that discipline improves the questions.
- Critiques are the one place where judgement on open-ended work earns its cost: a project is a
  repo, a README and numbers, not a single right answer.

**Trade-offs.** Writing 42 sections of notes, banks of 20+ questions and exercises with solutions
is the bulk of the work, and short answers have to be phrased so they have checkable answers
(a number with a unit, a term, a choice). Questions that only a free-form judgement could grade
move into projects instead. The `content:digests` and `content:checkpoints` generation scripts are
replaced by `content:validate`.

## 2026-11-02: Two seats, sessions in Postgres

**Decision.** Each seat is claimed once with its invite code (`INVITE_CODE_1`, `INVITE_CODE_2`).
Claiming writes a row keyed by the seat number, so a code can't be reused, and registration closes
once two users exist, even if a code is re-issued. Passwords use bcrypt at cost 12 (the pure-JS
`bcryptjs`, so installs need no native build). Sessions live in Postgres; the cookie holds a random
token and the table stores its HMAC under `SESSION_SECRET`, so a copy of the table can't be used as
cookies. Cookies are httpOnly and SameSite=Lax, Secure in production, and sessions last 30 days,
extended on use once past half-life. Login and register are limited to 10 attempts per minute per IP.

**Why.** Two people need no OAuth provider, email flow or password reset by mail; an admin CLI
covers lost passwords. Database sessions can be revoked instantly, which signed tokens can't.

**Trade-offs.** Every authenticated request reads the session table. At two users that costs
nothing.

## 2026-11-02: The book in Postgres, 36 sections

**Decision.** `pnpm content:ingest` fetches the published Markdown (`llms.txt` and the files it
lists), saves it as received under `content/book/` and the figures under `content/figures/`, and
loads chapters, sections, subsections, figures and the Appendix A glossary into Postgres. The API
serves section text and figures to signed-in users only. The only committed output is
`content/outline.json`: numbers, slugs and titles, no body text.

Decode progress counts **36** sections, not 42. The book's own overview says 42, but the published
text has 36 numbered sections (Chapter 0 has none). The Preface and Chapter 0 are read like
lessons but sit outside the count.

**Why.** Lessons, critiques and the glossary all need the text, and a database makes section,
figure and term lookups cheap. Keeping it out of git respects the book being Baseten's to
distribute. Re-running the ingest only writes what changed, so it is safe after any update to the
source.

**Trade-offs.** A fresh machine needs network access and about two minutes to ingest before
lessons work. Glossary terms are linked to the section titled with the term, or else to the first
section that uses it; 22 of 213 terms (mostly ones that only appear in the Preface or Chapter 0)
have no section yet.

## 2026-11-03: Content schemas, graders and the validator

**Decision.** Every authored file has a zod schema in `packages/shared`: digests, checkpoint banks,
questions (`scenario_mc`, `calculation`, `text`), exercises and `chapter.json`. The graders sit next
to them as pure functions. `pnpm content:validate` checks every file under `content/chapters/`
against the schemas and `content/outline.json`, and CI runs it after the tests.

A few choices inside that:

- **Lessons, not only sections.** The Preface (`preface`) and Chapter 0 (`0`) get digests too, so
  a digest is keyed by lesson. The Preface lives in `content/chapters/preface/`. Only numbered
  sections have checkpoint banks.
- **The browser sees a whitelist.** `toPublic` builds the public question field by field and its
  schema is strict, so a key field added to a schema later can't leak by accident. Hints, quotes,
  explanations and worked solutions stay on the server until grading or a logged hint request.
- **Units are case-sensitive first.** "Gb" is not "GB". A case-insensitive match is accepted only
  when it's unambiguous; otherwise the grader asks for one of the listed units.
- **Exercises carry their own proof.** Each solution states its final answer, and the validator
  grades it against the exercise's key, so a walkthrough and its key can't drift apart.
- **Book checks need the book.** Figure references, glossary terms, source quotes and a copy check
  (no run of 10 or more words lifted from the section) read `content/book/`. That folder isn't in
  git, so in CI and on a fresh clone those checks are skipped with a note. The structural checks
  always run, and authoring always happens on a machine with the book ingested.
- **A masked answer format is checked.** When a text question's `answerFormat` is a mask like
  `****-**`, it must match the shape of the first accepted answer.

**Why.** Answer keys are only as good as the checks around them. A validator that knows the
outline catches broken rereads, uncovered subsections and duplicate ids before a learner does.

**Trade-offs.** The schemas are strict, so authoring a section means satisfying word limits and
mix rules up front. The copy check works on word runs, not meaning, so close paraphrase still
needs a reviewer's eye.

## 2026-11-03: Multiple choice that can't be passed by guessing

**Decision.** The content validator fails a checkpoint bank when more than half of its correct
answers sit in one position, or when the correct option is strictly the longest (or the
shortest) in more than 40% of its multiple-choice questions. `pnpm content:balance` spreads
correct answers evenly over A–D with a shuffle seeded by the question ids, so it is
deterministic and a second run changes nothing.

**Why.** The first authored banks had every 1.1 answer at A and the correct option longest in
53 of 61 questions. A learner could have scored well by picking the longest answer, which would
make acceptance rates and duels meaningless. Checking it in CI keeps later chapters honest.

**Trade-offs.** Writing distractors as detailed as the right answer takes more effort, and the
length rule is a heuristic: a bank can pass it and still have weak distractors. The authoring
prompt keeps the human-quality bar; the validator only stops the mechanical tells.
