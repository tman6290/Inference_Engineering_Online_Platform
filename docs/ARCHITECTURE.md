# Architecture

Forward Pass is a pnpm monorepo with four runnable parts and two shared packages. Everything is
TypeScript.

## The parts

**apps/web** is the React 19 front end, built with Vite. React Router handles pages, TanStack
Query handles server state, and CSS Modules read from one `tokens.css`. It never talks to an LLM
or the database. In development, Vite proxies `/api/*` to the API so the browser sees one origin
and the session cookie stays first party.

**apps/api** is an Express server. It owns the session cookie (httpOnly), validates every request
body with zod schemas from `packages/shared`, and reads and writes Postgres through Prisma. Grading
and critique happen here: the API loads the relevant book sections, calls `packages/llm`, and
stores the structured result.

**apps/runner** runs project checks. It receives a job from the API, starts a throwaway container
per check (CPU only, no network, hard timeout), and returns logs and exit status. It is the only
service with the Docker socket mounted. Today it exposes `GET /health` and nothing else.

**scripts/** holds one-off jobs run by hand: fetching the book into `content/book/`, generating
section digests and checkpoint banks, and seeding the database. Each script is idempotent.

**packages/shared** holds zod schemas, inferred types and constants that more than one part
needs. A schema defined here validates the same payload on both sides of the wire.

**packages/llm** is the only code that talks to a model vendor. It exposes one call,
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
3. The route handler loads what it needs through Prisma: the question, the learner's attempt
   history, and the section text from `content/book/`.
4. Questions with an exact answer are graded in code. Open answers go to `packages/llm` with the
   section text in the prompt, `temperature: 0`, and a response schema.
5. The result is written to Postgres and returned. TanStack Query updates the cache and the page
   re-renders.

Project submissions follow the same path, with one extra hop: the API sends the repo to the
runner, waits for the check results, and only then asks the LLM for a critique. The critique
prompt includes the runner output and the learner's `results.json`, so claims in a README can be
checked against evidence.

## Local services

`docker compose up -d` starts Postgres 16 and the runner. `pnpm dev` starts the web app and the
API on the host.
