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
