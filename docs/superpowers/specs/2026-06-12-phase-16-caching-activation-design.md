# Phase 16 — Rendering/Caching Pass + Feature Activation — Design Spec

**Date:** 2026-06-12
**Status:** approved for planning
**Depends on:** Phase 15 (better-auth) — shipped, deployed, verified on dev
(`/admin` confirmed open for biz@animeniacs.shop on 2026-06-12).

## 1. Goal

Two halves, one phase:

1. **Rendering/caching pass** (deferred from Phase 15): drop the blanket
   `export const dynamic = 'force-dynamic'` from `src/app/layout.tsx` so
   genuinely static pages stop re-rendering per request, and add ISR to the
   catalog pages where it is actually correct. Account/admin/cart/checkout
   stay dynamic.
2. **Feature activation + live verification on dev**: wire the abandoned-cart
   cron trigger, verify the Square webhook → order → receipt chain with a
   sandbox purchase, verify reviews-with-photo / refunds / fulfillment /
   guest-lookup live, and add the missing admin navigation (operator request:
   there is no easy way back to `/admin` from admin sub-pages).

## 2. Current state (repo truth — read before designing further)

The data layer is **already runtime-cached**. Phase 16 is NOT "add caching";
it is "fix the rendering mode + activate dormant features":

| Read path | Cache today |
|---|---|
| `getSetting` (promo bar) — `src/lib/db/queries/site-settings.ts:35` | `unstable_cache`, 60 s |
| `getShopProducts` / `getItemsByCategoryId` — `src/lib/square/items.ts` | `unstable_cache`, 60 s |
| `listCategoriesFromSquare` — `src/lib/square/categories.ts` | `unstable_cache`, 5 min |
| PDP `getProductById` — `src/lib/products/cache.ts` | Postgres read-through `product_cache`, 1 h TTL |

The root layout is `force-dynamic` for exactly one reason (its own comment,
`src/app/layout.tsx:13-23`): `<PromoBar />` reads Postgres, and the Docker
builder **cannot resolve the database host**, so any build-time prerender
throws `ENOTFOUND` and fails the build. The fix is build tolerance (§4), not
permanent dynamic rendering.

Admin mutations already call the right invalidations — `settings/actions.ts`
→ `revalidatePath('/')`, artist actions → `/artist` + `/artist/[slug]`,
ip-nickname actions → `/category/[slug]`, review actions →
`/product/[id]`. Under blanket force-dynamic these were no-ops; ISR makes
them real.

## 3. Rendering strategy per route (the decision table)

| Route | Today | Phase 16 | Why |
|---|---|---|---|
| `/` (home) | dynamic (inherited) | **fully static** | No data reads of its own (`src/app/page.tsx` is static text); PromoBar handled by §4. |
| `/shop` | own `force-dynamic` | **stays request-rendered** (keep the export + its comment) | Branches on `searchParams` → Next forces dynamic regardless; data already cached 60 s. Naive ISR is impossible here. |
| `/product/[id]` | dynamic (inherited) | **stays request-rendered** this phase | Page reads `getCurrentUser()` (wishlist state) → cookies → dynamic wins; `revalidate` would be a silent no-op. Data is already double-cached (product_cache 1 h). ISR-ing the PDP requires a client-island refactor of WishlistButton/review gating — **deferred, recorded in §10**. |
| `/artist` (index) | own `force-dynamic` | **ISR `revalidate = 300`** + build-tolerant data read (§4) | Public DB read only (`getActiveArtists`); admin artist actions already revalidate `/artist`. |
| `/artist/[slug]` | dynamic (inherited) | **ISR `revalidate = 300`**, on-demand (NO `generateStaticParams`) | Public data only (verified: no session read). Without `generateStaticParams` the builder prerenders nothing → no build-time DB read → no guard needed; first request renders with real data and caches. |
| `/category/[slug]` | dynamic (inherited) | **ISR `revalidate = 300`**, on-demand (NO `generateStaticParams`) | Same shape as artist/[slug]. |
| `/orders/lookup` | own `force-dynamic` | investigate; make static if the page itself reads nothing per-request | Likely a form page whose lookup happens in an action/route. If it reads `searchParams`/session, leave as is. |
| `/sign-in`, `/sign-up` | dynamic (inherited) | static (no change needed — they should just fall out static once the root export drops) | Client-component forms. |
| `(account)`, `(admin)` | own `force-dynamic` | **keep** (explicit, already present) | Per-user. |
| cart/checkout/api routes | dynamic | **keep** | Per-user / mutating. `api/auth/[...all]` already has its own `force-dynamic`. |

