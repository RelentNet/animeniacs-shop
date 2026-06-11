# Phase 14 — Shop Discovery — Design Spec

**Date:** 2026-06-11
**Status:** Designed. Awaiting plan execution.
**Predecessor:** Phase 13 (`phase-13-order-lifecycle`, HEAD `6de344d`).

---

## 1. Goal

Make `/shop` browsable at scale: **search**, **filter** (category/IP, artist, price),
**sort** (rating, price, newest), and **page-numbered pagination** — with a
**per-card rating summary** (avg stars + count) powered by Phase 12 reviews. Along the
way, **unify the duplicated product grids** onto the shared `ProductCard` and **fix the
Square `batchGet` 1000-object cap** so image resolution stays correct as the catalog grows.

Customer pages use **Tailwind / storefront** conventions.

---

## 2. Locked decisions (brainstorm 2026-06-11)

1. **In-app over the cached catalog.** Filter/search/sort/paginate in the page over the
   cached `getShopProducts()` result (60s cache); page-numbered URLs (`?page=&q=&category=&artist=&min=&max=&sort=`).
   No per-request Square calls. *Rejected:* Square server-side cursor search (cursor
   pagination is awkward for page numbers, adds per-request latency, and sort-by-rating
   is hard since ratings live in our DB). **Scale note:** revisit Square-side search when
   the catalog exceeds ~1000 items; the `batchGet` chunking fix (below) keeps the
   fetch-all path correct until then.
2. **Features this phase:** text search box, category & artist filters, price range, sort
   options, per-card ratings.
3. **Tags → deferred.** Square catalog items have **no native tags** and we surface no
   custom-attribute data today. Free-form tags would require defining Square custom-
   attribute definitions + an operator tagging workflow + fetching them — a separate
   operator-data project. Category (IP) + artist already cover the "browse by theme"
   dimension. Documented as a Phase 15+ candidate.

Out of scope: faceted multi-select filters, search relevance ranking beyond name match,
saved searches, infinite scroll, tag filtering (see above).

---

## 3. IP-never-public invariant (carried from Phase 8)

- Product **cards never render raw Square category names**. The `categoryIds` on each
  product are used only for **filtering logic**, never displayed.
- Filter **dropdown options** come from the **curated public sources**: `ipNicknames`
  where `isPublic = true` (the same source as the existing `/shop` chips) and **active**
  `artists`. Both already have public-facing slugs/names. This is exactly the existing
  chip pattern, extended into a filter control — no new public exposure.

---

## 4. Architecture & data flow

`/shop` is a server component reading `searchParams`:
1. `getShopProducts()` (cached) → full `ArtistProduct[]`.
2. `getReviewSummariesForProducts(ids)` (NEW batch query) → `Map<productId, {count, average}>`.
3. Pure `filterAndSortProducts(products, summaries, params)` → filtered + sorted array.
4. Slice to the page window (page size 24); render `ProductCard`s (with ratings) +
   `ShopFilters` + `Pagination`.

Filter/sort is a **pure function** (`src/lib/shop/filter.ts`) — fully unit-testable, no I/O.

---

## 5. Query params (all optional)

| Param | Meaning |
|---|---|
| `q` | case-insensitive substring match on product name |
| `category` | a public IP-nickname **slug** → resolved to its `squareCategoryId`; keep products whose `categoryIds` include it |
| `artist` | an active artist **slug** → resolved to its `squareCategoryId`; same containment match |
| `min`, `max` | price bounds in **dollars** (converted to cents); products with `priceCents = null` (variable price) are excluded only when a bound is set |
| `sort` | `rating` (avg desc, then count desc), `price_asc`, `price_desc` (null prices last), `newest` (by `updatedAt` desc); default = current alpha-by-name |
| `page` | 1-based page number; out-of-range clamps to the valid range |

Unknown/garbage params are ignored (treated as absent). The filter form submits via
`GET` so state lives in the URL (shareable, SEO-friendly, works without JS).

---

## 6. New / changed files

**Data layer**
- `src/lib/db/queries/reviews.ts` — add `getReviewSummariesForProducts(productIds: string[]):
  Promise<Map<string, { count: number; average: number }>>` — one grouped query
  (`WHERE is_published AND product_id = ANY($ids) GROUP BY product_id`), `count(*)` +
  `avg(rating)`. Empty input → empty map; products with no reviews are simply absent.
