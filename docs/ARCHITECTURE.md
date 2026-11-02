# Architecture

Forward Pass is a pnpm monorepo with four runnable parts and two shared packages. Everything is
TypeScript.

## The parts

**apps/web** is the React 19 front end, built with Vite. React Router handles pages, TanStack
Query handles server state, and CSS Modules read from one `tokens.css`. It never talks to an LLM
or the database. In development, Vite proxies `/api/*` to the API so the browser sees one origin
and the session cookie stays first party.

**apps/api** is an Express server. It owns the session cookie (httpOnly), validates every request
body with zod schemas from `packages/shared`, and reads and writes Postgres through Prisma. It
grades checkpoints and exercises against their answer keys, and runs project critiques, the one
place it calls `packages/llm`.

**apps/runner** runs project checks. It receives a job from the API, starts a throwaway container
per check (CPU only, no network, hard timeout), and returns logs and exit status. It is the only
service with the Docker socket mounted. Today it exposes `GET /health` and nothing else.

**content/** holds the course itself. Every chapter is written ahead of time and committed: section
digests, worked examples, checkpoint banks with answer keys and explanations, exercises with
solutions, and project specs with their checks and tests. Nothing is generated while someone
studies. The book text is the exception: it is fetched into `content/book/` at setup and never
committed.

**scripts/** holds one-off jobs run by hand: fetching the book, validating authored content
against the shared schemas, and seeding the database. Each script is idempotent.

**packages/shared** holds zod schemas, inferred types and constants that more than one part
needs. A schema defined here validates the same payload on both sides of the wire. It also holds
the content schemas and the graders. The graders are pure functions, so the API and
`pnpm content:validate` grade an answer exactly the same way.

**packages/llm** is the only code that talks to a model vendor, and only project critiques use
it. It exposes one call,
`complete({ system, messages, schema, temperature, maxTokens })`, which returns JSON already
validated against the zod schema. `LLM_PROVIDER` picks the adapter (`anthropic` or
`openai-compatible`). The client retries once when the output fails validation, and logs tokens
and cost for every attempt.

## How a request flows

A learner submits a checkpoint answer:

1. The browser posts to `/api/...` with the session cookie. Vite (dev) or the reverse proxy
   (prod) forwards it to the API.
2. Express checks the session, then parses the body with the shared zod schema. Bad input stops
   here with a 400.
3. The route handler loads the question and its answer key, plus the learner's attempt history.
4. The answer is graded in code against the key: a choice, a number within tolerance, or text
   after normalisation. The response carries the explanation and the section to re-read.
5. The result is written to Postgres and returned. TanStack Query updates the cache and the page
   re-renders.

Project submissions follow the same path, with one extra hop: the API sends the repo to the
runner, waits for the check results and the project's tests, and only then asks the LLM for a
critique. The critique prompt includes the relevant book sections, the runner output and the
learner's `results.json`, so claims in a README can be checked against evidence. This is the only
step that waits on a model.

## Local services

`docker compose up -d` starts Postgres 16 and the runner. `pnpm dev` starts the web app and the
API on the host.
