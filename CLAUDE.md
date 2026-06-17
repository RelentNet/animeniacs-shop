# CLAUDE.md — Animeniacs Shop

Guidance for Claude (and humans) working in this repo. Keep it accurate; update
it when conventions change. For "where are we / what's next" at any moment, read
[`docs/superpowers/specs/reference/RESUME-HERE.md`](docs/superpowers/specs/reference/RESUME-HERE.md)
first — that is the living state doc; this file is the durable how-it-works.

## What this is

A custom **Next.js 14 (App Router)** e-commerce storefront for Animeniacs — an
anime / art-print merch shop — replacing a live WooCommerce site at
`animeniacs.shop`. Catalog + payments + orders run on **Square**; auth is
**better-auth** (email+password, sessions in Postgres); data is **Drizzle ORM
over Postgres**; transactional email is **Resend**; UI is **Tailwind** in the
dark "Street Gallery" theme. Deployed to **Coolify** (dev FQDN
`dev.animeniacs.shop`). Repo: `git@github.com:RelentNet/animeniacs-shop.git`.

`SQUARE_ENV=sandbox` everywhere until the operator-gated production cutover.

## Stack / where things live

- `src/app/` — routes. Storefront (`/`, `/shop`, `/product/[id]`, `/artist`,
  `/category/[slug]`, `/brand`, static pages), `(account)/` (signed-in area),
  `(admin)/` (admin tooling, gated), `api/` (checkout, Square webhook, cron).
- `src/lib/` — domain logic: `db/` (Drizzle schema + `queries/`), `square/`
  (client, items, categories, customers, refunds, fulfillment), `webhooks/`
  (`handle-event.ts` + `reconcile.ts`), `orders/` (`build-order.ts`,
  `shipment.ts`, `json-safe.ts`, `labels.ts`), `auth.ts` + `auth/` +
  `auth-client.ts` (better-auth), `cart/`, `products/` (PDP cache),
  `notifications/` (email/discord/sms), `env.ts` (zod-validated env).
- `src/components/` — `layout/` (Header/Footer/Logo), `product/`, `cart/`,
  `orders/`, `auth/`.
- `docs/superpowers/` — `specs/` (designs) + `plans/` + `specs/reference/`
  (phase handoffs + **RESUME-HERE.md**). Read the latest handoff for context.
- `scripts/` — `deploy.sh` (the only deploy path), `content-build.ts`,
  `auth/grant-admin.ts`, `square-cleanup/*`, etc.
- `compose.yml` — local stack: `postgres` + `migrate` (one-shot `db:migrate`) +
  `app`. `Dockerfile` — multi-stage; runtime is the Next standalone (CMD
  `node server.js`); a `migrate-runtime` stage runs `pnpm db:migrate`.

## Commands (always `corepack pnpm …`)

| Task | Command |
|---|---|
| Install | `corepack pnpm install` |
| Build content manifest | `corepack pnpm content:build` (also runs as `prebuild`) |
| Typecheck | `corepack pnpm typecheck` (`tsc --noEmit`) |
| Unit tests | `corepack pnpm test` (vitest; auto-loads `.env.local`) |
| Lint (scoped) | `corepack pnpm exec biome check <files>` |
| Dev server | `corepack pnpm dev` (Postgres must be up) |
| DB migration gen / apply | `corepack pnpm db:generate` / `db:migrate` |
| Grant admin (local DB) | `corepack pnpm auth:grant-admin <email>` |

Note: `corepack pnpm exec next build` does NOT run the `prebuild` hook — run
`corepack pnpm content:build` first or the build fails on a missing
content-manifest.

## Definition of done — the gate suite (run ALL before deploy)

```sh
corepack pnpm typecheck                                  # clean
corepack pnpm test                                       # all green (~596 tests)
grep -rni "logto" src/ tests/                            # 0  (canary)
grep -rn "goaffpro\|GoAffPro" src/ tests/                # 0  (canary)
corepack pnpm content:build && \
  DATABASE_URL=postgresql://x:x@unreachable-host:5432/db corepack pnpm exec next build
#   expect: ✓ Compiled successfully · ✓ Generating static pages (N/N) ·
#           0 ENOTFOUND/ECONNREFUSED · exit 0
```

The **unreachable-DB build** is the load-bearing gate: the Docker builder cannot
reach Postgres, so every prerendered page MUST build without a live DB. On macOS
it exits 0; the Windows-only `EPERM: symlink` quirk (judge by output, not exit
code) does not apply here.

## Hard constraints (do not violate)

- **`SQUARE_ENV=sandbox`.** Never flip to production outside the gated cutover.
- **Canaries stay 0:** no `logto` (auth is better-auth now) and no `goaffpro`
  (deferred, unused) references in `src/`/`tests/`.