Anything else that turns up during the unreachable-DB build (§4) gets a
case-by-case call: build guard if its data is decorative, explicit
`force-dynamic` if it is genuinely per-request.

## 4. Build-time DB tolerance (the load-bearing constraint)

**Invariant (canon gate, unchanged from Phases 10–15):**
`DATABASE_URL=postgresql://x:x@unreachable-host:5432/db corepack pnpm exec next build`
must compile AND generate static pages with **0 ENOTFOUND/ECONNREFUSED**.
After this phase that gate also proves every prerendered page tolerates a
dead DB.

Mechanism — reuse the existing `NEXT_PHASE` pattern from `src/lib/auth.ts:28`
(`process.env.NEXT_PHASE === 'phase-production-build'`):

- **`getSetting`** (covers PromoBar on every prerendered page): during the
  build phase return `null` immediately (no DB call). PromoBar already
  renders nothing for `null`. At runtime the first ISR regeneration (≤60 s
  data cache + page revalidate) fills the promo bar in.
- **`/artist` index data read** (`getActiveArtists` call site): during the
  build phase render the empty state. Consequence: for up to `revalidate`
  seconds after a deploy, `/artist` serves the build-time empty shell.
  Mitigation: the deploy verification step curls `/artist` twice (first
  request triggers background regeneration, second confirms content). If
  the operator finds the window unacceptable later, shorten `revalidate`
  or add a warm-up loop to `deploy.sh` — not blocking for dev.

Guard placement: in the **page/data call site or query module**, with a unit
test that sets `NEXT_PHASE` and asserts no DB client call is made. Do NOT
blanket-try/catch DB errors at runtime — a dead DB at runtime should still
surface loudly on dynamic pages.

## 5. Promo-bar propagation fix

`revalidatePath('/')` in `settings/actions.ts` only revalidates the home
route. Once artist/category pages are ISR'd, their cached HTML embeds the
promo bar, so a promo change would linger up to 300 s. Change the settings
action to `revalidatePath('/', 'layout')` (revalidates the whole tree) and
keep `revalidatePath('/admin/settings')`. The 60 s `getSetting` data cache
still applies — total worst-case propagation ≈ 60 s, acceptable.

## 6. Admin navigation (operator UX request, 2026-06-12)

Every page under `(admin)` needs an obvious way back to `/admin`. Smallest
honest fix: a slim admin header bar rendered by `(admin)/layout.tsx` —
"← Admin home" link (and the page can keep its own h1). Component-test it
(renders link to `/admin`; appears on a sub-page render). No redesign; the
operator-tooling dashboard is a later phase.

## 7. Abandoned-cart cron activation

State: route exists (`src/app/api/cron/abandoned-carts/route.ts`, secured by
`x-cron-secret`), **`CRON_SECRET` is now set** in Coolify runtime env (done
2026-06-12 by Master via API; same value appended to `.env.local`). Nothing
triggers it yet. There are **no GitHub Actions workflows in the repo** —
do not assume CI exists for scheduling.

Design: a **Coolify scheduled task** on the app container, every 15 min:

```sh
node -e "fetch('http://localhost:3000/api/cron/abandoned-carts',{method:'POST',headers:{'x-cron-secret':process.env.CRON_SECRET}}).then(r=>r.json().then(j=>{console.log(r.status,JSON.stringify(j));if(!r.ok)process.exit(1)}))"
```

- Runs inside the container → `CRON_SECRET` comes from the env, localhost
  avoids the public hop, `node` is guaranteed present (no curl dependency).
