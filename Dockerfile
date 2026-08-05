# RyvanOS platform image.
#
# Multi-stage so the runtime layer carries no compiler, no test runner and no
# source — only built output and production dependencies.

# --- build ------------------------------------------------------------------
FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages

# Source is copied before install, not after. pnpm links each workspace
# package's node_modules into its directory; copying source over the top
# afterwards clobbers those links, and the build then cannot find typescript
# or zod. Ordering it this way costs a cache layer and works.
RUN pnpm install --frozen-lockfile --filter "./packages/**"
RUN pnpm exec turbo build --filter="./packages/*"

# Drop dev dependencies before they can be copied forward.
RUN pnpm prune --prod

# --- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime

# Never run as root: a container escape should not start with uid 0.
RUN addgroup -S ryvan && adduser -S ryvan -G ryvan
WORKDIR /app

COPY --from=build --chown=ryvan:ryvan /app/node_modules ./node_modules
COPY --from=build --chown=ryvan:ryvan /app/packages ./packages
COPY --from=build --chown=ryvan:ryvan /app/package.json ./package.json
COPY --chown=ryvan:ryvan scripts ./scripts

USER ryvan

ENV NODE_ENV=production
EXPOSE 4500

# Uses the platform's own health endpoint rather than a TCP probe, so a process
# that is up but cannot reach Postgres is reported unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node scripts/healthcheck.mjs || exit 1

CMD ["node", "scripts/serve.mjs"]