- **Deploy ONLY via `./scripts/deploy.sh`** — it pushes `main` then forces a
  Coolify deploy (the push webhook isn't reliably wired). Don't deploy any other
  way. Production cutover is operator-gated and never autonomous.
- **No new build-time-required env var**, and **`(account)`/`(admin)` keep
  `export const dynamic = 'force-dynamic'`.**
- Don't change the derived order `status` semantics (`completed` /
  `refunded` / `partially_refunded`) — it's customer-facing AND powers the
  review "verified purchase" check.

## Deploy

`./scripts/deploy.sh` → `git push origin main` (→ `RelentNet/animeniacs-shop`)
→ `POST {COOLIFY_BASE}/api/v1/deploy?uuid=h4400cg04wg8www84ggks4sg&force=true`.
Reads `COOLIFY_API_TOKEN_ANIMANIACS_TEAM` from `.env.local`. Base
`https://empower.relentnet.com`, dev FQDN `dev.animeniacs.shop`. The script
returns when the deploy is QUEUED — poll
`GET /api/v1/deployments/{uuid}` for `finished`. Read-only Coolify checks: see the
auto-memory note (the Sanctum token contains `|`, which breaks `source` — extract
with `grep | cut`; the envs API returns duplicate empty `${VAR:-}` placeholders).

## Key conventions

- **DB queries** live in `src/lib/db/queries/*` with a **Zod** input schema
  per feature; pages/actions call those, not `db` directly.
- **Server actions** for mutations (`'use server'`); the `(admin)` layout gates
  access via `getCurrentUser()` + the `ADMIN_EMAILS` allowlist (no DB role write
  needed — Postgres is internal to Coolify). Money/state-moving actions
  re-check admin themselves (defense in depth).
- **Build-time DB tolerance:** guard DB reads that would run during prerender
  with `process.env.NEXT_PHASE === 'phase-production-build'` (see `auth.ts`,
  `db/queries/site-settings.ts`, and the `/artist` index) — return an
  empty/`null` shape at build, real data at runtime.
- **Square reconcile is webhook-driven + single-sourced:** `webhooks/reconcile.ts`
  (`reconcileRefundFromSquare`, `reconcileFulfillmentFromSquare`) is the ONE place
  refund/fulfillment math lives; `handle-event.ts` and any caller reuse it.
- **`raw` (Square order snapshot) must be sanitized** with `toJsonSafe`
  (`src/lib/orders/json-safe.ts`) before persisting to the jsonb column — Square
  Money is `bigint` and raw bigints crash JSON serialization.
- **Art protection:** product images render via `next/image` at capped width +
  `quality` (downres) with `draggable={false}` + right-click/drag blocked. The
  print-res original is not displayed. (KNOWN GAP: the original Square URL is
  still in the `/_next/image?url=` param + publicly fetchable — a server-side
  proxy is the real fix; see RESUME-HERE.)
- **Theme:** dark "Street Gallery" tokens in `src/app/globals.css`
  (`--color-ink/wall/purple/neon/bone/muted…`) + utilities `.btn-neon`,
  `.link-neon`, `.eyebrow`, `.neon-text`. New pages must be themed (the PDP and
  `(account)` were retrofitted — don't reintroduce light-mode `text-gray-*` /
  `bg-white`).
- **Tests:** vitest + jsdom; `src/test/setup.ts` mocks `next/font/google` (the
  theme loads fonts in `layout.tsx`, which jsdom can't). DB query tests mock the
  client (`vi.mock`); no live DB needed for `corepack pnpm test`.

## Gotchas (learned the hard way)

- **Refunds key off `payment_id`, not the refund's `order_id`.** Square books a
  refund onto a separate $0 "refund order", so `refund.order_id` ≠ the sale order;
  resolve the sale order via `payment.orderId`.
- **Webhook idempotency marks an event "seen" BEFORE the handler runs** — a
  handler failure won't reprocess on retry. (Hardening is a tracked follow-up.)
- **ISR pages serve an empty/stale shell for up to `revalidate` (300s) after
  every deploy** (`/artist`, `/category/[slug]`) because they prerender empty
  (build can't reach the DB). A revalidate-on-deploy hook is a tracked follow-up.
- **Square sandbox limits:** the sandbox dashboard can't issue refunds (use the
  Refunds API) and the sandbox checkout simulator doesn't render the
  shipping-address step — both work in production. Verify those at cutover.

## Auth

better-auth, email+password, sessions in Postgres. `src/lib/auth.ts` (server) +
`src/lib/auth-client.ts` (client; `authClient.requestPasswordReset` /
`resetPassword`). Admin = membership in the `ADMIN_EMAILS` env allowlist. Password
reset email flows through Resend (`sendResetPassword` → `sendPasswordResetEmail`).
