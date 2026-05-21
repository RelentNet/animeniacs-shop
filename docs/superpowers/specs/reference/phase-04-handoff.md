# Phase 4 → Phase 5 hand-off

**Status:** Phase 4 closed. Tag `phase-4-artist-system` at commit `146587c`.
This document is the source of truth for the next agent picking up Phase 5
(or any later phase). Read it end-to-end before opening any code.

**Date:** 2026-05-21

---

## TL;DR

Phase 4 replaced the originally-planned GoAffPro runtime integration with
an in-house artist system. A new Postgres `artists` table joins to Square
catalog items via `squareCategoryId`. A Logto-gated `/admin/artists`
admin area shipped. Public read paths `/artist`, `/artist/[slug]`, and a
PDP artist-meta component are live. 15 artists are seeded in the local DB.
**All 10 acceptance criteria pass.**

What Phase 5 picks up: the PDP itself. The route exists (`/product/[id]`)
but it intentionally 404s — there's no product-fetch path wired yet, no
variant picker, no gallery, no add-to-cart. The artist-meta component is
ready to drop in; Phase 5 builds everything around it.

---

## Required reading order

Before touching any code:

1. **This document** front-to-back.
2. `docs/superpowers/specs/2025-05-13-animeniacs-shop-design.md` — sections
   §3, §4, §5, §11, §13 carry deprecation banners; the **unbanned sections
   still stand**. §5 ("Product Detail Page") in particular is most of
   Phase 5's spec.
3. `docs/superpowers/plans/2026-05-15-phase-04-artist-system.md` — the
   plan we just executed. The "Decisions captured" section at the bottom
   has six locked decisions that survive Phase 5.
4. `docs/superpowers/specs/reference/artist-system-handoff.md` — the
   Phase 4 design brief. Most of its constraints are still active.
5. `docs/operations/credentials-inventory.md` — every credential, where
   it lives, what it's for, and what cleanup is deferred to end-of-project.
6. `docs/operations/logto-setup.md` — how Logto is wired (you'll likely
   need it for any new admin routes).

---

## What Phase 4 actually shipped

### Code

| File / area | What it does |
|---|---|
| `src/lib/db/schema.ts` — `artists` table | UUID PK, unique slug, CHECK on status, btree index on `square_category_id`, numeric(5,4) `commission_rate` default 0.2000, with-timezone timestamps. Migration `0009_married_rawhide_kid.sql` applied. |
| `src/lib/db/queries/artists.ts` | 7 query helpers (getActiveArtists, getArtistBySlug, getArtistByCategoryId, getArtistById, createArtist, updateArtist, setArtistStatus, getAllArtists). All Zod-validated. 12 integration tests. |
| `src/lib/square/categories.ts` | Cached helpers: `listCategoriesFromSquare`, `getArtistSubCategories`, `getCategoryNameMap`, `getArtistParentCategoryId`. 5-min `unstable_cache`. **Parent id is discovered by name + null-parent at runtime**, not hardcoded — sandbox mirror produces different ids than prod. |
| `src/lib/square/items.ts` | **NEW** `getItemsByCategoryId(categoryId): ArtistProduct[]`. 60s cached. Used by `/artist/[slug]`. Will likely be reused by `/shop` filtering in a later phase. |
| `src/lib/square/types.ts` | `CachedProduct`, `CachedVariation`, `CachedMoney`. Dead Phase 3 constants culled in Task A.0. Phase 5's PDP will likely extend `CachedProduct`. |
| `src/lib/logto.ts` | `logtoConfig` + `isLogtoConfigured()`. Single source for the Logto SDK. |
| `src/lib/images/upload.ts` | `saveAvatar(file, slug)` — validates MIME + size, resizes via sharp to 500x500 webp, writes to `public/images/artists/`. Used by admin form. |
| `src/app/(admin)/layout.tsx` | Admin auth gate. Renders setup-required screen / 307 to /sign-in / 403 / children, by Logto state. 5 unit tests cover all branches. |
| `src/app/(admin)/admin/artists/*` | List, new, [id] (edit) pages + server actions + shared client form + Square category picker. 15 unit tests. |
| `src/app/artist/page.tsx` | Public gallery. Grid of all active artists. |
| `src/app/artist/[slug]/page.tsx` | Per-artist profile. Header + bio + socials + product grid via `getItemsByCategoryId`. Empty-state when no items match. 10 unit tests. |
| `src/app/product/[id]/page.tsx` | **PHASE 5 STUB.** Currently 404s. Has a `void ArtistMetaLine` import to prove the binding compiles. Phase 5 replaces the body with real product fetch + full PDP layout. |
| `src/components/product/ArtistMetaLine.tsx` | "Designed by [Artist]" + Instagram icon component. Takes a `categoryIds: string[]` prop. **Phase 5's PDP renders this with the product's actual category list.** 8 unit tests, including a regression guard against IP name leakage. |
| `src/app/sign-in/route.ts`, `src/app/callback/route.ts`, `src/app/sign-out/route.ts` | Minimal OIDC route handlers. Spec'd for Phase 7 in the design doc but shipped early because B.1's gate needs them to actually log in. |
| `scripts/square-cleanup/archive-graveyard-skus.ts` | One-shot script (`pnpm sq:archive-graveyard`). Already applied to production: 30/30 graveyard SKUs archived 2026-05-21. Audit logs in `cleanup-audit/`. |