- Try the Coolify API first (the executor has the token via `.env.local`);
  if scheduled-task creation isn't exposed by this Coolify version's API,
  document exact UI steps for the operator instead. **Do not** build a
  GitHub Actions dependency for this.

Verification (operator-assisted, threshold is 60 min by default): seed an
abandoned cart on dev (enter email at checkout, abandon), temporarily lower
`ABANDONED_CART_THRESHOLD_MINUTES` in Coolify if waiting is impractical,
trigger manually from the workstation
(`curl -X POST -H "x-cron-secret: <from .env.local>" https://dev.animeniacs.shop/api/cron/abandoned-carts`)
→ expect `{"processed":1}`. The **email leg requires Resend** (§9) — without
it, `processed` increments but no mail sends; record the partial result
honestly.

## 8. Live verification matrix (dev, sandbox)

Executor drives; operator does the browser legs. Record pass/fail per row in
the handoff — a row blocked by missing Resend is recorded as "partial:
blocked on Resend", not skipped silently.

| # | Flow | How |
|---|---|---|
| V1 | Auth walkthrough (P15 §10.5) | sign-out/in as biz@; `/account`; add/set-default/delete saved address; guest order → sign up with same email → order appears under the account. |
| V2 | Sandbox purchase → webhook → order → receipt | Operator completes a sandbox checkout; verify order row appears (admin/orders or guest lookup), Discord webhook fires, receipt email sends (Resend-dependent). |
| V3 | Reviews with photo | Submit review + photo on a product; photo persists **across a redeploy** (uploads volume). |
| V4 | Refund + fulfillment | Drive a refund and a fulfillment state change in Square sandbox dashboard; verify order status + lifecycle emails (Resend-dependent). |
| V5 | Guest order lookup | `/orders/lookup` with the guest order's email/id. |
| V6 | Abandoned-cart cron end-to-end | §7. |
| V7 | Caching behavior | promo-bar edit propagates to `/` and an ISR page ≤ ~60 s; `/artist` serves cached HTML (compare consecutive response timings/headers); `/admin`+`/account` still 307 anon; signed-in flows unaffected. |

## 9. Operator-pending (not executor-blockable)

1. **Resend**: set `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (verified sender)
   in Coolify. Unblocks the email legs of V2/V4/V6 + password reset.
2. **Decommission the Logto deployment** (`auth.animeniacs.shop`) — the
   `LOGTO_*` Coolify vars were already removed 2026-06-12; the standalone
   service itself is the operator's to retire.
3. **Artist data entry**: repoint merc to its 61-item category; create the
   ~15 remaining artist records via `/admin/artists` (normal admin usage,
   not code).

## 10. Deferred (explicitly out of scope)

- **PDP ISR** (client-island refactor of wishlist/review gating) — revisit
  only if request-time PDP rendering shows up as a real problem; the data
  layer already caches.
- Checkout default-address prefill; profile editing; email verification ON;
  social logins/MFA (P15 carry-overs).
- Operator dashboard / order-management tooling; tags; embedded Square Web
  Payments checkout.
- Production cutover (LAST; live WooCommerce replacement — see the
  dev-first memory).

## 11. Invariants (must hold)

- `SQUARE_ENV=sandbox`; goaffpro canary **0** (`grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0).
- Deploy ONLY via `./scripts/deploy.sh`.
- Unreachable-DB build gate (§4) green — this is the single most load-bearing
  gate of the phase.
- `(account)`/`(admin)` stay `force-dynamic`; the IDOR guard
  (`tests/account/order-detail.test.tsx`) and admin-gate tests stay green.
- `getCurrentUser` interface untouched.
- No new runtime-required-at-build env vars.

## 12. Test strategy (TDD per task)

- Build-guard unit tests: `NEXT_PHASE='phase-production-build'` →
  `getSetting` resolves `null` without touching the DB (spy on the db client).
- Segment-config regression tests: import each touched page module and
  assert its exports (`revalidate === 300`, `dynamic` absent/present as per
  §3) — cheap insurance against someone re-adding the blanket export.
- Settings action test: asserts `revalidatePath('/', 'layout')`.
- Admin nav component test.
- Existing suite (519) stays green; the canon gates from §11.
