# Phase 8 → Phase 9 hand-off

**Status:** Phase 8 **complete**. The public `/shop` listing page is built,
tested, and **live** at `https://dev.animeniacs.shop/shop` (Coolify, Square
sandbox), alongside the two Phase 7.5 cleanups (admin mobile dark-mode fix,
diagnostic env-logging removal). All automated gates green. Tag
`phase-8-shop-listing` applied at the last code commit
`545ffe3` (`545ffe30c9f450064be10e3035dd2c2e6b847d7b`).

This phase shipped **one public feature** (`/shop`) plus **two cleanups**.
No new schema, no new env vars, no Square prod cutover. Square env stays
`sandbox`.

**Date:** 2026-06-08

> **Read me first, master orchestrator:** `/shop` is now live and serving
> the full active Square sandbox catalog as a `ProductCard` grid, with a
> public IP-nickname chip row linking to `/category/<slug>`. The header
> `/shop` link no longer 404s. The IP-never-public constraint holds: the
> page renders product names and IP *nicknames* only — never a raw Square
> category name, never a `CAT_*` id, and it never imports/calls
> `getCategoryNameMap()` (a regression-guard test enforces this). The
> only deploy wrinkle: the git push did **not** auto-trigger a Coolify
> deploy this time — I had to trigger it manually via the Coolify API
> with `force=true`. See §"Plan deviations" deviation 2 and §"How to
> verify".

---

## 1. TL;DR

Phase 8 added a `force-dynamic` server route `/shop` that reads the entire
active Square catalog via a new bulk `getShopProducts()` helper and renders
it as a Tailwind grid of a new shared `ProductCard` component. A row of
public IP-nickname chips at the top links to the existing `/category/[slug]`
pages. IP-leak safety is guaranteed by omission (the page renders no
category labels and never calls `getCategoryNameMap()`), backed by a
regression-guard test.

Two unrelated Phase 7.5 cleanups landed as their own commits: the admin
layout wrapper now sets explicit light colors so admin pages stay legible
in mobile OS dark mode, and the Phase 7.5 startup env-presence diagnostics
were removed from `src/lib/env.ts` and by deleting `src/instrumentation.ts`.

No new features beyond `/shop`. No schema changes. No env-var changes.
**+12 unit tests** (255 → 267). Integration unchanged at 75.

---

## 2. Required reading order

1. **This doc** (`phase-08-handoff.md`) — the `/shop` feature + the two cleanups + the manual-deploy gotcha.
2. **`phase-07.5-handoff.md`** — deployment state, the reverse-proxy/Host traps, force-dynamic requirement, Coolify resource inventory, the diagnostic-logging deferral this phase resolved.
3. **`phase-07-handoff.md`** — the checkout feature set, schema, hard constraints.
4. **`docs/operations/coolify-setup.md`** — the deploy runbook (authoritative for re-provisioning / prod cutover).
5. **`docs/superpowers/plans/2026-06-08-phase-08-shop-listing.md`** + **`docs/superpowers/specs/2026-06-08-phase-08-shop-listing-design.md`** — the Phase 8 plan + design (the "how" and "why").

---

## 3. What Phase 8 shipped (file-by-file)

**Feature — `/shop` (Groups A–B):**

| File | Change | Commit |
|---|---|---|
| `src/lib/square/items.ts` | MODIFIED — appended `getShopProducts()`: bulk, cursor-paginated, no `categoryIds` filter; dedupes by id; archived filter; lowest FIXED_PRICING price; batch image resolve; `localeCompare` sort; wrapped in `unstable_cache(['square-shop-items'], { revalidate: 60 })`. `getItemsByCategoryId` + imports untouched (purely additive). | `3985593` |
| `tests/square/shop-items.test.ts` | NEW — 4 unit tests (projected+sorted, archived filter, paginate+dedupe via cursor, empty). Mocks `@/lib/square/client` + `next/cache` passthrough. | `3985593` |
| `src/components/product/ProductCard.tsx` | NEW — shared public card (image-or-placeholder, name, formatted price) linking to `/product/<id>`. Renders **no** category info. | `a964a8f` |
| `tests/public/product-card.test.tsx` | NEW — 3 unit tests (PDP link + price, "No image" placeholder, em-dash for null price). | `a964a8f` |
| `src/app/shop/page.tsx` | NEW — `export const dynamic = 'force-dynamic'`; `Promise.all([getShopProducts(), getPublicIpNicknames()])`; IP-nickname chip nav (omitted when empty) → `/category/<slug>`; product grid; empty state. | `313cd97` |
| `tests/public/shop-page.test.tsx` | NEW — 5 unit tests incl. the **REGRESSION GUARD** (never renders a raw category name / `CAT_` id). | `313cd97` |
| `src/app/shop/loading.tsx` | NEW — skeleton grid (Next.js convention file). | `97caa96` |
| `src/app/shop/error.tsx` | NEW — `'use client'` error boundary with retry. | `97caa96` |
| `src/components/layout/Header.tsx` | MODIFIED — dropped the `'/shop' as Route` cast (now a real typed route). Other `as Route` casts + the `Route` import left intact. | `3296ba8` |

