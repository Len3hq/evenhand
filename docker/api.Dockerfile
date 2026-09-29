# syntax=docker/dockerfile:1
# Evenhand API image. Build context: repo root.
# Network is needed only while building (npm ci, apt); the running container needs none.

ARG NODE_IMAGE=node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

# ── 0. base: node + openssl ─────────────────────────────────────────────────────
# Prisma picks its schema-engine binary by the OpenSSL version it detects *at install
# time*. Every stage must see the same OpenSSL as the runtime, or the runtime tries to
# download a different engine (and fails offline).
FROM ${NODE_IMAGE} AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

# ── 1. all dependencies (for building) ──────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY src/judging-engine/package.json src/judging-engine/
COPY src/api/package.json src/api/
COPY src/web/package.json src/web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund -w @evenhand/judging-engine -w @evenhand/api

# ── 2. build engine + api ───────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY src/judging-engine src/judging-engine
COPY src/api src/api
RUN npm run build -w @evenhand/judging-engine \
 && npm run build -w @evenhand/api

# ── 3. production dependencies only ─────────────────────────────────────────────
FROM base AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY src/judging-engine/package.json src/judging-engine/
COPY src/api/package.json src/api/
COPY src/web/package.json src/web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --omit=dev -w @evenhand/judging-engine -w @evenhand/api

# ── 4. runtime ──────────────────────────────────────────────────────────────────
FROM base AS runtime
# CHECKPOINT_DISABLE: the Prisma CLI (migrate deploy, on every start) otherwise reports its
# version to checkpoint.prisma.io. The internal network would block it; we do not try at all.
ENV NODE_ENV=production \
    CHECKPOINT_DISABLE=1
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
# Fail the build (not the offline start) if the schema engine for this OpenSSL is missing.
RUN ls node_modules/@prisma/engines/schema-engine-*openssl-3.0.x >/dev/null \
 || { echo "Prisma schema engine for OpenSSL 3 missing: runtime would try to download it" >&2; exit 1; }
COPY src/judging-engine/package.json src/judging-engine/
COPY --from=build /app/src/judging-engine/dist src/judging-engine/dist
COPY src/api/package.json src/api/prisma.config.ts src/api/
COPY src/api/prisma src/api/prisma
COPY --from=build /app/src/api/dist src/api/dist
COPY data/fixtures.json data/fixtures.json
COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
# Strip Windows line endings in case the file arrived with CRLF (a zip download, an editor):
# `#!/bin/sh\r` cannot start. .gitattributes already keeps git checkouts LF.
RUN sed -i 's/\r$//' /usr/local/bin/api-entrypoint.sh \
 && chmod 0755 /usr/local/bin/api-entrypoint.sh \
 && mkdir -p /app/uploads \
 && chown -R node:node /app/uploads
USER node
WORKDIR /app/src/api
EXPOSE 3001
ENTRYPOINT ["api-entrypoint.sh"]
