# Animeniacs Shop

Custom **Next.js 14** e-commerce storefront for Animeniacs — an anime / art-print
merch shop — built to replace the live WooCommerce site at `animeniacs.shop`.

> **Contributors / agents:** read [`CLAUDE.md`](./CLAUDE.md) for conventions,
> the gate suite, and gotchas, and
> [`docs/superpowers/specs/reference/RESUME-HERE.md`](./docs/superpowers/specs/reference/RESUME-HERE.md)
> for current project state and what's next.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript**
- **Square** — catalog, payments, orders (`SQUARE_ENV=sandbox` until production cutover)
- **better-auth** — email + password auth, sessions in Postgres (admin via an `ADMIN_EMAILS` allowlist)
- **Drizzle ORM** over **PostgreSQL**
- **Resend** — transactional + lifecycle email (receipts, refunds, password reset, abandoned-cart)
- **Tailwind CSS** — dark "Street Gallery" theme
- Hosted on **Coolify** (dev: `dev.animeniacs.shop`)
- Optional: Plausible analytics, Discord/SMS order notifications. (GoAffPro affiliate is deferred / unused.)

## Local development

### Prerequisites

- Node.js 20+
- pnpm 10+ (`package.json#packageManager` pins it; `corepack` activates it — prefix commands with `corepack`)
- Docker 24+ with Compose v2.20+

### First-time setup

```bash
corepack pnpm install

cp .env.example .env.local
# Fill in at minimum:
#   BETTER_AUTH_SECRET        (openssl rand -hex 32)
#   SQUARE_ACCESS_TOKEN / SQUARE_LOCATION_ID   (Square sandbox app)
#   ADMIN_EMAILS              (comma-separated; grants admin to those emails)
#   DATABASE_URL              (matches POSTGRES_* + POSTGRES_PORT below)
# Optional: RESEND_API_KEY + RESEND_FROM_EMAIL (email), CRON_SECRET, SMSEDGE_*, DISCORD_*

corepack pnpm content:build          # build the static-content manifest

docker compose --env-file .env.local up -d
# Brings up: postgres → migrate (runs db:migrate once) → app.
# Migrations apply automatically via the `migrate` service.

open http://localhost:3000
```

To make yourself an admin: add your email to `ADMIN_EMAILS` in `.env.local`
(restart the app), then sign up / sign in at `/sign-up`. `/admin` is gated to
allowlisted emails.

### Daily development

```bash
docker compose --env-file .env.local up -d postgres   # DB only
corepack pnpm dev                                      # native dev server (fast reload)
```

### Tests & checks

```bash
corepack pnpm typecheck     # tsc --noEmit
corepack pnpm test          # vitest (auto-loads .env.local; no live DB needed)
corepack pnpm exec biome check <files>   # lint (scope to touched files)
```

Before any deploy, the full **gate suite** must pass — including the
unreachable-DB production build. See [`CLAUDE.md`](./CLAUDE.md#definition-of-done--the-gate-suite-run-all-before-deploy).

## Deploy

Deploy **only** via the canonical script:

```bash
./scripts/deploy.sh        # git push main → force a Coolify deploy of the dev app
```

It reads `COOLIFY_API_TOKEN_ANIMANIACS_TEAM` from `.env.local`. The script returns
once the deploy is queued; the build runs on Coolify (dev FQDN
`dev.animeniacs.shop`). **Production cutover is operator-gated and never
automated.**

## Project structure

```
src/app/            routes — storefront, (account), (admin), api (checkout, square webhook, cron)
src/lib/            domain logic — db (Drizzle + queries), square, webhooks, orders, auth, cart, notifications
src/components/     layout / product / cart / orders / auth UI
scripts/            deploy.sh, content-build.ts, auth/grant-admin.ts, square-cleanup/*
docs/superpowers/   designs (specs/), plans/, phase handoffs + RESUME-HERE (specs/reference/)
compose.yml         local stack: postgres + migrate + app
```

## Documentation

- [CLAUDE.md](./CLAUDE.md) — architecture, conventions, gate suite, constraints, gotchas
- [RESUME-HERE](./docs/superpowers/specs/reference/RESUME-HERE.md) — current state + what's next
- [Phase handoffs](./docs/superpowers/specs/reference/) — per-phase detail (latest: order tooling, order-log fidelity, password reset)
- [Design specs & plans](./docs/superpowers/) — full system design and implementation plans
