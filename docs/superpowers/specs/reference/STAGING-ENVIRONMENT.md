# Staging environment — `dev.animeniacs.shop`

A **persistent staging app** for testing feature branches end-to-end (real
catalog + real checkout) before they merge to `main` / go to production. It is
meant to stay up and be **repointed at whatever branch** you're testing.

> ⚠️ This repo is **public** — never commit tokens, passwords, or keys here. All
> credentials live in Coolify env vars / the operator's local `.env.local`. The
> identifiers below are not secrets (you still need the Coolify API token to use
> them).

---

## What it is

| | |
|---|---|
| **URL** | `https://dev.animeniacs.shop` (DNS → the Coolify server; TLS auto-issued) |
| **Coolify app** | `animeniacs-shop-staging` — uuid `m0k4ssowggkc0go04skkg04o` |
| **Project / env** | project `website` (`q4gso4kow0k08gowc4g40ww4`) → **`staging`** environment (`ikw4gwgoskccccw0c04soks4`) |
| **Server** | `animaniacs-shared-host` (`z0sg4ogw4ossg4880080ws8k`) |
| **Coolify base** | `https://empower.relentnet.com` |
| **Build** | dockercompose, `/compose.yml`, app port 3000 |
| **Repo** | `RelentNet/animeniacs-shop` |
| **Tracks branch** | whatever you set (`git_branch`) — repoint it per the steps below |

This is **separate** from the production-bound app `animeniacs-shop-dev`
(uuid `h4400cg04wg8www84ggks4sg`, domain `animeniacs.shop`, tracks `main`). Leave
that one alone — don't point staging at the `animeniacs.shop` domain.

---

## Database — isolated, do NOT share prod

Staging runs its **own** Postgres so tests never touch production data. Because of
two Coolify/compose quirks (learned the hard way), it uses the **compose's own
`postgres` service** rather than a standalone Coolify database:

1. The repo `compose.yml` `postgres` service is gated behind `profiles: [local]`,
   so Coolify does **not** start it by default.
2. A Coolify dockercompose app's containers sit on their own compose network and
   **cannot reach a standalone Coolify Postgres** (different docker network) — the
   `migrate` service then fails with `exit 1` and **no visible error** in the
   deploy log.

The working setup (env vars on the staging app):

```
COMPOSE_PROFILES=local                  # starts the compose-internal postgres
POSTGRES_PORT=55432                     # avoid a host-port 5432 clash on the shared host
DATABASE_URL=postgres://animeniacs:<POSTGRES_PASSWORD>@postgres:5432/animeniacs
```

The compose `migrate` service then reaches `postgres` over the same network and
applies all Drizzle migrations into the isolated volume.

---

## Environment variables

Staging **mirrors production** for parity, with these **overrides**:

| Var | Staging value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://dev.animeniacs.shop` |
| `BETTER_AUTH_URL` | `https://dev.animeniacs.shop` |
| `DATABASE_URL` | isolated internal DB (see above) |
| `COMPOSE_PROFILES` | `local` |
| `POSTGRES_PORT` | `55432` |
| `SHIPPO_API_TOKEN` | a Shippo token (test or live, depending on what you're verifying) |

Everything else (`SQUARE_*`, `BETTER_AUTH_SECRET`, `ADMIN_EMAILS`, `RESEND_*`,
`DISCORD_ORDER_WEBHOOK_URL`, `SMSEDGE_*`, `CRON_SECRET`) is cloned from the prod
app so behavior matches.

### Admin login for testing
`ADMIN_EMAILS` includes `biz@animeniacs.shop`, and a matching better-auth account
exists in the **staging DB only** (sign in at `/sign-in`). The password is held
by the operator — **not** in this repo. Admin is granted by the `ADMIN_EMAILS`
allowlist, so any email in that list can self-register on staging and get admin.

---

## ⚠️ Caveats (because it mirrors prod)

- **Square is PRODUCTION.** A *completed* checkout is a **real charge** and creates
  a real Square order. For testing, stop at the Square redirect, or use a
  low-value item + refund.
- **Notifications are live.** Completed orders fire the real Discord/SMS/Resend
  integrations (cloned from prod). Blank those env vars on staging if you want it
  quiet.
- **No Square webhook for `dev.animeniacs.shop`** — the webhook subscription
  points at prod, so staging orders won't reconcile back into the order log.
  (Pre-payment rate-quoting is unaffected.)

---

## Reuse it for another branch

**Coolify UI:** open `animeniacs-shop-staging` → Configuration → change the
**Branch** to your feature branch → **Deploy**.

**Coolify API** (token = `COOLIFY_API_TOKEN_ANIMANIACS_TEAM` from your local
`.env.local`; never paste it into a committed file):

```sh
TOK="$(grep '^COOLIFY_API_TOKEN_ANIMANIACS_TEAM=' .env.local | cut -d= -f2-)"
BASE="https://empower.relentnet.com"
APP="m0k4ssowggkc0go04skkg04o"

# 1) push your branch to origin first, then point staging at it:
curl -s -X PATCH -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  "$BASE/api/v1/applications/$APP" -d '{"git_branch":"feature/your-branch"}'

# 2) deploy (force):
curl -s -X POST -H "Authorization: Bearer $TOK" \
  "$BASE/api/v1/deploy?uuid=$APP&force=true"
#    → returns deployments[0].deployment_uuid

# 3) poll until done:
curl -s -H "Authorization: Bearer $TOK" \
  "$BASE/api/v1/deployments/<deployment_uuid>"   # status: finished | failed
```

If a deploy fails at the `migrate` step, it's almost always the DB-network quirk
above — confirm `COMPOSE_PROFILES=local` + the internal `DATABASE_URL` are set.

When you switch branches, the isolated DB persists across deploys; migrations from
the new branch apply on top. If you want a clean DB, restart/wipe the staging
Postgres volume in Coolify.

---

See also [`RESUME-HERE.md`](./RESUME-HERE.md) for overall project state.
