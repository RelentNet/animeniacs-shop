# Phase 14 — Shop Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task, TDD. Steps use checkbox (`- [ ]`). Write the failing test first, confirm it fails, implement, confirm it passes, commit per task.

**Design spec:** `docs/superpowers/specs/2026-06-11-phase-14-shop-discovery-design.md` (read first — §3 IP-never-public, §5 params, §7 invariants are load-bearing).

**Goal:** `/shop` search + filter (category/artist/price) + sort + page-numbered pagination, per-card rating summaries, shared `ProductCard` across all grids, and a `batchGet` chunking fix.

**Stack:** Next.js 14 App Router, Drizzle/Postgres, Square, Logto. No new schema. Customer pages = Tailwind.

---

## Baseline verification

- [ ] `git status` clean on `main`, HEAD `6de344d` or later.
- [ ] `pnpm test` → 444 unit pass; `pnpm typecheck` clean.
- [ ] `grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0.

---

## Task 1: Batch review-summary query

**Files:** `src/lib/db/queries/reviews.ts`, `tests/db/reviews.test.ts` (extend).

- [ ] **Step 1 (test first):** mock `db`. `getReviewSummariesForProducts(['p1','p2'])` → `Map` with `{ count, average }` per product, **published-only**, grouped; empty array input → empty map; products with no reviews are absent from the map.
- [ ] **Step 2:** Implement with one grouped query: `select({ productId, count: count(), average: avg(rating) }).from(reviews).where(and(eq(isPublished,true), inArray(reviews.productId, ids))).groupBy(reviews.productId)`. Coerce `count`→int, `average`→float. Guard empty `ids` (return empty map without querying). `import 'server-only'`.
- [ ] **Step 3:** Tests pass; typecheck. Commit: `feat(reviews): getReviewSummariesForProducts batch query`.

---

## Task 2: batchGet chunking + ArtistProduct.updatedAt

**Files:** `src/lib/square/items.ts`, `tests/square/items.test.ts` (create or extend).

- [ ] **Step 1 (test first):** mock the Square client. `resolveImageUrls(client, ids)` calls `catalog.batchGet` **once** for ≤ 900 ids and **twice** for 1500 ids (chunked ≤ 900), merging into one `Map<id,url>`. Also assert the `ArtistProduct` projection includes `updatedAt` from the Square object.
- [ ] **Step 2:** Extract `async function resolveImageUrls(client, imageIds: string[]): Promise<Map<string,string>>` that chunks `imageIds` into slices of ≤ 900, awaits each `batchGet`, and merges the IMAGE url map. Replace the inline image-resolution blocks in BOTH `getItemsByCategoryId` and `getShopProducts` with it. Add `updatedAt: typeof it.updatedAt === 'string' ? it.updatedAt : null` to the projection in both functions; extend the `ArtistProduct` interface.
- [ ] **Step 3:** Existing consumers still compile (the field is additive). Tests pass; typecheck. Commit: `fix(square): chunk batchGet under the 1000-object cap; carry updatedAt`.

---

## Task 3: Pure shop filter/sort/paginate + param parsing

**Files:** create `src/lib/shop/filter.ts`, `src/lib/shop/parse-params.ts`, `tests/shop/filter.test.ts`, `tests/shop/parse-params.test.ts`.

- [ ] **Step 1 (test first — parse):** `parseShopParams({ page:'2', q:' Cat ', category:'naruto', artist:'merc', min:'10', max:'50', sort:'rating' })` → normalized `ShopQuery` (page 2, trimmed q, min/max in cents, sort enum). Garbage (`page:'abc'`, `sort:'xyz'`, `min:'-5'`) → defaults (page 1, no sort, dropped bounds). 
- [ ] **Step 2 (test first — filter):** `filterAndSortProducts(products, summaries, query)`:
  - `q` case-insensitive name substring.
  - `category`/`artist` → caller resolves slug→squareCategoryId BEFORE calling (the pure fn takes resolved `categoryId`/`artistCategoryId`); containment on `product.categoryIds`.
  - price bounds in cents; null-price products excluded only when a bound is set.
  - sorts: `rating` (avg desc, tie→count desc), `price_asc`, `price_desc` (null last), `newest` (updatedAt desc), default alpha-by-name.
  `paginate(items, page, 24)` → `{ pageItems, page, pageCount, total }`, clamps page.
- [ ] **Step 3:** Implement both as pure functions (no I/O). `ShopQuery` carries resolved category/artist category ids (slug resolution happens in the page).
- [ ] **Step 4:** Tests pass; typecheck. Commit: `feat(shop): pure filter/sort/paginate + param parsing`.

---

## Task 4: ProductCard rating + ShopFilters + Pagination components

**Files:** `src/components/product/ProductCard.tsx`, create `src/components/shop/ShopFilters.tsx`, `src/components/shop/Pagination.tsx`, `tests/product/product-card.test.tsx` (extend), `tests/shop/shop-filters.test.tsx`, `tests/shop/pagination.test.tsx`.

- [ ] **Step 1 (ProductCard test first):** renders `StarRating` + count when `rating` prop present and `count > 0`; omits when absent or `count === 0`; **never renders a category name** (regression).
- [ ] **Step 2:** Add optional `rating?: { count: number; average: number }` to `ProductCard`; render Phase 12 `StarRating` (read-only) + `(count)`.
- [ ] **Step 3 (ShopFilters test first):** renders a `GET` form targeting `/shop` with search input, category select (from passed options), artist select, min/max inputs, sort select; pre-selects current query values.
- [ ] **Step 4:** Implement `ShopFilters` (server component or plain markup; `<form method="get" action="/shop">`). It receives `categories` (public IP nicknames: `{slug, label}[]`), `artists` (`{slug, label}[]`), and the current `ShopQuery` for pre-selection.
- [ ] **Step 5 (Pagination test first):** builds prev/next + numbered hrefs that preserve all other params and change only `page`; prev disabled on page 1, next disabled on last page.
- [ ] **Step 6:** Implement `Pagination` (takes `page`, `pageCount`, and the current params object to rebuild hrefs).
- [ ] **Step 7:** Tests pass; typecheck. Commit: `feat(shop): ProductCard ratings + ShopFilters + Pagination components`.

---

## Task 5: Wire `/shop` page

**Files:** `src/app/shop/page.tsx`, `tests/shop/shop-page.test.tsx`.

- [ ] **Step 1 (test first):** mock `getShopProducts`, `getReviewSummariesForProducts`, and the IP/artist option queries. Assert: searchParams drive the rendered grid (e.g. `?q=` narrows; `?page=2` shows the second window; `?sort=price_asc` orders); filters + pagination render; cards get ratings.
- [ ] **Step 2:** Implement: read `searchParams`; load public IP nicknames + active artists (reuse existing queries — the ones feeding the current `/shop` chips and `/artist` listing); `parseShopParams` (resolve `category`/`artist` slug → squareCategoryId via the loaded option lists); `getShopProducts()`; `getReviewSummariesForProducts(ids)`; `filterAndSortProducts` → `paginate`; render `<ShopFilters>`, the grid of `<ProductCard rating=…>`, and `<Pagination>`. Keep `export const dynamic = 'force-dynamic'`. Preserve the empty-state. **Do NOT render any raw category name** (§3).
- [ ] **Step 3:** Tests pass; typecheck. Commit: `feat(shop): search, filter, sort, paginate the listing with per-card ratings`.

---

## Task 6: Refactor category + artist grids onto ProductCard

**Files:** `src/app/category/[slug]/page.tsx`, `src/app/artist/[slug]/page.tsx`, their tests (extend/keep green).

- [ ] **Step 1 (test first):** assert both pages still render a product per item, now via the shared `ProductCard` (e.g. each links to `/product/<id>`); ratings shown when present.
- [ ] **Step 2:** Replace the inline card markup in `category/[slug]/page.tsx` (lines ~53–82) and the inline `ProductGrid` in `artist/[slug]/page.tsx` (lines ~115–151) with `<ProductCard>`. Fetch ratings via `getReviewSummariesForProducts` for the listed product ids and pass them through. Keep each page's existing grid container classes.
- [ ] **Step 3:** Tests pass; typecheck. Commit: `refactor(grids): category + artist pages use shared ProductCard (+ ratings)`.

---

## Task 7: Final verification + handoff + tag + deploy

- [ ] **Step 1:** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration`. Expect lint/typecheck clean; unit ≈ 444 + ~30 new; integration ≥ 75 (run live or note unrun — do NOT claim green if not run).
- [ ] **Step 2:** `grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0.
- [ ] **Step 3:** Production-sim build: `DATABASE_URL=postgresql://x:x@unreachable-host/db pnpm build` → compiles + 0 `ENOTFOUND`. (Windows post-compile EPERM-symlink exit 1 is the known quirk; Linux deploy exits 0 — record which you saw.)
- [ ] **Step 4:** Write `docs/superpowers/specs/reference/phase-14-handoff.md` (follow `phase-13-handoff.md` format): file-by-file table + commits; the in-app filter architecture + param list; the batchGet chunking fix; the batch rating query; the ProductCard unification; the IP-never-public invariant (filter options = public IP + active artists, no category names on cards); operator-pending = none (sandbox verify checklist from spec §8); deferred items (tags via Square custom attributes — operator-data project; faceted/multi-select filters; Square server-side search at >1000 items; search relevance ranking).
- [ ] **Step 5:** `git tag phase-14-shop-discovery && ./scripts/deploy.sh`.

---

## Constraints (must hold throughout)
- `SQUARE_ENV=sandbox`; goaffpro canary **0**; deploy ONLY via `./scripts/deploy.sh`; no new env vars/secrets; no schema change.
- **IP-never-public:** product cards never render raw category names; filter options come only from public IP nicknames (`isPublic`) + active artists.
- Rating summaries count **published reviews only**.
- All query params **validated/normalized server-side**; bad input → defaults, never errors; `page` clamps to range.
- Filter/pagination state is **URL-driven** (GET form); results are shareable URLs.
- `batchGet` chunking is **behavior-preserving** at current scale and correct beyond 1000 ids.
- Customer pages = **Tailwind / storefront** conventions.
