# Build context is the repo root: docker build -f apps/runner/Dockerfile .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/runner/package.json apps/runner/
RUN pnpm install --frozen-lockfile --filter @forward-pass/runner...
COPY apps/runner apps/runner
RUN pnpm --filter @forward-pass/runner build \
  && pnpm --filter @forward-pass/runner deploy --prod --legacy /out

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
EXPOSE 4100
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4100/health || exit 1
CMD ["node", "dist/index.js"]
