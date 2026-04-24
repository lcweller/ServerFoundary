# syntax=docker/dockerfile:1.7
#
# Multi-stage Dockerfile for ServerFoundary.
# Final image runs both the Next.js dashboard (port 3000) and the agent/terminal
# WebSocket server (port 3001) under tini.
#
# We use node:*-slim (Debian, glibc) rather than Alpine (musl) because the
# lockfile's optional native binaries (@next/swc-linux-x64-gnu, esbuild) target
# glibc. Building on Alpine would require re-resolving those to their musl
# variants at image-build time and tends to break CI.

########################################
# Stage 1: install all deps (dev + prod)
########################################
FROM node:18-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev

########################################
# Stage 2: build the app
########################################
FROM node:18-slim AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Next.js + the agent bundle (public/agent.cjs).
RUN npm run build

# Bundle the standalone WebSocket server and a migrate-and-seed CLI so the
# runtime image can run them with plain `node` (no tsx/typescript needed).
RUN npx esbuild ws-server.ts \
      --bundle \
      --platform=node \
      --target=node18 \
      --format=cjs \
      --packages=external \
      --outfile=dist/ws-server.cjs \
 && npx esbuild src/db/migrate.ts \
      --bundle \
      --platform=node \
      --target=node18 \
      --format=cjs \
      --packages=external \
      --outfile=dist/migrate.cjs \
 && npx esbuild src/db/seed.ts \
      --bundle \
      --platform=node \
      --target=node18 \
      --format=cjs \
      --packages=external \
      --outfile=dist/seed.cjs

# Drop dev deps from node_modules so the runtime image stays small.
RUN npm prune --omit=dev

########################################
# Stage 3: minimal runtime
########################################
FROM node:18-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV AGENT_WS_PORT=3001

RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
# SQL migrations read at runtime by dist/migrate.cjs via drizzle-orm.
COPY --from=builder /app/src/db/migrations ./src/db/migrations

COPY docker/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint

USER node
# 3000 = dashboard HTTP, 3001 = agent/terminal WS.
# 30000-30099 = default external TCP relay range (ADR 0001 Option A).
# These need to be published at `docker run -p 30000-30099:30000-30099`
# and port-forwarded on the platform operator's router for a friend on
# a different network to reach a hosted game server. Re-set both EXTERNAL_*
# env vars if you change the range.
EXPOSE 3000 3001 30000-30099
ENV EXTERNAL_PORT_START=30000
ENV EXTERNAL_PORT_COUNT=100

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint"]
