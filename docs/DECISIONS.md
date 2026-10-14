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