### Infrastructure (Coolify)

- **Logto** running standalone on Coolify at `https://auth.animeniacs.shop`
  (user-facing) and `https://auth-admin.animeniacs.shop` (admin console).
  Uses its own embedded postgres, isolated from app data.
- **Plausible** running on Coolify at `https://analytics.relentnet.dev`.
  Centralized across all your sites; not per-project. Will receive a
  `<script>` tag from Phase 5+ when you wire the env vars.
- **The animeniacs-shop project's `compose.yml` only runs `app` + `postgres`** now.
  Logto and Plausible were both removed from local compose; they live in
  the Coolify-hosted services.

### Database

- 15 active artist rows in local Postgres (14 partner artists + 1 in-house
  "Animeniacs Studios" for commissioned work).
- Schema also still has all the Phase 2 tables (`site_settings`,
  `event_logos`, `sms_recipients`, `wishlists`, `reviews`,
  `abandoned_carts`, `customer_link`, `product_cache`, `order_log`).
- One database (`animeniacs`) on the local Postgres; the previously-shared
  `logto` and `plausible` databases were dropped after the services moved
  to Coolify.

### Operational

- **15 Artist sub-categories** in Square production. Names:
  Animeniacs Studios, Bxnny.Arts, Doodlebob, Dr.Dude2099, MariosDal,
  MemoryShop, Merc Da Artist, Neon Gauntlets, Noah.TheArtist, OpalisArt,
  PencilerProject, sarudrawss, Sketched_Reality, Tepidzeal, ZYBB HORN.
- **30 graveyard SKUs archived** in production (sandbox-rehearsed first).
- **GoAffPro subscription** still active. Plan was "cancel after launch";
  do it whenever — runtime no longer reads from it.

### Documentation

- `docs/operations/logto-setup.md` — Logto bootstrap walkthrough.
- `docs/operations/commission-payouts.md` — monthly manual workflow.
- `docs/operations/credentials-inventory.md` — every credential + cleanup
  checklist for end-of-project.
- `docs/superpowers/specs/reference/phase-04-handoff.md` — this file.

---

## Plan deviations Phase 5 should know about

These survived Phase 4 and remain true going forward. Don't re-litigate
unless there's new information.

### 1. Two new vendor deps, not one

Phase 4 plan locked "only `sharp`". Reality:
- **`sharp`** — added for avatar resize (B.2.2). As planned.
- **`@logto/next`** — added because B.1 literally requires `getLogtoContext()`.
  The design spec §10 documented `@logto/next` but no prior phase had
  actually installed it.

Phase 5 should expect to add at most a handful of new deps if the PDP
needs them (e.g., a carousel library for the image gallery). Stay
disciplined — no auth SaaS, no analytics replacement, no commission
engine, no CMS.

### 2. Logto + Plausible run on shared Coolify infrastructure

The original design spec had both in this project's compose. Both moved to
Coolify as standalone services during Phase 4:

- **Logto** at `auth.animeniacs.shop` (Coolify project `website`, service
  uuid `fwkok848g80gwo4w0ccgo44s`).
- **Plausible** at `analytics.relentnet.dev` (Coolify project `Plausible`,
  service uuid `t8okwogw8gggoowk4gwss4sg`).

`compose.yml` only runs `postgres` and `app` now. Don't put Logto or
Plausible back in `compose.yml`.

### 3. IP categories must NEVER be public

Locked Decision 2026-05-15 (Phase 4 session, captured in chat with the
operator). Reason: CAD risk from licensed IP names. Implications:

