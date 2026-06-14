# Phase 16 → Phase 17 hand-off

**Status:** Phase 16 **shipped + deployed to dev + verified as far as automation
allows.** Rendering/caching pass complete; the "activation" verification legs
(V1–V7) that need a human in a browser are DEFERRED to the operator (see §6).
Tag `phase-16-caching-activation` at the final commit (`b2aafe3`).

**Date:** 2026-06-14

> Master ran this phase autonomously (operator away): launched a background
> execution session for the code, verified the diff + gates, deployed to dev
> via `./scripts/deploy.sh`, and probed live. No schema changes → no migrations.
> `SQUARE_ENV` stays `sandbox`; goaffpro canary stays **0**.

---

## 1. TL;DR

Dropped the blanket `force-dynamic` from the root layout and gave the catalog
the correct rendering mode per route, with build-time DB tolerance so the
Docker builder never touches Postgres. Also added the operator-requested admin
back-link and investigated the abandoned-cart cron trigger.

**Live proof on dev (`x-nextjs-cache` / `Cache-Control`):**
- `/` → HIT, `s-maxage=31536000` (**fully static**)
- `/artist` → HIT, `s-maxage=300, stale-while-revalidate` (**ISR-300**)
- `/shop` → no cache, `private, no-store` (**stays dynamic** — branches on searchParams)

This is exactly the spec §3 decision table.

## 2. What shipped (commit-by-commit, all on `main`)

| Commit | Task | Change |
|---|---|---|
| `c75b4bb` | 1 | **Build-phase guard in `getSetting`** — returns `null` during `NEXT_PHASE==='phase-production-build'` before constructing the cache or touching `db`. PromoBar already renders nothing for `null`; the first runtime regen fills it in. Mirrors the `auth.ts` idiom. Tests: `tests/db/site-settings-build-guard.test.ts`. |
| `0a0e7b9` | 2 | **Dropped root `force-dynamic`** (`src/app/layout.tsx`) — build tolerance now lives in the data layer. Also dropped `force-dynamic` from `/orders/lookup` (page is static; its DB read is in a server action). |
| `e3755c1` | 3 | **ISR `revalidate=300`** on `/artist` (with a build-phase empty-state guard on its `getActiveArtists` read), `/artist/[slug]`, `/category/[slug]`. NO `generateStaticParams` on the slug pages → builder prerenders nothing → never hits the DB at build. `/shop` + `/product/[id]` intentionally untouched (spec §3). |
| `a72f8aa` | 4 | **`revalidatePath('/', 'layout')`** in the promo-bar save action (was `'/'` only) so a promo edit busts the bar across the now-ISR'd catalog pages, not just home. Test: `tests/admin/settings-action.test.ts`. |
| `b2aafe3` | 5 | **Slim admin header with "← Admin home"** on every `(admin)` page (operator request). `(admin)/layout.tsx` KEEPS its `force-dynamic`. Test: `tests/admin/layout-auth.test.tsx`. |

New regression net: `tests/app/segment-config.test.ts` pins each route's
rendering mode (incl. asserting `/shop` keeps `force-dynamic`) so nobody
silently re-adds the blanket export.

## 3. Verification state (all green)

- **Typecheck:** clean.
- **Unit tests:** **539 passed** (92 files; was 519 → +20 from the new
  build-guard / segment-config / settings-action / admin-nav tests). No flake
  this run.
- **Unreachable-DB build gate:**
  `DATABASE_URL=…@unreachable-host… corepack pnpm exec next build` →
  `✓ Compiled successfully`, `✓ Generating static pages (40/40)`,
  **0 ENOTFOUND/ECONNREFUSED**. (Exits 1 only on the known Windows
  `EPERM: symlink` standalone-copy step AFTER compile — Linux Docker exits 0.)
  This proves all 40 pages prerender without a DB.
- **Canary greps:** `logto`=0, `goaffpro`=0.
- **Deploy:** `./scripts/deploy.sh` → deployment `a48kkog8s4o80ccosgkkogsc`
  `finished`. Live probes: `/api/health`,`/`,`/shop`,`/artist`,`/sign-in`,
  `/orders/lookup` → 200; `/admin`,`/account` → 307. ISR headers per §1.

## 4. Task 6 — abandoned-cart cron (NOT fully wired; needs operator UI)

The route (`/api/cron/abandoned-carts`, secured by `x-cron-secret`) works and
`CRON_SECRET` is set in Coolify + `.env.local`. **The Coolify scheduled-task
API is NOT exposed on this version** (both `…/applications/{uuid}/scheduled-tasks`
and `…/scheduled-tasks?uuid=` return 404), so the trigger can't be created via
API. **Operator UI step (Coolify → app `animeniacs-shop-dev` → Scheduled Tasks
→ Add):**
- **Name:** `abandoned-cart-reminders`
- **Frequency (cron):** `*/15 * * * *`
- **Container:** the app service
- **Command:**
  `node -e "fetch('http://localhost:3000/api/cron/abandoned-carts',{method:'POST',headers:{'x-cron-secret':process.env.CRON_SECRET}}).then(r=>r.json().then(j=>{console.log(r.status,JSON.stringify(j));if(!r.ok)process.exit(1)}))"`

Manual test any time (from a workstation):
`curl -X POST -H "x-cron-secret: <CRON_SECRET from .env.local>" https://dev.animeniacs.shop/api/cron/abandoned-carts`
→ expect `{"processed":N}`. The email leg needs Resend (§6).

## 5. Plan deviations

- **Task 6 not committable** — pure Coolify infra, no repo change; downgraded to
  a documented operator UI step (above) because the API doesn't expose it.
- Everything else matched the plan exactly; no code deviations.

## 6. ⚠️ Operator-pending (DEFERRED — batched for the end-of-run review)

1. **Live verification V1–V7** (needs a browser / sandbox purchase): auth
   walkthrough; sandbox purchase → webhook → order → receipt; reviews-with-photo
   (persist across redeploy); refund + fulfillment state changes; guest order
   lookup; abandoned-cart cron end-to-end; promo-edit propagation timing.
2. **Resend** (`RESEND_API_KEY` + `RESEND_FROM_EMAIL`) — unblocks the email legs
   of V2/V4/V6 + password reset. Still empty in Coolify.
3. **Wire the cron scheduled task** (§4 UI steps).
4. **Decommission the standalone Logto deployment** (`auth.animeniacs.shop`).
5. **Artist data entry** — repoint merc to its 61-item category; create the
   remaining ~15 artist records via `/admin/artists`. (The `/artist` empty-state
   on dev is correct until then.)

## 7. Phase 17+ candidates

- **Operator tooling** — admin order list / detail / fulfillment-status updates /
  refund issuance / a lightweight dashboard. The next clearly-buildable phase;
  the `getSquareCustomer`/refund helpers orphaned in Phase 15 can be reused.
- Tags; engagement follow-ons; checkout default-address prefill; email
  verification ON; profile editing.
- **Deferred decision:** Brandon's embedded Square Web Payments checkout (opt-in).
- **LAST:** production cutover — a live WooCommerce-site replacement; operator-gated, never autonomous.
