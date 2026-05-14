# Animeniacs Shop

Custom Next.js e-commerce site replacing the current `animeniacs.shop` WordPress/WooCommerce site.

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Square (catalog, payments, orders)
- GoAffPro (affiliate / artist management)
- Logto (self-hosted auth)
- Plausible (self-hosted analytics)
- Resend (newsletter + transactional email)
- PostgreSQL (shared instance for Logto, Plausible metadata, app data)
- Hosted on Coolify

## Local development

### Prerequisites

- Node.js 20+
- pnpm 10+ (the repo pins `pnpm@10.33.2` via `package.json#packageManager`; corepack will activate it automatically)
- Docker 24+ with Compose v2.20+
- macOS / Linux

### First-time setup

```bash
# 1. Install Node deps
pnpm install

# 2. Create .env.local from template
cp .env.example .env.local
# Then edit .env.local to fill in:
#   LOGTO_COOKIE_SECRET   (run: openssl rand -base64 48)
#   PLAUSIBLE_SECRET_KEY_BASE  (run: openssl rand -base64 64)
#   PLAUSIBLE_TOTP_VAULT_KEY   (run: openssl rand -base64 32)
# If the default ports (3000 / 3001 / 3002 / 5432 / 8000) clash with other
# services on your machine, also set in .env.local:
#   APP_PORT, LOGTO_PORT, LOGTO_ADMIN_PORT, POSTGRES_PORT, PLAUSIBLE_PORT
#   (and adjust the matching DATABASE_URL / LOGTO_ENDPOINT / LOGTO_ADMIN_ENDPOINT URLs).

# 3. Build content manifest
pnpm content:build

# 4. Bring up the local stack
docker compose --env-file .env.local up -d

# 5. Apply DB migrations (once Postgres is healthy)
pnpm db:migrate

# 6. Visit the services (use your chosen ports if non-default)
open http://localhost:3000   # Next.js app
open http://localhost:3001   # Logto tenant API (the SDK uses this)
open http://localhost:3002   # Logto admin console (create owner here on first visit)
open http://localhost:8000   # Plausible (create admin here on first visit)
```

### Daily development

```bash
# Run the dev server (auto-reload) outside of Docker.
# Docker still runs Postgres, Logto, Plausible. Only the app runs natively
# for fastest reload cycles.
docker compose --env-file .env.local up -d postgres logto plausible plausible-clickhouse
pnpm dev
```

### Tests

```bash
pnpm test              # all tests once (vitest auto-loads .env.local)
pnpm test:watch        # watch mode
pnpm typecheck         # tsc --noEmit
pnpm lint              # biome check
```

The DB integration test (`tests/db.integration.test.ts`) needs Postgres running. The other tests don't.

### Common ops

```bash
# Tail logs
docker compose logs -f app

# Reset everything (DESTRUCTIVE — wipes ALL local data including Logto/Plausible accounts)
docker compose down -v
rm -rf .next src/lib/generated drizzle/migrations
pnpm db:generate
docker compose --env-file .env.local up -d
pnpm db:migrate

# Drizzle Studio (DB GUI at http://local.drizzle.studio)
pnpm db:studio
```

### First-run manual setup

The Phase 1 stack runs but Logto and Plausible need a one-time admin account created in their UI:

- **Logto**: visit the admin endpoint (default `http://localhost:3002`), create owner account, then create an Application (Next.js / Traditional Web) named `Animeniacs Shop`. Copy the App ID and Secret into `.env.local` as `LOGTO_APP_ID` and `LOGTO_APP_SECRET`. Set redirect URI to `http://localhost:3000/callback` and post-sign-out URI to `http://localhost:3000/`. (Detailed steps in `docker/logto/README.md`.) Logto SDK integration in the app happens in Phase 7.

- **Plausible**: visit `http://localhost:8000`, register the admin account, add `animeniacs.shop` as a tracked site (timezone America/Chicago). Plausible tracking-script integration in the app happens in Phase 10.

## Production deploy (Coolify)

The same `compose.yml` deploys to Coolify. Set the production env vars in Coolify's UI (TLS-protected). Coolify adds `SERVICE_FQDN_*` vars automatically; the app reads them via `NEXT_PUBLIC_SITE_URL`.

## Documentation

- [Design Spec](./docs/superpowers/specs/2025-05-13-animeniacs-shop-design.md) — full system design
- [Phase 1: Foundation Plan](./docs/superpowers/plans/2025-05-13-phase-01-foundation.md)
- [Static Content Sources](./docs/superpowers/specs/static-content-source/) — migrated content from current WordPress site
- [Reference: Mockup Gallery Original](./docs/superpowers/specs/reference/mockup-gallery-original.html) — current site's product mockup viewer (preserved aesthetic)
- [Logto first-run notes](./docker/logto/README.md)
