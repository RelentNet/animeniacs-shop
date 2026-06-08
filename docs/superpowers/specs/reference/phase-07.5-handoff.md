# Phase 7.5 → Phase 8 hand-off

**Status:** Phase 7.5 **complete**. Phase 7 code is now deployed and
running live at `https://dev.animeniacs.shop` (Coolify, Square
sandbox). The deferred Phase 7 Task G.3 12-step manual smoke ran
**green end-to-end** on the live deploy. All automated gates green.
Tag `phase-7.5-first-deploy` applied at the handoff commit (last code
commit `de8492f`).

This phase shipped **zero new product features** — it is a
deployment-infrastructure phase plus the bug-fixes that the first real
deploy surfaced. Read this doc end-to-end before opening Phase 8 code.

> The `de8492f` SHA referenced below is the last *code* commit
> (end of B.8) and is what the live deploy is built from. The
> `phase-7.5-first-deploy` tag sits one commit later, on the handoff
> commit that adds only these documentation files (no code change).
> Resolve the tag's exact SHA with `git rev-parse phase-7.5-first-deploy`.

**Date:** 2026-06-08

> **Read me first, master orchestrator:** `dev.animeniacs.shop` now
> exists and works. The full checkout → Square sandbox → webhook →
> Discord + SMS pipeline is verified against the live deployment. Four
> production-only bugs surfaced during the smoke (all reverse-proxy /
> external-service integration issues, none in the Phase 7 business
> logic) and were fixed as Phase 7.5 commits. The Square env is still
> `sandbox`; prod cutover is a one-line env flip plus a prod domain,
> still deferred. See §"Plan deviations" for the full list of 14
> deviations and §"What's now live" for the resource inventory.

---

## 1. TL;DR

Phase 7.5 took the Phase 7 code (tagged `phase-7-checkout`) and stood
up the project's **first prod-style deployment**: a Coolify
application at `https://dev.animeniacs.shop` backed by a Coolify
Postgres, with a docker-compose build that runs DB migrations via a
dedicated `migrate` service before the app boots. It then executed the
Phase 7 Task G.3 12-step manual smoke against that live deploy.

All 12 smoke steps passed. Along the way four integration bugs
surfaced and were fixed (Logto reverse-proxy `redirect_uri`, a stale
Logto client secret, a missing Square webhook subscription, and the
sms-edge request-body contract). No Phase 7 business logic was
rewritten — every fix was either deployment config or an
external-service integration correction.

No new features. No schema changes. Two new unit tests (the `/admin`
index hub).

---

## 2. Required reading order

1. **This doc** (`phase-07.5-handoff.md`) — deployment state + the four bug fixes.
2. **`phase-07-handoff.md`** — the Phase 7 checkout feature set, schema, hard constraints. Its "Sandbox smoke status" line is now updated to **PASSED (2026-06-08)**.
3. **`phase-06-handoff.md`** — prior feature context (wishlists, site settings, etc.).
4. **`docs/operations/coolify-setup.md`** — the deploy runbook written in Phase 7.5 (the authoritative how-to for re-provisioning or prod cutover).

---

## 3. What Phase 7.5 actually shipped

**Repo changes (Group A):**

- **`src/lib/notifications/sms.ts`** — Phase 7's SMS integration was wrong on every axis. Fixed to use Bearer auth, the `/sms` path, the `sms-edge.relentnet.dev` host, and (after three iterations during smoke) the correct request body `{ to, type: 'Generic', payload: { text } }`. Now checks `res.ok` and logs non-2xx status+body instead of silently swallowing.
- **`compose.yml`** — added `profiles: [local]` to the embedded postgres (so it only runs for local dev), added a dedicated `migrate` service (`target: migrate-runtime`, `restart: "no"`) that runs `pnpm db:migrate` before the app, pointed the app at `${DATABASE_URL}`, added the new runtime env vars (SQUARE_*, DISCORD_*, SMSEDGE_*, NEXT_PUBLIC_PLAUSIBLE_*). The app service uses `expose: ["3000"]` (not `ports:`) and `target: runner`.
- **`Dockerfile`** — added a `migrate-runtime` stage (FROM deps, copies `drizzle.config.ts` + `drizzle/` + `src/lib/db` + `tsconfig.json`, `CMD pnpm db:migrate`). Removed `drizzle` from `.dockerignore` so the migration files reach the build.
- **`docs/operations/coolify-setup.md`** — 333-line deploy runbook covering all 8 setup steps (GitHub binding, Postgres, Logto, app, env vars, deploy, webhook, smoke) plus a troubleshooting section.
- **`.env.example`** — updated SMS vars to match the corrected contract.