- The PDP's `<ArtistMetaLine />` component ONLY renders the artist match;
  it never renders IP / non-artist category names. There's a regression
  test for this (`tests/public/artist-meta-line.test.tsx` — the
  "does NOT render IP / category names anywhere" case).
- Phase 5's PDP must NOT add breadcrumb pills showing IP category names.
- Phase 5's `/shop` filter UI (if it adds one) must NOT expose IP names
  as filter labels.
- If you ever need to show themed IP names publicly later, build a
  separate name-mapping mechanism (per chat: probably a JSON file or a
  new tiny `ip_public_names` table). The Square category name is staff-
  facing only.

### 4. Env-config: empty strings treated as undefined

`src/lib/env.ts` has an `emptyToUndefined` preprocessor on every optional
field. This means `FOO=` in `.env.local` is treated as `FOO` being unset.
Fixed a class of test failures during Phase 4. Keep this pattern.

### 5. Vitest `testTimeout: 15_000`

Bumped from default 5s because cold-start vitest environment setup can
eat 4+ seconds on a busy machine, causing sporadic flake. Don't lower it.

### 6. Sandbox Artist parent ID differs from production

`pnpm sq:mirror` doesn't preserve catalog object IDs across environments.
The `Artist` parent category in production has id `B6I2KLCRDEHSF6XHODMNSG6P`;
in sandbox it's `73TDV4ACNYMCZ4G3E7XONXSE` (as of 2026-05-15). Don't
hardcode either. `getArtistSubCategories()` discovers the parent at
runtime by `name === 'Artist' && parentCategoryId === null`.

### 7. Logto secret with `#` prefix needs quoting in `.env.local`

Logto's app secrets start with `#internal:` for Traditional apps.
Dotenv would treat the `#` as a comment marker without quotes:

```
LOGTO_APP_SECRET="#internal:46hPRrNNh7LmmdnafYV1aZZbaIf4DAAJ"
```

Without quotes, the value parses as empty → `isLogtoConfigured()` returns
false → the admin gate shows "Logto not yet configured" instead of
attempting auth. Phase 5 won't touch this, but if you ever rotate the
secret, remember to quote it.

---

## Hard constraints (still in force)

These come from the Phase 4 plan + operator's locked decisions. Any future
phase must respect them unless explicitly amended.

1. **No GoAffPro at runtime.** Anywhere. `grep -rn "goaffpro\|GoAffPro" src/ tests/` must always return zero. The probe script under
   `scripts/goaffpro/probe.ts` is preserved as historical reference only;
   it's not invoked by anything.
2. **No `artist` Square custom attribute definition.** Square `categories[]`
   carries this signal now.
3. **No new auth vendors.** Reuse the existing Logto + the `(admin)` route
   group pattern. If Phase 5 needs additional admin pages, drop them under
   `src/app/(admin)/admin/<thing>/` — they inherit the auth gate for free.
4. **No commission engine.** Manual monthly Square dashboard reporting
   per `docs/operations/commission-payouts.md`. The `commission_rate`
   column is a reference value, not driving any code path.
5. **No additional Postgres tables for affiliate / commission tracking.**
   Plan E.4 explicitly rejected `affiliates`, `commission_reports`,
   `attribution_*`, `clicks` etc.
6. **Sandbox-first for any production write.** Established by the Square
   cleanup scripts and reaffirmed by Phase 4's C.4 archival. Apply the
   same discipline if Phase 5 ever needs to write to the Square catalog.
7. **IP categories never public.** Repeated from §3 above because it's
   the easiest constraint to accidentally violate.

---

## What's deferred (NOT Phase 4 scope, NOT necessarily Phase 5 scope either)

| Item | Status | When |
|---|---|---|
| **Plan C.3** — re-categorize the 229 production items into their artist + IP categories in Square | Operator's task, dashboard-only | Whenever. As items get re-categorized, `/artist/[slug]` product grids auto-populate within 60s (cache TTL). |
| **Avatar uploads per artist** | Operator's task via admin UI | Whenever. Current state: all 15 artists have `avatar_url = NULL` and render with initials placeholder. |
| **GoAffPro subscription cancellation** | Operator's task in GoAffPro dashboard | Whenever. Runtime no longer reads from it. |
| **Credentials cleanup sweep** | Final phase | All Phase 4-era short-lived credentials (Coolify API tokens, Logto M2M, phoenix temp password) are still in `.env.local` per the operator's "defer to last phase" decision. See `docs/operations/credentials-inventory.md` end-of-project checklist. |

---

## Where credentials live

