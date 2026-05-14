# Logto (auth)

Logto runs as a separate Docker Compose service. Phase 1 only verifies the
service is healthy and reachable — Logto SDK integration in the Next.js app
comes in Phase 7.

## Ports

Container-internal ports are always `3001` (tenant API) and `3002` (admin
console). Host ports are configurable via `.env.local`:

- `LOGTO_PORT` — host port mapped to the tenant API (default `3001`)
- `LOGTO_ADMIN_PORT` — host port mapped to the admin console (default `3002`)

This repo defaults to `3004` / `3005` locally because `3001` / `3002` are
occupied by another project's Logto on this dev machine.

The `ENDPOINT` and `ADMIN_ENDPOINT` env vars Logto receives MUST point at the
HOST URLs (what the browser hits), not the container-internal ports. Keep
`LOGTO_ENDPOINT` / `LOGTO_ADMIN_ENDPOINT` in sync with the host ports.

## First-run setup (one-time, manual)

After `docker compose up -d logto`, the first time you visit the **admin
endpoint** (e.g. `http://localhost:3005`), Logto will prompt you to create an
owner account.

1. Open the admin endpoint URL in a browser.
2. Create the owner account with a memorable local-dev password. Save it to
   a password manager.
3. Inside the admin console: **Applications → Create application →
   Next.js (App Router) → Traditional Web**.
4. Name: `Animeniacs Shop`.
5. Save the **App ID** and **App Secret** to `.env.local` as `LOGTO_APP_ID`
   and `LOGTO_APP_SECRET`.
6. Redirect URI: `http://localhost:3000/callback` (adjust if `APP_PORT`
   differs).
7. Post sign-out redirect URI: `http://localhost:3000/`.

These steps are MANUAL and only needed for local dev. Production Logto on
Coolify gets a separate owner account / app registration documented in
Phase 17.

## Resetting Logto for development

To start fresh (re-trigger the first-run flow):

```bash
docker compose down
docker volume rm animeniacs_postgres-data
docker compose --env-file .env.local up -d
```

This nukes ALL Postgres data including the `animeniacs` app DB. Re-apply
Drizzle migrations after restart.