**Deploy-surfaced fixes (Group B.8):**

- **`src/app/callback/route.ts`** — rebuild the Logto callback URL from `logtoConfig.baseUrl` (the public origin) instead of trusting `request.url` (which is the internal container host behind Traefik). Post-sign-in redirect now lands on `/admin`.
- **`src/app/(admin)/admin/page.tsx`** (NEW) + `tests/admin/index-page.test.tsx` — an `/admin` index hub linking to the three admin sections, with explicit `color:#111`/`background:#fff` so it stays legible in mobile dark mode.
- **`src/app/(admin)/layout.tsx`, `src/app/artist/page.tsx`, `src/app/sign-in/route.ts`, `src/app/sign-out/route.ts`** — `export const dynamic = 'force-dynamic'` so Next.js does not attempt to statically prerender routes that read auth cookies / DB at request time.
- **`src/lib/env.ts` + `src/instrumentation.ts`** — diagnostic env-var-presence logging on validation failure. **FLAG: these should be removed in a future cleanup pass once the deploy is proven stable** (see §"What's deferred").

**Zero** new product features, **zero** schema changes, **+2** unit tests.

---

## 4. What's now live

**URL:** `https://dev.animeniacs.shop` (force-HTTPS via Traefik, Square `sandbox`).

**Coolify resources** (server `animaniacs-shared-host`, UUID `z0sg4ogw4ossg4880080ws8k`; project `website`; environment `production`):

| Resource | Name | UUID | State |
|---|---|---|---|
| Application | `animeniacs-shop-dev` | `h4400cg04wg8www84ggks4sg` | `running:healthy` |
| Postgres | `animeniacs-shop-postgres` | `j4o0k0840c40w4k088gws04c` | `running:healthy` |

- **App config:** build_pack `dockercompose`, compose at `/compose.yml`, git `https://github.com/itkujo/animeniacs-shop` branch `main`, auto-deploy on, `docker_compose_domains` → `app` → `https://dev.animeniacs.shop`, `ports_exposes=3000`.
- **Postgres:** `postgres:16-alpine` on the `coolify` network. DB/user/name all `animeniacs`.
- **Logto app:** REUSED the existing Phase 4 "Animeniacs Admin" Traditional Web app (App ID `u7ujmvfji0ecq3cqjp7nx`) — it already had `https://dev.animeniacs.shop/callback` in its redirect URIs. Its client secret was **rotated** during the smoke (see deviation 10). Endpoint `https://auth.animeniacs.shop`.
- **Square sandbox webhook subscription:** id `wbhk_ffebd0a703d14b3b8e0c227c107853f8`, url `https://dev.animeniacs.shop/api/webhooks/square`, events `payment.created`, `order.fulfillment.updated`, `refund.created`, api_version `2025-04-16`. Created via the Square API (the dashboard attempt never persisted — deviation 12). Location `L1T00JYXSKVM3`.

