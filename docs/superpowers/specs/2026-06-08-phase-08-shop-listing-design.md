# Phase 8 design — `/shop` listing page + two cleanups

**Status:** Approved design (brainstorm complete). Ready for plan.
**Date:** 2026-06-08
**Author:** 3rd master orchestrator (brainstorm stage)
**Phase:** 8
**Baseline:** tag `phase-7.5-first-deploy`, HEAD `5b52960`. Verified green
before brainstorm: lint clean (178 files), typecheck clean, 255 unit +
75 integration passing, goaffpro canary 0, `https://dev.animeniacs.shop/api/health`
→ 200, webhook → 401.

---

## 1. Summary

Phase 8 builds the missing public **`/shop` listing page** — the header
"Shop" link currently 404s and PDPs are only reachable via direct
`/product/<id>` URLs, so a real visitor has no way to browse the
catalog. `/shop` lists **every active (non-archived) Square product**
via a new bulk catalog read, renders them as a responsive grid of cards
linking to PDPs, and surfaces a row of **public IP-nickname browse
chips** that link to the existing `/category/[slug]` pages (which today
nothing links to). Two low-risk cleanups are folded in: the admin
mobile dark-mode fix and removal of the Phase 7.5 diagnostic
env-logging.

This phase adds **zero new credentials**, **zero new Postgres tables**,
and **zero schema changes**. It is a public-storefront feature plus two
maintenance fixes, all verifiable against the existing live deploy.

### Operator decisions locked during brainstorm

1. **Primary feature:** `/shop` listing page.
2. **Product visibility:** show **every active product** (bulk Square
   read), not only curated/categorized products.
3. **IP-nickname navigation:** **chips at the top of `/shop`**, public
   IP nicknames **only** (artist categories excluded — `/artist` is
   their hub).
4. **Fold in both quick-win cleanups:** admin mobile dark-mode fix +
   diagnostic env-logging removal.

---

## 2. Hard constraints (carried forward — NEVER violate)

Restated from the Phase 4/7/7.5 handoffs; all still in force:

1. **No GoAffPro / affiliate / commission code at runtime.**
   `grep -rn "goaffpro\|GoAffPro" src/ tests/` must stay **0**.
2. **No `artist` Square custom attribute definition.** Artists resolve
   via the local `artists` table by `squareCategoryId`.
3. **No new auth vendors.** Reuse Logto + the `(admin)` route group.
4. **No commission engine.**
5. **No additional Postgres tables for affiliate/commission tracking.**
   Phase 8 adds **no tables and no columns**.
6. **Sandbox-first.** Everything stays `SQUARE_ENV=sandbox`; Phase 8
   does NOT flip prod.
7. **IP categories never public via their literal Square name.** The
   two existing regression tests
   (`tests/public/product-detail-page.test.tsx`,
   `tests/public/category-page.test.tsx`) must stay green. **Phase 8
   adds a third guard** for `/shop` (see §6).

---

## 3. Architecture

### 3.1 New route

- **`src/app/shop/page.tsx`** — async server component.
  `export const dynamic = 'force-dynamic'` is **required**: the page
  reads Square (and indirectly DB via `getPublicIpNicknames`) at request
  time, and Coolify's build-time env only includes `is_buildtime=true`
  vars, so a static-prerender pass would crash exactly as it did for
  four routes in Phase 7.5 (deviation 6). Mirror `/artist`'s
  `dynamic = 'force-dynamic'` + static `metadata` object.
- **`src/app/shop/loading.tsx`** — skeleton grid (`animate-pulse`
  cards), mirroring `src/app/category/[slug]/loading.tsx`.
- **`src/app/shop/error.tsx`** — `'use client'` error boundary with a
  Try-again button, mirroring `src/app/category/[slug]/error.tsx`.

### 3.2 Product enumeration — bulk Square read

Add **`getShopProducts(): Promise<ArtistProduct[]>`** to
`src/lib/square/items.ts`, reusing the existing `ArtistProduct` shape
and projection pipeline already proven in `getItemsByCategoryId`:

```ts
export interface ArtistProduct {
  id: string
  name: string
  imageUrl: string | null    // first image URL
  priceCents: number | null  // lowest FIXED_PRICING variation, cents USD
  categoryIds: string[]      // used for NOTHING on /shop (see §6)
}
```

`getShopProducts()` behavior:

1. Call `client.catalog.searchItems({ limit: 100 })` with **no
   `categoryIds`** — paginate via the response `cursor` until exhausted.
2. Filter out archived/deleted items (same filter as
   `getItemsByCategoryId`).
