# Coolify deployment runbook — animeniacs-shop

How to deploy `animeniacs-shop` to Coolify at `dev.animeniacs.shop`
(sandbox) and, eventually, to production.

This runbook is referenced by:
- `docs/superpowers/plans/2026-05-30-phase-7.5-first-deploy.md`
- Every future phase that touches deployment

If a step here goes out of date, update this file as part of the
fixing-it commit. The runbook is the source of truth for "how do I
deploy this codebase."

---

## Prerequisites

Before the first deploy, gather:

1. **GitHub repo access** — `itkujo/animeniacs-shop`. Decision: make
   public (simplest), install Coolify GH App
   `helpless-hippopotamus-ogo0o4g0`, or generate a deploy key. Public
   is recommended; the repo has no secrets.
2. **Coolify access** — Coolify dashboard for the animeniacs server.
   Server UUID `z0sg4ogw4ossg4880080ws8k`. Project `website` UUID
   `q4gso4kow0k08gowc4g40ww4`. Production environment UUID
   `ycw0w0ogcoc0gw8o4gw40oo0`.
3. **Square sandbox credentials** — already in local `.env.local`.
   Copies needed for Coolify env: `SQUARE_ACCESS_TOKEN`,
   `SQUARE_LOCATION_ID`.
4. **Square sandbox dashboard** — for the webhook subscription
   (created AFTER first deploy lands, so the URL responds).
5. **Logto admin** — at `auth-admin.animeniacs.shop` for the dev app
   registration.
6. **Discord webhook URL** — from a channel's Integrations → Webhooks.
   Recommend a dedicated `#animeniacs-test-orders` channel for sandbox.
7. **sms-edge credentials** — `SMSEDGE_TOKEN` /
   `SMSEDGE_BASE_URL`. Bearer token from sms-edge tenant
   dashboard for the `animeniacs` tenant. Token recorded one-time
   at tenant creation. Already in operator's `.env.local`.
8. **DNS** — already configured per Phase 4 handoff
   (`5.161.88.222` points at the Coolify host).

---

## Step 1: GitHub repo binding

Pick one:

### Option A — Public repo (recommended)

1. github.com/itkujo/animeniacs-shop → Settings → General → scroll to
   Danger Zone → Change repository visibility → Make public.
2. Confirm.
3. No further GitHub-side setup.

In Coolify, the application source will be set to the public URL with
no auth.

### Option B — Coolify GH App `helpless-hippopotamus-ogo0o4g0`

1. github.com → Settings → Applications → Coolify (existing install)
   → Configure → add `itkujo/animeniacs-shop` to repository access.
2. In Coolify, the application source will use the GH App.

### Option C — Deploy key

1. Coolify dashboard → Sources → Add deploy key. Coolify generates an
   SSH keypair, gives you the public key.
2. github.com/itkujo/animeniacs-shop → Settings → Deploy keys → Add
   deploy key → paste the public key → save.
3. In Coolify, the application source will use the deploy key.

---

## Step 2: Create Coolify Postgres resource

In the `website` project's production environment:

1. Dashboard → New Resource → Database → Postgres.
2. Name: `animeniacs-shop-postgres`.
3. Version: 16-alpine (matches local).
4. Auto-generate password (default).
5. Internal database name: `animeniacs`.
6. Internal user: `animeniacs`.
7. Save. Coolify provisions it.
8. Copy the **internal connection string** from the resource page.
   It looks like:
   ```
   postgres://animeniacs:<generated-password>@animeniacs-shop-postgres:5432/animeniacs
   ```

---

## Step 3: Create the Coolify application

Build pack: dockercompose. Compose file location: `compose.yml`.

### Via the dashboard

1. Project `website` → Production environment → New Resource →
   Application → Public Repository (or other based on Step 1).
2. Repository: `https://github.com/itkujo/animeniacs-shop` (public)
   or `git@github.com:itkujo/animeniacs-shop.git` (deploy key/GH App).
