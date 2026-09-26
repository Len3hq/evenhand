# syntax=docker/dockerfile:1
# Evenhand web image (Next.js standalone output). Build context: repo root.

ARG NODE_IMAGE=node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

# ── 1. dependencies ─────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY src/judging-engine/package.json src/judging-engine/
COPY src/api/package.json src/api/
COPY src/web/package.json src/web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund -w @evenhand/web

# ── 2. build ────────────────────────────────────────────────────────────────────
FROM deps AS build
# Rewrites are resolved at build time, so the api address is a build argument.
ARG API_REWRITE_TARGET=http://api:3001
ENV API_REWRITE_TARGET=${API_REWRITE_TARGET} \
    NEXT_TELEMETRY_DISABLED=1
COPY src/web src/web
RUN npm run build -w @evenhand/web

# ── 3. runtime ──────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
WORKDIR /app
# Standalone output mirrors the monorepo layout: the server lives at src/web/server.js.
COPY --from=build --chown=node:node /app/src/web/.next/standalone ./
COPY --from=build --chown=node:node /app/src/web/.next/static ./src/web/.next/static
COPY --from=build --chown=node:node /app/src/web/public ./src/web/public
USER node
EXPOSE 8080
CMD ["node", "src/web/server.js"]