**Cleanups (Groups D–E):**

| File | Change | Commit |
|---|---|---|
| `src/app/(admin)/layout.tsx` | MODIFIED — the bare `<div>{children}</div>` wrapper now sets `colorScheme:'light', color:'#111', background:'#fff', minHeight:'100vh'` so all admin pages (artists, ip-nicknames, sms-recipients + setup/403 screens) stay legible in mobile OS dark mode. | `57754e0` |
| `src/lib/env.ts` | MODIFIED — removed the Phase 7.5 env-presence/length diagnostic loop; kept schema + `safeParse` + a single `console.error` of zod field-error *names* + throw. | `2044e60` |
| `src/instrumentation.ts` | DELETED — was diagnostic-only; build succeeds without it (no neutering needed). | `545ffe3` |

---

## 4. Plan deviations

1. **`/shop` page marketing copy changed to satisfy the regression guard.**
   The plan provided two verbatim blocks that conflict: the page body copy
   "Browse every **Anime**niacs drop." contains the substring `Anime`, but
   the regression-guard test (kept verbatim) asserts
   `expect(container.textContent).not.toMatch(/Anime/i)` over the rendered
   body. Resolution: kept the test 100% verbatim (it is the critical
   IP-leak invariant enforcer) and changed only the incidental copy — the
   `<h1>` subtitle and `metadata.description` are now **"Browse the full
   collection."** The page `<title>` "Shop | Animeniacs" is unchanged (it
   lives in `<head>`, outside `container.textContent`). No behavioral
   change to data, links, states, or `force-dynamic`.

2. **The git push did NOT auto-trigger a Coolify deploy; I triggered it
   manually via the Coolify API with `force=true`.** After
   `git push origin main`, `/shop` stayed 404 for 10+ minutes and the
   Coolify deployments API showed the latest deployment was still
   `de8492f` (Phase 7.5) — no deployment for the pushed `545ffe3`. The
   auto-deploy webhook did not fire (or was not picked up). Per the
   cross-project "silent staleness" rule I verified the deployed commit
   via the API rather than assuming, then forced a fresh build:
   `GET {COOLIFY_API_BASE}/api/v1/deploy?uuid=h4400cg04wg8www84ggks4sg&force=true`.
   That deploy finished `status=finished commit=545ffe3` and `/shop` went
   200. **Phase 9 should not assume the push alone deploys — verify the
   deployed commit via the API/UI and force a deploy if needed.**

3. **`instrumentation.ts` was deletable as-is (no neutering required).**
   The plan's E2 had a fallback "if the build errors that the file is
   referenced, neuter `register()` instead." Not needed — nothing imports
   it, and `pnpm build` succeeded after `git rm`. Clean delete.

4. **Live smoke `grep` for raw IP names produced a false positive that was
   investigated and cleared.** The plan's §F2 smoke
   `curl … | grep -iE 'Naruto|Anime'` matched the live page — but
   investigation (systematic-debugging) showed every "Naruto" is a Square
   sandbox **product name** rendered in the ProductCard name `<div>`, and
   every "Anime" match is the brand word **"Animeniacs"** (logo/footer/
   title) or the truncated product name "Naruto 25th Anni". **Product
   names are allowed and intended; the constraint forbids only raw
   *category* names and `getCategoryNameMap()`.** Verified clean: no
   `CAT_*` id in the HTML, category links are nickname slugs only
   (`/category/pirates`), `getCategoryNameMap` absent from shop source.
   The §F2 smoke command as written is too broad for a real sandbox that
   contains anime product names — Phase 9 should grep for `CAT_` ids /
   category-label markup, not product-name substrings.

5. **Test count matched the plan exactly: 267 unit** (255 baseline + 4
   `shop-items` + 3 `product-card` + 5 `shop-page`), **75 integration**
   (unchanged). No reconciliation needed.

Minor (not deviations): A1 added one `biome-ignore` comment on the new
`cursor = (search as any).cursor` line to match the file's existing
convention, and accepted biome formatter reflows on the test file.

---

## 5. Hard constraints (verbatim from the Phase 8 plan — all verified in force)

- `grep -rn "goaffpro\|GoAffPro" src/ tests/` stays **0**. (Verified: 0.)
- No new Postgres tables/columns; no schema changes; `SQUARE_ENV` stays
  `sandbox`. (Verified: no migrations, no schema edits, sandbox.)
- `/shop` must NEVER render a raw Square category name and must NEVER call
  `getCategoryNameMap()`. (Verified: regression-guard test green; no
  `getCategoryNameMap` in `src/app/shop/` or `src/components/product/`; no
  `CAT_*` id in live HTML.)
