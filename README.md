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
3. `pnpm i`
4. `docker compose up -d` starts Postgres 16 and the runner.
5. `pnpm db:migrate`
6. `pnpm content:ingest`
7. `pnpm dev` serves the web app at http://localhost:5173 and the API at http://localhost:4000.

Check the API with `curl http://localhost:5173/api/health`. It should return `{"ok":true}`.

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
| `pnpm content:ingest`      | Fetch the book into `content/book/`                |
| `pnpm content:digests`     | Generate section digests                           |
| `pnpm content:checkpoints` | Generate checkpoint question banks                 |

## LLM provider

All model calls go through `packages/llm` on the server. Set `LLM_PROVIDER` to `anthropic` or
`openai-compatible` and name the model in `LLM_MODEL`. The `openai-compatible` provider works with
any server that speaks `/chat/completions` (vLLM, llama.cpp, Ollama, hosted APIs) and needs
`LLM_BASE_URL`. Set `LLM_PRICE_INPUT_PER_MTOK` and `LLM_PRICE_OUTPUT_PER_MTOK` to get a dollar
cost on each logged call.

## Layout

```
apps/web          React + Vite front end
apps/api          Express API, Prisma schema in apps/api/prisma
apps/runner       project-check sandbox service
packages/shared   zod schemas, types and constants
packages/llm      provider interface and adapters
scripts/          content ingestion and generation
content/projects/ project specs
docs/             ARCHITECTURE.md, DECISIONS.md
```