3. Batch-fetch IMAGE objects; take the first image URL per item.
4. `priceCents` = lowest `FIXED_PRICING` variation in cents.
5. Dedupe by `id` (defensive); sort alphabetically by `name`.
6. Wrap in `unstable_cache([...], ['square-shop-items'], { revalidate: 60 })`
   — same 60s TTL as the by-category path.

Result: **every active (non-archived) Square item** appears on `/shop`,
regardless of category or `ip_nicknames` state.

> **Implementation latitude for the execution agent:** the bulk read is
> the locked approach. If `searchItems` with no `categoryIds` proves
> unworkable in this SDK version (e.g. it requires a filter), the
> execution agent may instead use the appropriate catalog list/search
> primitive that returns all `ITEM` objects, as long as the result is
> the same `ArtistProduct[]` of every active item. Do not silently fall
> back to a curated subset — that would violate locked decision #2.

### 3.3 IP-nickname browse chips

At the top of `/shop`, above the product grid, render a row of chips —
one per **public** IP nickname from `getPublicIpNicknames()`
(`src/lib/db/queries/ip-nicknames.ts`). Each chip renders the public
`nickname` and links to `/category/${slug}`. This is the first public
navigation to the `/category/[slug]` pages (previously the operator
hand-shared URLs). Artist categories are **not** listed.

- Chips render the **public nickname only** — never
  `getCategoryNameMap()`.
- If `getPublicIpNicknames()` returns `[]`, omit the chip row entirely
  (no empty container).

---

## 4. UI & components

### 4.1 Page layout

Container `<div className="mx-auto max-w-6xl px-4 py-8">` (matches
`/artist`). An `<h1>` "Shop". Then the chip row (§3.3), then the product
grid `grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4`. Tailwind v4
utilities only — no CSS module (matches repo convention; CSS modules are
used only by `MockupGallery` and `CartDrawer`).

### 4.2 Shared `ProductCard` component

Extract the product-card markup (currently duplicated between
`/category/[slug]` and `/artist/[slug]`) into
**`src/components/product/ProductCard.tsx`**, taking an `ArtistProduct`:

- `next/image` (600×900, `aspect-[2/3]`) with a "No image" placeholder
  fallback.
- Name.
- Price: `$${(priceCents / 100).toFixed(2)}`, or `—` when `priceCents`
  is `null`.
- Whole card wrapped in `<Link href={`/product/${id}`}>`.

`/shop` uses `ProductCard`. **Refactoring `/category/[slug]` and
`/artist/[slug]` to use it is OPTIONAL** (execution agent's discretion —
nice cleanup, not required scope). Do not let it expand the phase.

### 4.3 States (all three required)

- **Loading** — `loading.tsx` skeleton grid.
- **Error** — `error.tsx` client boundary, Try-again button.
- **Empty** — `<EmptyState>` box (`rounded-lg bg-gray-50 p-8 text-center`):
  "No products available yet — check back soon." This is real: the
  operator's **local** dev DB/Square cache may be empty while the live
  deploy has data, so the empty state must render cleanly.

### 4.4 Header link

In `src/components/layout/Header.tsx`, drop the `'/shop' as Route` cast
once `src/app/shop/page.tsx` exists — `experimental.typedRoutes` makes
`/shop` a valid typed route, so the cast becomes unnecessary.

---

## 5. The two cleanups

### 5.1 Admin mobile dark-mode fix (single point)

**Bug:** `(admin)/layout.tsx`'s wrapper `<div>` (wraps every admin page
+ the auth/403/setup screens) sets no explicit colors, so a mobile
browser honoring OS dark mode renders dark-on-dark → blank text. The
`/admin` hub was fixed per-page in Phase 7.5; the three feature pages
(`/admin/artists`, `/admin/ip-nicknames`, `/admin/sms-recipients`) were
not.