- Existing IP-leak regression tests stay green:
  `tests/public/product-detail-page.test.tsx`,
  `tests/public/category-page.test.tsx`. (Verified: both green, 19 tests
  across the three public-page guard files.)
- `/shop` MUST `export const dynamic = 'force-dynamic'`. (Verified:
  present; build shows `ƒ /shop` dynamic.)

Carried forward from Phase 4/7 (still in force): no affiliate/commission/
GoAffPro anything; no customer PII leaks via IP; Square writes go to
`sandbox` until prod cutover.

---

## 6. Verification state at handoff

**Automated gate (local):**
- **Lint:** `pnpm lint` (biome) → clean (**182 files** — one fewer than the
  183 mid-phase peak because `instrumentation.ts` was deleted; baseline was
  178).
- **Typecheck:** `pnpm typecheck` (tsc --noEmit) → clean.
- **Unit tests:** `pnpm test` → **267 passed** (45 files) — up from 255 (+12).
- **Integration tests:** `pnpm test:integration` → **75 passed** (12 files) — unchanged.
- **Build:** `pnpm build` → clean; route table includes **`ƒ /shop`** (dynamic). **37 route files** (was 36; +1 for `/shop`).
- **Canary:** `grep -rn "goaffpro\|GoAffPro" src/ tests/` → **0**.
- **IP-leak guards:** `tests/public/{product-detail-page,category-page,shop-page}.test.tsx` → all green (19 tests), incl. the new `/shop` regression guard.

**Deploy smoke (live, `https://dev.animeniacs.shop`, built from `545ffe3` via forced Coolify rebuild):**
- `/shop` → **200**.
- First PDP link on `/shop` → `/product/TGHUWYGTZUX3RGZAMJZFO4CD` (present).
- No raw category leak: **no `CAT_*` id** rendered; category links are
  nickname slugs only (`/category/pirates`); `getCategoryNameMap` absent
  from shop source. ("Naruto"/"Animeniacs" on the page are product names /
  the brand word — see deviation 4.)
- Chip target `/category/pirates` → **200** (chip → category flow works).
- PDP `/product/TGHUWYGTZUX3RGZAMJZFO4CD` → **200** (product → PDP flow works).
- `/api/health` → **200** `{"ok":true,...}` (env cleanup + instrumentation deletion did not break boot).
- `/api/webhooks/square` POST `{}` → **401** (signature key still set; no regression).

**Manual visual check (OPERATOR-PENDING):** The §F2 step-3 mobile dark-mode
visual check requires signing into Logto on a phone / mobile-emulated
browser and is operator-assisted — I cannot drive an interactive Logto
sign-in from this environment. The *code* fix is verified (admin tests
pass, build clean, layout wrapper sets `color:#111`/`background:#fff`/
`colorScheme:'light'`). **Operator: please open
`https://dev.animeniacs.shop/admin/{artists,ip-nicknames,sms-recipients}`
on a phone in OS dark mode and confirm dark text on white (not blank).**

---

## 7. What's deferred / Phase 9 candidates

**Carried forward from Phase 7.5 (unchanged):**
- **Promo bar + `/admin/settings`** — site-settings-driven announcement bar edited from a new admin settings page.
- **Abandoned-cart recovery emails via Resend** — `abandoned_carts` rows with `status='pending'` are the input.
- **Refund notifications** — the webhook already subscribes to `refund.created`; wire the handler to fan out Discord/SMS on refunds.
- **Production Square cutover** — env flip (`SQUARE_ENV=production` + prod token) + a prod domain (`animeniacs.shop`) with its own Postgres, Logto callback, and webhook subscription.
- **Monitoring / alerting, CI/CD, automated DB backups** — none exist yet; all manual via Coolify.

**New deferrals introduced by Phase 8:**
- **`/shop` pagination / search / filtering** — the page loads the entire active catalog in one `getShopProducts()` call and renders all cards. Fine for the current sandbox size; add pagination/search before the catalog grows large. (Note: `getShopProducts` paginates the Square *read* via cursor, but the page has no UI pagination.)
- **`batchGet` 1000-object image cap** — `getShopProducts` accumulates all active items then does a single `batchGet` for images; Square's `batchGet` caps ~1000 object ids. Not a problem at current scale (same characteristic as the by-category path), but chunk it if the catalog exceeds that.
- **Refactor the two existing product grids onto `ProductCard`** — `src/app/category/[slug]/page.tsx` and `src/app/artist/[slug]/page.tsx` still have their own inline card markup; they could be migrated to the new shared `ProductCard` for consistency. Deferred to avoid scope creep.
- **Footer "Browse" column / richer `/shop` chrome** — `/shop` currently has a minimal header + chips + grid; no breadcrumb, no sort control, no footer browse links.
- **Auto-deploy reliability** — investigate why the `main` push did not trigger a Coolify deploy (deviation 2); the GitHub→Coolify webhook may need re-binding so Phase 9 doesn't need a manual force-deploy.
- **Mobile dark-mode visual confirmation** — the admin fix is shipped but the live mobile visual check is operator-pending (§6).