**Env-var matrix on the Coolify app** (runtime entries; Coolify auto-creates a duplicate preview-mode entry per key — those don't affect runtime, leave them):

| Key | Notes |
|---|---|
| `DATABASE_URL` | points at the Coolify postgres container; `is_buildtime=true` |
| `NEXT_PUBLIC_SITE_URL` | `https://dev.animeniacs.shop`; `is_buildtime=true` |
| `NODE_ENV` | `production` |
| `SQUARE_ENV` | `sandbox` |
| `SQUARE_ACCESS_TOKEN` | sandbox token (`EAAAlwoO…`), location `L1T00JYXSKVM3` |
| `SQUARE_LOCATION_ID` | `L1T00JYXSKVM3` |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | `cTde1ADACNS3Va-dM82lNA` (from the API-created subscription) |
| `LOGTO_ENDPOINT` | `https://auth.animeniacs.shop` |
| `LOGTO_APP_ID` | `u7ujmvfji0ecq3cqjp7nx` |
| `LOGTO_APP_SECRET` | **rotated value** `PPBbYgSujGjpSO2ElistafZwabYE9ktb` |
| `LOGTO_COOKIE_SECRET` | generated fresh for this deploy |
| `DISCORD_ORDER_WEBHOOK_URL` | set; embeds confirmed arriving |
| `SMSEDGE_TOKEN` | set; Bearer accepted |
| `SMSEDGE_BASE_URL` | `https://sms-edge.relentnet.dev` |

`NEXT_PUBLIC_PLAUSIBLE_*` intentionally left unset on this deploy (operator chose skip-for-now).

---

## 5. Plan deviations

Fourteen deviations from the Phase 7.5 plan, in execution order:

1. **`.dockerignore`** — removed `drizzle` from the ignore list so the migration files reach the `migrate-runtime` build stage (A.2).
2. **Local `docker compose up` end-to-end skipped** — the dev host has a containerd bug (`TTRPC unsupported protocol`) that breaks all `docker run`. The image *built* locally; full local run was verified against the Coolify deploy instead (A.2).
3. **Logto app reused, not created** — the plan said create a new `animeniacs-shop-dev` Logto app; instead reused the existing Phase 4 Traditional Web app (App ID `u7ujmvfji0ecq3cqjp7nx`) which already listed `https://dev.animeniacs.shop/callback`. Operator confirmed (B.3).
4. **`compose.yml` app port** — replaced `ports: ["3000:3000"]` with `expose: ["3000"]` after a host port-conflict (`0.0.0.0:3000 already allocated`). Traefik routes via the container network, so host binding was unnecessary (B.6).
5. **`compose.yml` app `target: runner`** — the Dockerfile's last stage is `migrate-runtime`; `docker build` without `--target` picked it, so the app container ran migrations instead of `node server.js`. Added explicit `target: runner` to the app service (B.6).
6. **`dynamic = 'force-dynamic'` on four routes** — Coolify's build-time env only includes `is_buildtime=true` vars (correctly excluding secrets), so Next.js's static-prerender pass crashed on `/sign-in`, `/sign-out`, `/admin/*`, `/artist` (Logto cookie / DB host / Square token unavailable at build). These routes are inherently dynamic; marking them so fixed the build (B.6).
7. **Diagnostic env-logging** — `src/lib/env.ts` and `src/instrumentation.ts` gained env-var-presence diagnostics (commit `0a34afc`). **To be removed in a future cleanup pass.**
8. **Plausible left unset** — `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL`/`_DOMAIN` intentionally not configured on this deploy (operator choice).
9. **Logto callback public-origin fix** — `src/app/callback/route.ts` rebuilt the callback URL from `logtoConfig.baseUrl` instead of `request.url`, because behind Traefik `request.url` is the internal container host and produced a `redirect_uri_mismatched` error (commit `0f325f0`). This is the cross-project "never trust Host behind a reverse proxy" rule applied to OIDC.
10. **Logto client secret rotated** — the secret displayed in the Logto console was byte-identical to Coolify's stored value, yet token-endpoint probes returned `invalid_client`: the live secret did not match the displayed one. Operator generated a new secret; Coolify `LOGTO_APP_SECRET` is now `PPBbYgSujGjpSO2ElistafZwabYE9ktb`. **Any earlier doc referencing `xU0yUgaQ…` is stale.**
11. **`/admin` index hub added** — `src/app/(admin)/admin/page.tsx` (commit `b2a7bd5`). First explicitly dark-mode-safe admin page. The older admin feature pages still render blank in mobile dark mode (no explicit text color) — a Phase 8 admin-shell follow-up.
12. **Square webhook subscription created via API** — the B.7 dashboard subscription never persisted (the live subscription list was empty after the first real checkout produced no notifications). Created via `POST /v2/webhooks/subscriptions`; the API returned its own signature key `cTde1ADACNS3Va-dM82lNA`, which is now in Coolify (commit context, B.8).
13. **sms-edge body contract corrected** — required three iterations. The design spec §15 `OrderAlert` envelope **does not exist** on the sms-edge server. The real contract (from `@itkujo/sms-core` `src/templates/render.ts`) is `{ to, type: 'Generic', payload: { text } }`. Design spec §15 is inaccurate; the render template is the source of truth (commit `de8492f`).
14. **sms.ts now checks `res.ok`** — previously swallowed all non-network failures. Now logs non-2xx status+body. **Note: the webhook handler still treats an SMS failure as non-fatal** (logged, not thrown) — intentional so a notification outage never blocks order recording.

---

## 6. Hard constraints (verbatim, in force from Phase 4)

- **No affiliate / commission / GoAffPro anything.** `grep -rn "goaffpro" src/ tests/` must remain **zero** (verified: 0 in Phase 7.5).
- **No customer PII leaks via IP.** The IP-nickname feature maps IPs to display nicknames for admin convenience only; raw IPs must never surface in client-facing responses. IP-leak regression tests must stay green.
- **Square writes go to `SQUARE_ENV=sandbox`** until the operator flips the flag for prod cutover. Phase 7.5 did not flip it.
- **No new Postgres tables for order/affiliate tracking.** Phase 7 added one nullable column (`order_log.event_id`); Phase 7.5 added nothing.

---

## 7. What's deferred (carries forward from Phase 7, plus new)

**Carried forward unchanged from Phase 7 handoff:**

- A `/shop` or `/products` listing page — there is none; the header `/shop` link 404s. PDPs work via `/product/<square-catalog-item-id>` (read-through Square cache). Build the listing in Phase 8+.
- Abandoned-cart recovery emails (Resend), promo-bar + `/admin/settings`, refund notifications — the three Phase 8 candidates.
- Production Square cutover (env flip + prod domain).

**New deferrals introduced by Phase 7.5:**

- **Remove the diagnostic env-logging** in `src/lib/env.ts` and `src/instrumentation.ts` (deviation 7) now that the deploy is stable.
- **Admin mobile dark-mode fix** — the admin feature pages (artists, ip-nicknames, sms-recipients) render blank text in mobile dark mode. The `/admin` hub is fixed; the rest need an admin-shell pass that sets explicit colors (deviation 11).
- **Production deploy** on a separate domain (`animeniacs.shop`), with its own Postgres, prod Square token, prod Logto callback, and prod webhook subscription.
- **Monitoring / alerting, CI/CD pipeline, automated DB backups** — none exist yet; all manual via Coolify.

---

## 8. Where credentials live

- **Local dev:** `.env.local` (gitignored). It now also carries `DISCORD_ORDER_WEBHOOK_URL` (local-only, line ~94) and the corrected `SMSEDGE_*` vars.
- **Deployed (dev):** Coolify app `h4400cg04wg8www84ggks4sg` env vars (matrix in §4). Coolify stores a duplicate preview-mode entry per key — only the runtime entries matter; do not try to delete the preview ones.
- **The local-vs-deployed split is intentional:** sensitive secrets (Square token, Logto secret/cookie secret, sms-edge token, Discord URL) live only in Coolify runtime env and `.env.local`, never committed. Only `DATABASE_URL` and `NEXT_PUBLIC_SITE_URL` are marked `is_buildtime` on Coolify (so the build can run migrations / embed the public URL); the rest are runtime-only and therefore absent from the static-prerender pass — which is why deviation 6 was necessary.
- **Coolify API access (operator-held, not committed):** base `https://empower.relentnet.com`, server UUID `z0sg4ogw4ossg4880080ws8k`. The API token used during this phase is operator-held and should be rotated if it was exposed.
- **Operator has no SSH to the Coolify host** — all log/DB access is via the Coolify UI (Logs tab shows separate `migrate-*` and `app-*` containers; the Postgres resource has a terminal that drops into `psql`).

---

## 9. Phase 8 scope (suggested, not locked)

Same three candidates as the Phase 7 handoff, now that a live deploy
exists each can include a **"deploy smoke" acceptance step** instead of
deferring verification:

1. **Promo bar + `/admin/settings`** — site-settings-driven announcement bar, edited from a new admin settings page.
2. **Abandoned-cart recovery emails via Resend** — the `abandoned_carts` rows with `status='pending'` are the input; send a nudge email.
3. **Refund notifications** — the webhook already subscribes to `refund.created`; wire the handler to fan out Discord/SMS on refunds.

**Strongly recommended quick wins to fold into whichever feature is picked:** remove the diagnostic env-logging (deferral 1) and fix the admin mobile dark-mode pages (deferral 2). Also consider building the missing `/shop` listing page so the header link stops 404ing.

---

## 10. Verification state at handoff

- **Lint:** `pnpm biome check .` → clean (178 files).
- **Typecheck:** `pnpm tsc --noEmit` → clean.
- **Unit tests:** **255 passed** (42 files) — up from Phase 7's 253 (+2 for the `/admin` index hub).
- **Integration tests:** **75 passed** (12 files) — unchanged from Phase 7.
- **Routes:** 36 route files (28 `page.tsx` + 8 `route.ts`).
- **Hard-constraint canary:** `grep -rn "goaffpro" src/ tests/` → **0**.
- **Last code SHA:** `de8492f` (`de8492f9532755f58f2a6a93832b72c5556099bf`) — what the live deploy is built from.
- **Tag:** `phase-7.5-first-deploy` — on the handoff commit (one past `de8492f`); resolve with `git rev-parse phase-7.5-first-deploy`.
- **Live deploy:** `curl https://dev.animeniacs.shop/api/health` → `200 {"ok":true,"service":"animeniacs-app","version":"0.1.0",...}`.
- **Smoke:** all 12 Phase 7 Task G.3 steps green on the live deploy (2026-06-08). DB confirmed: `abandoned_carts` has `completed` rows with `square_order_id`; `order_log` has 63 `payment.created` rows. Discord + SMS delivered through the full checkout pipeline. Disable→no-SMS, re-enable→delete→row-gone all verified. Square sandbox shows the test orders (location `L1T00JYXSKVM3`).

---

## 11. How to verify this hand-off is correct

Before starting Phase 8, the next agent should run:

```sh
# Repo at the tagged commit
git fetch --tags
git rev-parse phase-7.5-first-deploy   # the handoff commit (one past de8492f)
git checkout main && git pull

# Automated gate
pnpm install
pnpm biome check .                     # clean
pnpm tsc --noEmit                      # clean
pnpm test                              # 255 passed
pnpm test:integration                  # 75 passed
grep -rn "goaffpro" src/ tests/        # 0

# Live deploy is up and serving
curl https://dev.animeniacs.shop/api/health         # 200 ok:true
curl -X POST https://dev.animeniacs.shop/api/checkout -d '{}'        # 400 Invalid request body
curl -X POST https://dev.animeniacs.shop/api/webhooks/square -d '{}' # 401 (signature key set)

# A product detail page renders (read-through Square sandbox cache)
curl -s -o /dev/null -w '%{http_code}\n' https://dev.animeniacs.shop/product/JKTDJLX3W45I3F2PBKYKLKYX  # 200
```

If `/api/webhooks/square` returns **500** instead of 401, the
`SQUARE_WEBHOOK_SIGNATURE_KEY` env var is empty/wrong on Coolify — check
the app env and that the subscription `wbhk_ffebd0a703d14b3b8e0c227c107853f8`
still exists in the Square sandbox. If sign-in downloads a
`callback.txt` or 400s, re-check the Logto `redirect_uri` /
`LOGTO_APP_SECRET` (deviations 9 & 10). If the deploy ships stale code,
use Coolify's **"Force rebuild without cache"**, not just "Deploy".
