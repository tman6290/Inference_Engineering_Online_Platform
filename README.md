# Forward Pass

A private study app for two people working through _Inference Engineering_ by Philip Kiely
(Baseten Books, 2026). My study partner and I read section by section, pass checkpoints, build one project per
chapter, and get each project critiqued against a rubric.

It is not a public product. There is no signup page; two invite codes in `.env` create the two
seats.

The book text and figures never enter this repo. `pnpm content:ingest` fetches them at setup
time into gitignored folders.

## Requirements

- Node 20 or newer
- pnpm 10 (`corepack enable` picks up the pinned version)
- Docker with Compose

## Setup

1. `git clone <repo-url> forward-pass && cd forward-pass`
2. `cp .env.example .env`, then fill in `SESSION_SECRET`, the `LLM_*` values and both invite codes.
3. `pnpm i`, then `pnpm --filter @forward-pass/api exec playwright install chromium` (Chromium
   renders the case-study PDFs).
4. `docker compose up -d` starts Postgres 16 and the runner.
5. `pnpm db:migrate`
6. `pnpm content:ingest` fetches the book (about two minutes the first time; later runs reuse what is on disk).
7. `pnpm dev` serves the web app at http://localhost:5173 and the API at http://localhost:4000.
8. Each of us claims a seat once, at `http://localhost:5173/register?code=<INVITE_CODE_1>` and
   `…?code=<INVITE_CODE_2>`. After that, sign in at `/login`.

Forgot a password? `pnpm admin reset-password <email>` sets a temporary one (add
`--password <temporary>` to choose it), signs that account out everywhere, and asks for a new
password at the next sign-in. `pnpm admin create-user <email> --name <name>` creates an account in
a free seat without an invite link, the same way. `pnpm admin list-users` and
`pnpm admin revoke-sessions <email>` cover the rest. Changing your own password keeps you signed in
on that device and signs out any others.

Check the API with `curl http://localhost:5173/api/health`. It should return `{"ok":true}`.

## Hosting

The database is a Neon Postgres project (London). The API runs on Render from `render.yaml`
(a Blueprint: it builds, applies migrations and starts the API; secrets are entered in the Render
dashboard). The web app runs on Netlify from `netlify.toml`, which proxies `/api/*` to Render so the
session cookie stays on one site. Accounts on the hosted app are made with
`pnpm admin create-user` while `DATABASE_URL` points at Neon. Project checks need Docker, so the
runner stays on a laptop: it polls the hosted API for queued submissions, runs them and reports
back. Give Render the same `RUNNER_TOKEN` as the laptop's `.env`, set `RUNNER_API_URL` there to the
Render URL, then `pnpm runner:image` once and `pnpm runner` with Docker running. Submissions made
while the runner is off wait in the queue.

## Scripts

| Script                     | What it does                                       |
| -------------------------- | -------------------------------------------------- |
| `pnpm dev`                 | Web (Vite) and API (Express) together              |
| `pnpm build`               | Production builds for every package                |
| `pnpm lint`                | ESLint plus a Prettier check                       |
| `pnpm typecheck`           | `tsc` in every package                             |
| `pnpm test`                | Vitest across the workspace                        |
| `pnpm db:migrate`          | Prisma migrations against `DATABASE_URL`           |
| `pnpm db:seed`             | Seed data                                          |
| `pnpm admin`               | List users, reset a password, revoke sessions      |
| `pnpm content:ingest`      | Fetch the book, load it into Postgres, write the outline |
| `pnpm content:validate`    | Check authored chapters, answer keys and exercises |

## LLM provider

Every chapter, checkpoint and exercise is written ahead of time with its answers, so studying never
waits on a model. The one live call is the project critique, which goes through `packages/llm` on
the server. I run it with `LLM_PROVIDER=anthropic`, the key in `LLM_API_KEY` and the model in
`LLM_MODEL`. The `openai-compatible` provider also works, with any server that speaks
`/chat/completions` (vLLM, llama.cpp, Ollama, hosted APIs) plus `LLM_BASE_URL`. Set
`LLM_PRICE_INPUT_PER_MTOK` and `LLM_PRICE_OUTPUT_PER_MTOK` to get a dollar cost on each logged
call.

## Layout

```
apps/web          React + Vite front end
apps/api          Express API, Prisma schema in apps/api/prisma
apps/runner       project-check sandbox service
packages/shared   zod schemas, types and constants
packages/llm      provider interface and adapters
content/chapters/ authored notes, checkpoints and exercises
scripts/          book ingestion, content validation, seeding
content/projects/ project specs
docs/             ARCHITECTURE.md, DECISIONS.md
```
