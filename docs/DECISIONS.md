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

## 2026-11-03: One lesson route for the Preface, Chapter 0 and sections

**Decision.** `/book/:id` takes `preface`, `0` or a section number, and `GET /api/lessons/:id`
returns everything the page needs in one response: the book text, figures, the public digest,
glossary terms, my progress, my last check answer, my note and my partner's rating and note.
Digests load from `content/` once at API startup and a bad file stops the server with its path.
A lesson counts as read at 90% scroll or when I rate my confidence. Reading events are written
at most every 30 seconds, plus one `sendBeacon` when the tab hides. The check question reveals
its explanation once accepted or after three tries, and every attempt is stored as an `Answer`
so acceptance rate can be computed later.

**Why.** The Preface and Chapter 0 have digests but no section number, and they belong in the
same reading flow. One response keeps the page to a single request and one loading state. The
`/api/book/sections/:number/digest` route from the prompt exists too, for tools that want only
the digest.

**Trade-offs.** The lesson response is large and changes whenever any part of it does, so the web
patches its cache after each write instead of refetching. Digests need an API restart to show up
after an edit. Wide tables scroll inside their own focusable box on a phone rather than reflowing.

## 2026-11-03: Checkpoint attempts, hints and exercise reveals

**Decision.** An attempt fixes its ten question ids when it starts, drawn by a seeded shuffle:
4 scenario_mc, 3 calculation and 3 text, made up with scenario_mc when a kind runs short.
Questions I answered right on the first try in the last 30 days are left out until the bank runs
dry. I keep one open attempt per section; starting again resumes it. A question closes when
accepted or after three misses, and only then does the API send its explanation, worked solution,
answer key and reread link. The attempt finishes itself once all ten are closed, or early on
request with open questions counted as missed. Hints come from their own endpoint and are logged
in `AttemptHint`, so the page can't hide them. Exercise solutions unlock on acceptance or on a
logged reveal; the API serves an exercise's listed starter, test and solution files and nothing
else. Acceptance rate on `/api/me` is first-try accepted over first tries, across check
questions, checkpoints and exercises.

**Why.** A fixed draw makes an attempt resumable and lets a duel give both of us the same
questions from a shared seed. Holding the key back until a question closes keeps the third try
honest. Logging hints and reveals is what makes acceptance rate worth comparing in the pod.

**Trade-offs.** Project unlocks are worked out from passed attempts (the last section of a
chapter) instead of stored, because project specs arrive in a later prompt. Mastery isn't stored
either; prompt 08 computes it from the latest attempt. The Checkpoint board is lost, so the page
follows this prompt's description and the Lesson board's language, not a design.

## 2026-11-03: Study days, uptime and recall

**Decision.** A `StudyDay` row per learner per Lagos day holds reading minutes, lessons read and
answers graded, plus an intensity from 0 to 3. A day counts as study with one graded answer or
ten minutes of reading. Each reading event counts for at most two hours. The rows rebuild from
the raw tables: in full every night shortly after Lagos midnight, for today and yesterday on every
read of `/api/me`, Home or Progress, and on demand through `POST /api/progress/rebuild` outside
production. Uptime counts consecutive study days ending today or yesterday, and I keep the longest
run on the user, because a rebuild must never shrink a record. Mastery is 0.7 × the latest
checkpoint's acceptance plus 0.3 × the confidence weight; a section without a checkpoint counts
as zero. Recall attempts take three questions from each of the four oldest due sections that have
a bank. When one finishes, every covered section gets a fresh rating, which takes it off the
queue, and two misses in a row drop that rating one level. The recall queue holds numbered
sections only. `pnpm db:seed` writes 60 days of made-up study for two demo accounts and refuses
to run on a database with real accounts.

**Why.** Rebuilding from raw rows means a bug in the rollup can be fixed and replayed. Refreshing
only the last two days on reads keeps Home current without a full rebuild per request. A recall
attempt that settled nothing would leave a section on the queue forever.

**Trade-offs.** Reading minutes count time a lesson page was open and visible, so an idle tab
still counts up to the cap. Projects shipped reads 0 until projects exist (build prompt 11), and
the next-project card names the chapter, not a project title.

## 2026-11-03: Copy without the AI tells

**Decision.** UI labels and authored notes follow the stop-slop rules: no headings that count
what's already visible ("The mechanism, in four moves" is now "How it works"; "Read the book:
3 subsections" is now "From the book"), no "not X, but Y" lines, no em dashes and no adverb
padding. Digests and exercise write-ups were rewritten to match; banks are next.

**Why.** Copy that announces itself reads as generated and wastes the reader's attention.

## 2026-11-03: Search without a search service

**Decision.** The API builds an in-memory index when it starts: every lesson (title, the notes'
one-liner, the section summary and its listed terms), every glossary term with its definition,
and every exercise title. `GET /api/search?q=` scores each document by a scan: an exact or prefix
title match ranks highest, then whole-word and word-prefix title matches, then words found in the
body. Every query word must match somewhere. Results come back grouped as sections, glossary and
exercises, six per group. The web opens search with Ctrl+K or ⌘K from any page, from the search
field in each page header, or from an icon in the lesson rail and on phones. It's an ARIA 1.2
combobox with a grouped listbox, driven by `aria-activedescendant`.

**Why.** A few hundred documents scan in well under a millisecond, so a real index or an external
service would add moving parts for nothing. Building from the database and committed content
keeps search in step with what the pages show.

When nothing matches exactly, search retries with near misses: one edit allowed for words of five
to eight letters and two from nine, counting a swap of neighbouring letters as one edit, against
whole words and word starts. The dropdown labels those as closest matches. In development the API
watches `content/` and reloads digests, banks and exercises in place when a file changes. A
broken file keeps the previous version and logs why. Search rebuilds after each reload, and every
ingest stamps `content/book/.last-ingest`, so a re-ingest triggers one too.

**Trade-offs.** Production still loads content once at start, so a deploy restarts the API.
Near-miss matching only runs when there are no exact results, so a typo next to a correct word
can still miss.