3. Branch: `main`.
4. Build Pack: Docker Compose.
5. Compose location: `/compose.yml`.
6. Ports exposes: `3000`.
7. Domain: `https://dev.animeniacs.shop`.
8. Auto deploy on push: enabled.
9. Save. Don't deploy yet — env vars first.

### Via the API (alternative)

Reference: Phase 7 handoff §"Deferred sandbox smoke" step 3 has a
sample payload. The endpoint depends on the source binding choice
from Step 1.

---

## Step 4: Set env vars in Coolify

In the application's Environment page. **Every variable must be set**
unless marked "(optional)".

### Database

| Variable | Value |
|---|---|
| `DATABASE_URL` | Internal connection string from Step 2 |

### Site

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `NEXT_PUBLIC_SITE_URL` | `https://dev.animeniacs.shop` |

### Square (sandbox values)

| Variable | Value |
|---|---|
| `SQUARE_ENV` | `sandbox` |
| `SQUARE_ACCESS_TOKEN` | Copy from local `.env.local` |
| `SQUARE_LOCATION_ID` | Copy from local `.env.local` |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | **LEAVE BLANK FOR NOW.** Set in Step 7 after webhook subscription is created. |

### Logto (NEW app for dev)

1. Log into `https://auth-admin.animeniacs.shop`.
2. Applications → Create application.
3. Type: Traditional Web.
4. Name: `animeniacs-shop-dev`.
5. Redirect URIs: `https://dev.animeniacs.shop/callback`.
6. Post sign-out redirect URIs: `https://dev.animeniacs.shop`.
7. Save. Note the App ID and App Secret.

| Variable | Value |
|---|---|
| `LOGTO_ENDPOINT` | `https://auth.animeniacs.shop` |
| `LOGTO_APP_ID` | From the new app |
| `LOGTO_APP_SECRET` | From the new app (quote with `"..."` because it starts with `#`) |
| `LOGTO_COOKIE_SECRET` | Generate fresh: `openssl rand -base64 48 \| tr -d '\n'` |

### Notifications

| Variable | Value |
|---|---|
| `DISCORD_ORDER_WEBHOOK_URL` | From Discord channel webhook |
| `SMSEDGE_TOKEN` | From sms-edge tenant `animeniacs` (one-time visible at creation) |
| `SMSEDGE_BASE_URL` | `https://sms-edge.relentnet.dev` |

### Plausible (optional — analytics)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL` | `https://analytics.relentnet.dev/js/script.js` (optional) |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | `dev.animeniacs.shop` |

After all variables set, click "Save Variables." Coolify will need to
redeploy for them to apply.

---

## Step 5: First deploy

1. Click **Deploy**. Use "Force rebuild without cache" the FIRST time
   (cached layers from a never-deployed image cause silent staleness;
   see global AGENTS.md "Coolify deploys — silent staleness").
2. Watch the build log. Expect (in order):
   - `deps` stage installs pnpm packages
   - `builder` stage runs `pnpm content:build` then `pnpm build`
   - `runner` stage assembled
   - `migrate-runtime` stage assembled
   - Compose stack starts
   - `migrate` container runs, applies migrations, exits 0
   - `app` container starts, healthcheck passes
3. If `migrate` fails: check the migrate logs in Coolify. Common
   issue: `DATABASE_URL` not reachable from the migrate container.
   Solution: ensure the Coolify Postgres resource is in the same
   project/environment as the app.
4. If `app` healthcheck never goes healthy: check app logs. Common
   issue: missing required env var (Logto secret, Square token,
   etc.) → app crashes on startup.

---

## Step 6: Verify deploy with curl

From any machine (your laptop or a Coolify SSH):