---

## 8. Where credentials live

Phase 8 **sourced no new secrets and rotated nothing.** It added/changed
**zero** env vars (local or Coolify). The credential locations are
unchanged from Phase 7.5:

- **Local dev:** `.env.local` (gitignored) — contains every credential the
  build/tests need (`DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `SQUARE_*`,
  `LOGTO_*`, `DISCORD_ORDER_WEBHOOK_URL`, `SMSEDGE_*`,
  `COOLIFY_API_BASE` + `COOLIFY_API_TOKEN_ANIMANIACS_TEAM`,
  `NEXT_PUBLIC_PLAUSIBLE_*`). Never committed.
- **Deployed (dev):** Coolify app `h4400cg04wg8www84ggks4sg` runtime env
  (full matrix in `phase-07.5-handoff.md` §4). Notable live values
  (unchanged): `LOGTO_APP_SECRET=PPBbYgSujGjpSO2ElistafZwabYE9ktb`
  (rotated in 7.5; any `xU0yUgaQ…` is dead), Square webhook sub
  `wbhk_ffebd0a703d14b3b8e0c227c107853f8`, location `L1T00JYXSKVM3`.
- **Coolify API (used this phase to force the deploy):** base
  `COOLIFY_API_BASE=https://empower.relentnet.com`, token
  `COOLIFY_API_TOKEN_ANIMANIACS_TEAM` (Sanctum `NN|…` format) — both live
  in `.env.local` only, never in git. App UUID
  `h4400cg04wg8www84ggks4sg`, server UUID `z0sg4ogw4ossg4880080ws8k`,
  Postgres UUID `j4o0k0840c40w4k088gws04c`. Tip: read these from
  `.env.local` with `grep '^KEY=' .env.local | cut -d= -f2-` rather than
  `source`-ing the file — `source` chokes on multi-line/special-char
  values in it.
- **Leftover `GOAFFPRO_*` / `SQUARE_PROD_ACCESS_TOKEN`** in `.env.local`
  are expected, slated for the final-phase credentials cleanup sweep — NOT
  used here; goaffpro runtime canary stays 0.

---

## 9. How to verify this hand-off is correct

Before starting Phase 9, the next agent should run:

```sh
# Repo at the tagged commit
git fetch --tags
git rev-parse phase-8-shop-listing      # 545ffe30c9f450064be10e3035dd2c2e6b847d7b
git checkout main && git pull

# Automated gate
pnpm install
pnpm lint                               # clean (182 files)
pnpm typecheck                          # clean
pnpm test                               # 267 passed
pnpm test:integration                   # 75 passed
grep -rn "goaffpro\|GoAffPro" src/ tests/   # 0
grep -rn "getCategoryNameMap" src/app/shop/ src/components/product/  # nothing

# Build proves the /shop route + force-dynamic
pnpm build | grep '/shop'               # "ƒ /shop" (dynamic)

# Live deploy (built from 545ffe3 via forced Coolify rebuild)
curl -s -o /dev/null -w '%{http_code}\n' https://dev.animeniacs.shop/shop        # 200
curl -s https://dev.animeniacs.shop/shop | grep -o '/product/[A-Z0-9]*' | head -1 # a PDP link
curl -s https://dev.animeniacs.shop/shop | grep -oE 'CAT_[A-Z0-9]+' || echo "no CAT_ id (good)"
curl -s -o /dev/null -w '%{http_code}\n' https://dev.animeniacs.shop/category/pirates  # 200
curl -s https://dev.animeniacs.shop/api/health   # 200 ok:true
```

**Deploy gotchas:** If `/shop` is 404 or the live HTML lacks a Phase 8
marker, the push likely did **not** trigger a deploy (deviation 2). Verify
the deployed commit via the Coolify deployments API
(`GET {COOLIFY_API_BASE}/api/v1/deployments/applications/h4400cg04wg8www84ggks4sg?take=5`,
Bearer `COOLIFY_API_TOKEN_ANIMANIACS_TEAM`) and force a fresh build with
`GET {COOLIFY_API_BASE}/api/v1/deploy?uuid=h4400cg04wg8www84ggks4sg&force=true`.
Do **not** grep the live `/shop` HTML for product-name substrings like
"Naruto"/"Anime" to test for IP leaks — those are legitimate product names
and the brand word; grep for `CAT_*` ids / category-label markup instead
(deviation 4). The operator should still do the manual mobile dark-mode
visual check on the admin pages (§6).