**Fix (one place):** add to the `(admin)/layout.tsx` wrapper `<div>`
style: `colorScheme: 'light'`, `color: '#111'`, `background: '#fff'`,
`minHeight: '100vh'`. This fixes all three feature pages AND the
setup/403 screens at once. The hub's per-page override
(`src/app/(admin)/admin/page.tsx`) then becomes redundant — leaving it
or removing it is cosmetic (execution agent's call).

### 5.2 Remove diagnostic env-logging

- **`src/instrumentation.ts`** — delete the file entirely. It exists
  only for the Phase 7.5 startup env diagnostic; nothing else lives
  there. (If Next.js requires the file to exist, reduce `register()` to
  a no-op instead — but deletion is preferred.)
- **`src/lib/env.ts`** — remove the diagnostic block (the `diagKeys`
  presence/length loop and its `console.error` calls). **Keep** the
  `envSchema`, the `safeParse`, the
  `throw new Error('Invalid environment configuration')`, and
  `export const env = parseEnv()`. The failure path collapses to: if
  not valid, throw the generic error. (Optionally keep a single
  non-diagnostic `console.error` of the zod field errors, but the
  presence/length loop must go.)

---

## 6. IP-leak safety (load-bearing for this phase)

Because `/shop` now shows **every** active product — including products
that live only in non-public or unmapped IP categories — the **only**
thing keeping raw IP category names off the page is **omission**:

- `/shop` renders product **name + image + price + PDP link** only.
- The IP-nickname chips render **public nicknames** only.
- `getShopProducts()` and the page **never** call
  `getCategoryNameMap()`. The `categoryIds[]` carried on each product
  are used for nothing on `/shop` — not labels, not sorting, not
  filtering.

**New regression guard:** `tests/public/shop-page.test.tsx` asserts that
raw Square category names ("Anime"/"Naruto") never appear in the
rendered `/shop` DOM **even when the mocked products carry those
category IDs**, mirroring the existing
`tests/public/category-page.test.tsx` guard.

---

## 7. Testing & verification

### 7.1 New tests (vitest, `vi.hoisted()` pattern)

`tests/public/shop-page.test.tsx` (mock `next/image`, `next/link`,
`next/navigation`, `@/lib/square/items`, `@/lib/db/queries/ip-nicknames`;
render by awaiting the async page component):

- renders a grid of PDP links (`href="/product/<id>"`) for returned
  products.
- price formatting + "No image" placeholder fallback.
- empty state when `getShopProducts()` returns `[]`.
- IP-nickname chips render public nicknames linking to
  `/category/<slug>`; chip row omitted when no public nicknames.
- **REGRESSION GUARD:** raw Square category names never appear in DOM
  even when products carry those category IDs.

Unit test for `getShopProducts()` (mock `searchItems` pagination):
asserts pagination follows `cursor`, archived items filtered, dedupe by
id, alphabetical sort, `ArtistProduct` shape.

If `ProductCard` is extracted, a small render test for it (image
fallback, price `—` for null).

### 7.2 Acceptance criteria

- `pnpm lint` clean, `pnpm typecheck` clean.
- `pnpm test` green (255 existing + new) and `pnpm test:integration`
  green (75, unchanged — no DB/schema work).
- `grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0.
- Existing IP-leak regression pair still green; new `/shop` guard green.
- `/shop` renders the grid locally and the empty state cleanly.
- App still boots healthy with `src/instrumentation.ts` removed.
- **Deploy smoke** (live deploy exists — do this after merge+deploy):
  - `curl -s -o /dev/null -w '%{http_code}\n' https://dev.animeniacs.shop/shop`
    → 200 (header "Shop" link no longer 404s).
  - Served `/shop` HTML contains product card links to
    `/product/<id>`; spot-check one resolves to a working PDP.
  - Served `/shop` HTML contains **no** raw IP category name.
  - Visually confirm `/admin/{artists,ip-nicknames,sms-recipients}` are
    legible in mobile dark mode on the live deploy.
  - `curl -s https://dev.animeniacs.shop/api/health` → 200 after the
    env-logging removal deploy.

---

## 8. Out of scope (explicitly deferred)

- Refactoring `/category/[slug]` and `/artist/[slug]` to use the shared
  `ProductCard` is **optional**, not required.
- Pagination / infinite scroll / search / sort controls on `/shop`
  (v1 is a single alphabetical grid; `searchItems` paginates internally
  but the page renders the full set).
- Footer "Browse" nav column (considered, deferred — chips on `/shop`
  cover the discoverability need for v1).
- Artist categories in the chip row (the `/artist` page is their hub).
- Promo bar, abandoned-cart emails, refund notifications, production
  cutover — remain queued for future phases.

---

## 9. Files touched (anticipated)

| File | Change |
|---|---|
| `src/app/shop/page.tsx` | NEW — listing page (server, force-dynamic) |
| `src/app/shop/loading.tsx` | NEW — skeleton |
| `src/app/shop/error.tsx` | NEW — client error boundary |
| `src/lib/square/items.ts` | MODIFIED — add `getShopProducts()` |
| `src/components/product/ProductCard.tsx` | NEW — shared card |
| `src/components/layout/Header.tsx` | MODIFIED — drop `as Route` cast |
| `src/app/(admin)/layout.tsx` | MODIFIED — wrapper colors (dark-mode fix) |
| `src/lib/env.ts` | MODIFIED — strip diagnostic block |
| `src/instrumentation.ts` | DELETED — diagnostic-only file |
| `tests/public/shop-page.test.tsx` | NEW — page + regression guard tests |
| `tests/square/shop-items.test.ts` (or sibling) | NEW — `getShopProducts()` unit |

Exact filenames/locations are guidance; the execution agent follows
repo conventions where they differ.
