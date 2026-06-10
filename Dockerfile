# syntax=docker/dockerfile:1.7

# --- Stage 1: install dependencies ---
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- Stage 2: build ---
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build content manifest then Next.js
RUN pnpm content:build
RUN pnpm build

# --- Stage 3: runtime ---
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache wget
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Ensure the uploads mount point exists and is owned by the app user so the
# named Docker volume (uploads-data) is writable on first container start.
RUN mkdir -p /app/public/images/uploads && \
    chown -R nextjs:nodejs /app/public/images/uploads

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]

# --- Stage 4: migration runner ---
# A one-shot image used by the `migrate` compose service.
# Inherits pnpm + node_modules from the deps stage. Copies only the
# files drizzle-kit needs to read its config and apply migrations.
FROM deps AS migrate-runtime
WORKDIR /app
COPY drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src/lib/db ./src/lib/db
COPY tsconfig.json ./
CMD ["pnpm", "db:migrate"]