- `src/lib/square/items.ts` — extract a shared `resolveImageUrls(client, imageIds: string[])`
  that **chunks `batchGet` into batches of ≤ 900 ids** and merges results; use it in both
  `getItemsByCategoryId` and `getShopProducts`. Add `updatedAt: string | null` to the
  `ArtistProduct` projection (from the Square object's `updatedAt`) to enable `newest` sort.

**Shop logic (pure)**
- `src/lib/shop/filter.ts` — `ShopQuery` type + `filterAndSortProducts(products, summaries, query)`
  and a `paginate(items, page, pageSize)` helper returning `{ pageItems, page, pageCount, total }`.
- `src/lib/shop/parse-params.ts` — `parseShopParams(searchParams)` → normalized `ShopQuery`
  (coerce/validate page, prices, sort enum; ignore garbage).

**UI (Tailwind)**
- `src/components/product/ProductCard.tsx` — add optional `rating?: { count: number; average: number }`;
  render `StarRating` (Phase 12) + count when present and `count > 0`. Still renders **no
  category name**.
- `src/components/shop/ShopFilters.tsx` — a `GET` `<form action="/shop">`: search input,
  category `<select>` (public IP nicknames), artist `<select>` (active artists), min/max
  price inputs, sort `<select>`. Pre-selects current params. Reuses the existing public-IP
  and active-artist queries (the ones already feeding the `/shop` chips and `/artist`).
- `src/components/shop/Pagination.tsx` — prev/next + numbered links that **preserve all
  other query params** and only change `page`.

**Pages**
- `src/app/shop/page.tsx` — read `searchParams`; orchestrate §4; render filters + grid + pagination.
- `src/app/category/[slug]/page.tsx` — replace inline card markup with `ProductCard`
  (+ ratings via the batch query).
- `src/app/artist/[slug]/page.tsx` — replace the inline `ProductGrid` markup with `ProductCard`
  (+ ratings).

---

## 7. Security / correctness invariants

- **IP-never-public** holds (see §3): no raw category names on cards; filter options come
  only from public IP nicknames + active artists.
- **`getReviewSummariesForProducts` counts only `isPublished = true` reviews** (same rule
  as `getReviewSummary`); unpublished reviews never affect public ratings.
- **All query params are validated/normalized** server-side (`parseShopParams`); bad input
  degrades to defaults, never errors. `page` clamps to range; prices coerce to integers.
- **Pagination + filter state is URL-driven** (GET form) — no hidden client state; every
  result view is a shareable URL.
- The `batchGet` chunking fix is **behavior-preserving** at current scale and **correct**
  beyond 1000 image ids (previously would silently drop images past the cap).
- `SQUARE_ENV=sandbox`; goaffpro canary **0**; deploy via `./scripts/deploy.sh` only;
  no new env vars/secrets. `/shop` stays `force-dynamic` (reads searchParams + DB).

---

## 8. Operator-pending (post-deploy)

- **None required** for the features to work. (Ratings populate as reviews accrue.)
- **Tags (deferred) require operator data setup** if pursued later: define Square custom-
  attribute definitions, tag items, and extend the projection — not just code.
- **Sandbox verify:** load `/shop` → grid + filters + pagination; search a name; filter by
  a category and by an artist; set a price range; sort by rating/price/newest; page through;
  confirm cards show star ratings where reviews exist; confirm category + artist pages render
  via the shared card.

---

## 9. Test strategy (TDD)

Unit (pure logic + mocked db/Square):
- `filterAndSortProducts` — name search (case-insensitive); category/artist containment;
  price bounds (incl. null-price exclusion when bounded); each sort order (rating tie-break
  by count; null prices last; newest by updatedAt); combined filters.
- `paginate` — page windowing, clamp out-of-range, pageCount math, empty input.
- `parseShopParams` — valid params parsed; garbage ignored; defaults applied; page clamps.
- `getReviewSummariesForProducts` — groups by product, published-only, empty input → empty map.
- `items.ts` `resolveImageUrls` — chunks > 900 ids into multiple batchGet calls and merges
  (assert 2 calls for 1500 ids); ≤ 900 → single call. `ArtistProduct.updatedAt` populated.
- `ProductCard` — renders rating stars + count when provided & > 0; omits when absent/0;
  never renders a category name.
- `ShopFilters` — pre-selects current params; submits via GET to `/shop`.
- `Pagination` — builds hrefs preserving other params; disables prev on page 1 / next on last.
- category + artist pages — render via shared `ProductCard` (regression: still list products).

Gates (match Phase 13): `pnpm lint` clean · `pnpm typecheck` clean · `pnpm test`
(expect ~+30 unit) · `pnpm test:integration` (≥75; run live or note unrun) ·
`grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0 ·
`DATABASE_URL=postgresql://x:x@unreachable-host/db pnpm build` → compiles + 0 `ENOTFOUND`.
