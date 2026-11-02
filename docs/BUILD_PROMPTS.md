# Build prompts

Run in order. Committed with the rest of the repo since 2 November 2026.

Restored on 2 November 2026. The original file was lost; only the two prompts that had already been run
survived, word for word below. Prompts 3 onwards need rewriting, and they should follow the content model
in CLAUDE.md (everything authored during development; AI only for project critiques).

Status: Prompt 1 done (commits 1749544, f7b09d0). Prompt 2 done (bfc6875, React 19 upgrade 0f49c18).

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

## Prompt 3 onwards — to be rewritten