```sh
# Healthcheck — should return 200
curl -s -o /dev/null -w "%{http_code}\n" https://dev.animeniacs.shop/api/health
# expect: 200

# Checkout endpoint — empty body should return 400
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://dev.animeniacs.shop/api/checkout \
  -H 'Content-Type: application/json' \
  -d '{}'
# expect: 400

# Webhook endpoint — no signature should return 401
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://dev.animeniacs.shop/api/webhooks/square \
  -H 'Content-Type: application/json' \
  -d '{}'
# expect: 401 (signature missing). 500 means
# SQUARE_WEBHOOK_SIGNATURE_KEY is also missing in Coolify env (fine
# for now, since Step 7 is next).

# Public route renders
curl -s -o /dev/null -w "%{http_code}\n" https://dev.animeniacs.shop/
# expect: 200
```

All four PASS → deploy is structurally working. Move to Step 7.

---

## Step 7: Create the Square sandbox webhook subscription

Now that the webhook URL responds, Square can verify it.

1. https://developer.squareup.com/apps → your animeniacs app →
   Sandbox tab → Webhook Subscriptions → Add Subscription.
2. Notification URL: `https://dev.animeniacs.shop/api/webhooks/square`
3. API version: latest (Square will pick).
4. Subscribed events:
   - `payment.created`
   - `order.fulfillment.updated`
   - `refund.created`
5. Save. Square verifies the URL responds.
6. Copy the **Signature Key** (one-time visible).
7. Set in Coolify: `SQUARE_WEBHOOK_SIGNATURE_KEY=<key>`. Save.
8. Click **Redeploy** in Coolify (env-only changes need a redeploy
   to take effect; "Restart" is faster than "Force rebuild" here).

Verify post-key:

```sh
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://dev.animeniacs.shop/api/webhooks/square \
  -H 'Content-Type: application/json' \
  -d '{}'
# expect: 401 (signature is now invalid; previously was 500 due to
# missing key). 401 means the route is running the verification.
```

---

## Step 8: Run the Phase 7 12-step smoke checklist

Reference: `docs/superpowers/plans/2026-05-26-phase-07-checkout.md`
Task G.3.

Substitute `https://dev.animeniacs.shop` for `localhost:3000` in
each step. The Postgres queries (`docker exec animeniacs-postgres
psql ...`) become Coolify dashboard queries against the Coolify
Postgres resource.

---

## Troubleshooting

### Build cache staleness

Coolify can deploy a container that doesn't reflect the latest `main`
if the Docker build cache reuses a stale `COPY . .` layer. Symptoms:
code in `origin/main` is correct but the live HTML / behavior is the
previous build's.

Fix: in Coolify, use **"Force rebuild without cache"** instead of
"Deploy". Confirms with `curl` for a marker you added in the latest
commit.

### Env var changes not propagating

Coolify env vars are picked up at container start, not at runtime.
After changing env vars, you must Redeploy (or Restart) the app
for changes to apply.

### Traefik 502 Bad Gateway

The app container isn't responding on its expected port (3000), OR
the healthcheck is failing.

Check:
- App container is running: Coolify dashboard → application → Logs.
- Healthcheck: `wget -q -O - http://localhost:3000/api/health` from
  inside the container.
- Port mapping: the compose file exposes `${APP_PORT:-3000}:3000`.
  Coolify reads `ports_exposes` from the application config — must
  match.

### Logto callback 400 or "redirect_uri_mismatch"

The `LOGTO_APP_ID` in Coolify points at a Logto app whose registered
redirect URI doesn't match `https://dev.animeniacs.shop/callback`.

Fix: in `auth-admin.animeniacs.shop`, find the app, verify the
redirect URI list includes the exact deployed URL. Update if needed.

### Square webhook verification fails after Step 7

Common cause: the subscribed URL doesn't match what Square computes
the signature against. Square uses the URL EXACTLY as it appears in
the subscription — including trailing slash, protocol, port.

Fix: ensure `NEXT_PUBLIC_SITE_URL` in Coolify matches the webhook
subscription URL up to the path. The webhook handler uses
`${NEXT_PUBLIC_SITE_URL}/api/webhooks/square` for verification.
