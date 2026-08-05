# RyvanOS platform image.
#
# Multi-stage so the runtime layer carries no compiler, no test runner and no
# source — only built output and production dependencies.

# --- build ------------------------------------------------------------------
FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Manifests first: this layer is cached until a dependency actually changes,
# so ordinary source edits do not re-download the tree.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/*/package.json ./manifests/

# pnpm needs each manifest back in its own directory.
RUN for file in manifests/*.json; do \
      name=$(node -p "require('./$file').name.replace('@ryvan/','')"); \
      mkdir -p "packages/$name" && mv "$file" "packages/$name/package.json"; \
    done && rmdir manifests

RUN pnpm install --frozen-lockfile --filter "./packages/**"

COPY packages ./packages
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
