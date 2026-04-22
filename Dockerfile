# syntax=docker/dockerfile:1.7
#
# Multi-stage Dockerfile for ServerFoundary.
# Final image runs both the Next.js dashboard (port 3000) and the agent/terminal
# WebSocket server (port 3001) under tini.

########################################
# Stage 1: install all deps (dev + prod)
########################################
FROM node:18-alpine AS deps

WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci

########################################
# Stage 2: build the app
########################################
FROM node:18-alpine AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js build, agent bundle (public/agent.cjs), and ws-server bundle.
RUN npm run build \
 && npx esbuild ws-server.ts \
      --bundle \
      --platform=node \
      --target=node18 \
      --format=cjs \
      --packages=external \
      --outfile=dist/ws-server.cjs

# Strip dev deps so the runtime image stays small.
RUN npm prune --omit=dev

########################################
# Stage 3: minimal runtime
########################################
FROM node:18-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV AGENT_WS_PORT=3001

RUN apk add --no-cache tini

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

COPY docker/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint

USER node
EXPOSE 3000 3001

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint"]