**TL;DR: every credential is in `.env.local` (gitignored).** Inventory + cleanup plan in
`docs/operations/credentials-inventory.md`.

Phase 5 will likely need:
- `SQUARE_ACCESS_TOKEN` (sandbox) — already set
- `SQUARE_PROD_ACCESS_TOKEN` — already set
- `SQUARE_WEBHOOK_SIGNATURE_KEY` — **not yet set**; gets generated when
  the webhook subscription is created in the Square dashboard (Phase 3
  Task 11 covers the procedure, never finished)
- `LOGTO_*` for any new admin routes — already set
- `COOLIFY_API_TOKEN_ANIMANIACS_TEAM` — already set, if Phase 5 wants to
  deploy a `dev.animeniacs.shop` staging instance

Coolify resource UUIDs (in case Phase 5 deploys the Next.js app there):
- Server `animaniacs-shared-host`: `z0sg4ogw4ossg4880080ws8k`
- Project `website` (where Logto lives): `q4gso4kow0k08gowc4g40ww4`
- (DNS for `dev.animeniacs.shop` already points to Coolify host `5.161.88.222`.)

Logto app redirect URIs already include all three environments:
`http://localhost:3000/callback`, `https://dev.animeniacs.shop/callback`,
`https://animeniacs.shop/callback`. No Logto reconfiguration needed for
Phase 5.

---

## Phase 5 scope (suggested, not locked)

The design spec §5 has the full PDP layout. The main deliverables are:

1. **Product fetch** — `getProductById(id)` that reads from
   `product_cache` (Phase 2 table) with a fallback to live Square. Phase 3
   shipped the cache table and the sync scaffolding but didn't wire the
   read path. Probably belongs in `src/lib/products/cache.ts` per the
   Phase 3 plan.
2. **PDP layout** — replace the `notFound()` in
   `src/app/product/[id]/page.tsx` with the real implementation:
   - Breadcrumbs (without IP names — see hard constraint §7)
   - Image gallery
   - Variant picker (size, material) from the cached variations
   - Price display from the variation
   - Add-to-cart button (or stub if cart is a later phase)
   - Description (sanitized HTML)
   - `<ArtistMetaLine categoryIds={product.categoryIds} />` already exists
     and is unit-tested. Drop it in.
   - Reviews section (Phase 2 schema is ready; UI is Phase 5+)
   - Recently-viewed (localStorage-backed per design spec §6.3)
   - Related products (now driven by shared `squareCategoryId` per the
     2026-05-15 amendment to spec §5 item 15 — NOT by `sibling_group`
     custom attribute, which was dropped)
3. **Webhook handler** — `app/api/webhooks/square/route.ts` for
   `catalog.version.updated` so price/availability changes invalidate
   the product cache. Phase 3 Plan Tasks 9-11 cover this; never shipped.
4. **`pnpm square:sync`** — backfill script. Phase 3 Plan Task 8;
   never shipped.

Phase 5 plan likely needs to cherry-pick from Phase 3's unfinished tasks
(Tasks 4, 6, 7, 8, 9, 10, 11, 12) rather than re-spec from scratch.
Read Phase 3's plan + amendment first.

---

## Verification state at handoff

- `pnpm lint`: clean (92 files)
- `pnpm typecheck`: clean
- `pnpm test`: 63/63 passing
- `pnpm test:integration`: 40/40 passing
- `pnpm build`: clean (21 routes generate)
- Git tag `phase-4-artist-system` at `146587c`
- HEAD at `b642e5c` (one commit ahead: the credentials inventory)
- Local DB: 15 active artist rows
- Production Square: 15 artist sub-categories, 30 graveyard SKUs archived
- Coolify-hosted services healthy: Logto + Plausible
- Operator has signed into `/admin/artists` successfully

---

## How to verify this hand-off is correct

Before starting Phase 5 work, the next agent should run:

```sh
# Confirm we're at the right commit
git describe --tags --abbrev=0       # → phase-4-artist-system
git rev-parse HEAD                    # → b642e5c... or descendant

# Confirm green baseline
pnpm lint && pnpm typecheck && pnpm test

# Confirm DB state
docker exec animeniacs-postgres psql -U animeniacs -d animeniacs \
  -c "SELECT count(*) FROM artists WHERE status='active';"
# Should print: 15

# Confirm artist pages render
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/artist
# Should print: 200 (if dev server is up)
```

If any of those fail, stop and investigate before touching Phase 5 code.
The baseline state is part of the contract.
