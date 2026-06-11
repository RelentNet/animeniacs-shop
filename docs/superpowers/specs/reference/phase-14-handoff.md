# Phase 14 → Phase 15 hand-off

**Status:** Phase 14 **code-complete**. Shop discovery shipped in 7 tasks: a
batch published-review summary query, a `batchGet` chunking fix (+ `updatedAt`
carry), pure filter/sort/paginate + param-parsing logic, `ProductCard` ratings
+ `ShopFilters` + `Pagination` components, a fully wired `/shop`
(search/filter/sort/paginate/ratings), and the unification of the category +
artist grids onto the shared `ProductCard`. All automated **code** gates green
(scoped lint / typecheck / unit / canary / unreachable-DB build). Tag
`phase-14-shop-discovery` applied at the final commit. Deploy triggered via
`./scripts/deploy.sh`.

**Date:** 2026-06-11

> **Read me first, master orchestrator:** `/shop` is now browsable —
> `?q=&category=&artist=&min=&max=&sort=&page=` drive an **in-app** filter over
> the cached `getShopProducts()` result (no per-request Square search). All
> params are validated server-side (`parseShopParams`); bad input degrades to
> defaults and `page` clamps to range — junk URLs never error. The
> **IP-never-public** invariant holds unchanged: product cards render **no raw
> Square category names**, and the filter dropdown options come **only** from
> public IP nicknames (`isPublic=true`) + active artists — the same curated
> sources as the existing chips. Rating summaries count **published reviews
> only**. `SQUARE_ENV` stays `sandbox`; goaffpro canary stays **0**; **no new
> env vars/secrets**; **no schema change**. Integration tests were **not run
> locally** (no Postgres/Docker; `ECONNREFUSED :5433`) — but **zero integration
> tests were added or modified**, so the suite is structurally unchanged at the
> Phase 11 baseline (75). Run them in CI / against a live DB before relying.

---

## 1. TL;DR

Phase 14 makes the storefront discoverable:

- **Search / filter / sort / paginate** — `/shop` reads `searchParams`, parses
  them into a normalized `ShopQuery`, filters the cached catalog in-app, sorts,
  and slices to a 24-per-page window. State is **URL-driven** (a `GET` form), so
  every view is a shareable link that works without JS.
- **Per-card ratings** — a single batch query
  (`getReviewSummariesForProducts`) resolves avg-stars + count for every listed
  product (published-only), rendered on the shared `ProductCard` via the Phase
  12 `StarRating`.
- **`batchGet` chunking fix** — image resolution now chunks Square's `batchGet`
  into batches of ≤ 900 object ids, so images past the ~1000-object cap are no
  longer silently dropped. Behavior-preserving at current scale.
- **Grid unification** — the category and artist pages dropped their inline card
  markup and now render the shared `ProductCard` (with ratings), so all three
  public grids share one component.

**Schema:** **no changes.** **Env:** **no changes.** **Tests:** +47 unit
(444 → **491**; 79 → **84** files). Integration **unchanged** (0 added/modified;
not run locally).

---

## 2. Required reading order

1. **This doc** (`phase-14-handoff.md`).
2. **`phase-08-handoff.md`** — the original `/shop` build, `getShopProducts()`,
   the first `ProductCard`, and the IP-never-public regression-guard pattern
   this phase extends.
3. **`phase-13-handoff.md`** — the immediately-preceding order-lifecycle phase;
   build/deploy notes, the `corepack pnpm` build workaround, Windows EPERM quirk.
4. **`phase-12-handoff.md`** — reviews/wishlist; `getReviewSummary` (the
   single-product analogue of the new batch query) and `StarRating`.
5. **Phase 14 plan + spec:**
   `docs/superpowers/plans/2026-06-11-phase-14-shop-discovery.md` +
   `docs/superpowers/specs/2026-06-11-phase-14-shop-discovery-design.md`
   (§3 IP-never-public, §5 params, §7 invariants are load-bearing).

---

## 3. What Phase 14 shipped (file-by-file)

| Task | Commit | Files | Change |
|---|---|---|---|
| 1 — batch ratings | `cc9f095` | `src/lib/db/queries/reviews.ts`, `tests/db/reviews.test.ts` (extend) | NEW `getReviewSummariesForProducts(ids)`: one grouped query (`count()` + `avg(rating)` `WHERE is_published AND product_id IN (...)` `GROUP BY product_id`) → `Map<id,{count,average}>`. Empty input short-circuits (no query); products with no published reviews are absent. `import 'server-only'`. |
| 2 — batchGet chunk | `b50f285` | `src/lib/square/items.ts`, `tests/square/items.test.ts` (NEW) | NEW exported `resolveImageUrls(client, imageIds)` chunks `batchGet` into slices of ≤ 900 and merges into one `Map<id,url>`; replaces the inline image blocks in BOTH `getItemsByCategoryId` + `getShopProducts`. Added `updatedAt: string \| null` to the `ArtistProduct` projection (+ interface) to drive `newest` sort. |
| 3 — pure logic | `f0ab2b2` | `src/lib/shop/filter.ts` (NEW), `src/lib/shop/parse-params.ts` (NEW), `tests/shop/filter.test.ts` + `parse-params.test.ts` (NEW) | `parseShopParams(searchParams)` → normalized `ShopQuery` (trim q/slugs, dollars→cents, sort enum, page≥1; garbage→defaults). `filterAndSortProducts(products, summaries, query)` (name substring, resolved category/artist containment, price bounds w/ null-exclusion only when bounded, 4 sorts + alpha default; never mutates input). `paginate(items, page, size)` → `{pageItems,page,pageCount,total}`, clamps page. All pure / no I/O. |
| 4 — components | `e2de465` | `src/components/product/ProductCard.tsx` (modify), `src/components/shop/ShopFilters.tsx` (NEW), `src/components/shop/Pagination.tsx` (NEW), `tests/public/product-card.test.tsx` (extend), `tests/shop/shop-filters.test.tsx` + `pagination.test.tsx` (NEW) | `ProductCard` gains optional `rating?:{count,average}` → renders `StarRating` + `(count)` when `count>0`; still renders no category. `ShopFilters` = `GET` `<form action="/shop">` (search, series `<select>`, artist `<select>`, min/max, sort), pre-selects current query. `Pagination` = prev/next + numbered links preserving all params, only changing `page`. |
| 5 — wire /shop | `3b6ac45` | `src/app/shop/page.tsx`, `tests/public/shop-page.test.tsx` (rewrite) | `/shop` reads `searchParams`; loads `getShopProducts()` + `getPublicIpNicknames()` + `getActiveArtists()`; resolves `category`/`artist` slugs → squareCategoryId from those curated lists; `getReviewSummariesForProducts(ids)`; `filterAndSortProducts` → `paginate(…,24)`; renders `<ShopFilters>` + the `<ProductCard rating=…>` grid + `<Pagination>`. Keeps `force-dynamic`. Empty state preserved (+ "no match" copy). |
| 6 — grid unify | `f10ea2a` | `src/app/category/[slug]/page.tsx`, `src/app/artist/[slug]/page.tsx`, their tests (extend) | Replaced both inline card grids with `<ProductCard product rating=…>`; both pages now fetch ratings via `getReviewSummariesForProducts`. Removed now-unused `Link`/`Route`/`Image` imports where applicable (artist keeps `Image` for the avatar). |
| 7 — verify/format/handoff | `<this commit>` (+ style commit) | scoped `biome check --write` on the 16 Phase-14 files; this doc | Formatting only (line-wrapping; replaced a test `as any` with a typed cast). No behavior change. |

---

## 4. Architecture — in-app discovery (the load-bearing decision)

`/shop` is a **server component** that filters **in-app over the cached
`getShopProducts()` result** (60s cache) — NOT a Square server-side cursor
search. Flow:

1. `Promise.all([getShopProducts(), getPublicIpNicknames(), getActiveArtists()])`.
2. `parseShopParams(searchParams)` → `ShopQuery` (slugs still raw).
3. Resolve `categorySlug`/`artistSlug` → `squareCategoryId` by looking them up in
   the **same curated lists** that build the dropdowns (unknown slug → `null` →
   the filter is a no-op; junk can't error).
4. `getReviewSummariesForProducts(productIds)` → ratings map.
5. `filterAndSortProducts(products, summaries, query)` (pure) → `paginate(…, 24)`.
6. Render filters + the `ProductCard` grid (with ratings) + pagination.

**Why in-app, not Square-side:** cursor pagination is awkward for page numbers,
adds per-request latency, and sort-by-rating is impossible Square-side (ratings
live in our DB). **Revisit when the catalog exceeds ~1000 items** — the
`batchGet` chunking fix keeps the fetch-all path correct until then.

### Query params (all optional, validated server-side)

| Param | Meaning |
|---|---|
| `q` | case-insensitive substring on product name |
| `category` | public IP-nickname **slug** → resolved to its `squareCategoryId`; containment on `categoryIds` |
| `artist` | active-artist **slug** → resolved to its `squareCategoryId`; same containment |
| `min`,`max` | price bounds in **dollars** → cents; null-price (variable) products excluded only when a bound is set |
| `sort` | `rating` (avg desc, tie→count desc), `price_asc`, `price_desc` (nulls last), `newest` (`updatedAt` desc, nulls last); default = alpha-by-name |
| `page` | 1-based; out-of-range clamps to `[1, pageCount]` |

Unknown/garbage params are treated as absent. Page size = **24**.

---

## 5. Security / correctness invariants (verified)

- **IP-never-public holds.** Cards render **no raw Square category name** and no
  `CAT_*` id; `categoryIds` are used for **filtering logic only**. Filter
  dropdown options come **only** from `ipNicknames.isPublic=true` + active
  `artists`. Covered by the `ProductCard` regression test ("never renders a
  category name/id even when `categoryIds` present") and the `/shop` regression
  guard ("never renders a raw Square category name or `CAT_` id").
- **Ratings are published-only.** `getReviewSummariesForProducts` filters
  `isPublished = true` (same rule as `getReviewSummary`). Covered by
  "groups published-only counts + averages by product id".
- **All params validated/normalized server-side.** `parseShopParams` coerces and
  drops junk (unknown sort → null, negative/NaN bounds → null, non-positive page
  → 1); `paginate` clamps page into range. Bad input degrades to defaults, never
  errors. Covered by the parse-params + paginate test suites.
- **URL-driven state.** Filter/sort/page live in the URL (`GET` form); no hidden
  client state; every view is shareable. `Pagination` preserves all other params
  and changes only `page`.
- **`batchGet` chunking is behavior-preserving + correct past 1000 ids.**
  `resolveImageUrls` issues a single call for ≤ 900 ids and chunks beyond that
  (2 calls for 1500). Covered by the `resolveImageUrls` tests.
- `SQUARE_ENV=sandbox`; goaffpro canary **0**; deploy via `./scripts/deploy.sh`
  only; **no new env vars**; **no schema change**. `/shop` stays `force-dynamic`.

---

## 6. Verification state at handoff

**Automated code gate (local, via `corepack pnpm`):**
- **Lint:** repo-wide `pnpm lint` is red on pre-existing CRLF files locally
  (Phase 10+ deviation). The **16 Phase-14 changed files pass `biome check`
  cleanly** (verified by scoping after the formatting commit; committed blobs
  are LF; CI Linux lint passes).
- **Typecheck:** `pnpm typecheck` (tsc --noEmit) → **clean (exit 0)**.
- **Unit tests:** `pnpm test` → **491 passed** (84 files) — up from 444 (+47:
  2 reviews + 4 items + 7 parse-params + 16 filter/paginate + 4 product-card +
  5 shop-filters + 5 pagination + 2 shop-page net + 1 category + 1 artist).
- **Integration tests:** **NOT run** (no Postgres/Docker locally;
  `ECONNREFUSED :5433`). **Zero integration tests added or modified**, so the
  suite is structurally unchanged at the Phase 11 baseline (**75**). **Do not
  claim integration green until run** against a live DB / in CI.
- **Canary:** `grep -rn "goaffpro\|GoAffPro" src/ tests/` → **0**.
- **Production build, unreachable DB:**
  `DATABASE_URL=postgresql://x:x@unreachable-host:5432/db corepack pnpm exec next build`
  → **✓ Compiled successfully**, **0 `ENOTFOUND`/`ECONNREFUSED`**; `/shop`
  remains dynamic. On Windows the run exits 1 **only** on the post-compile
  `EPERM: symlink` standalone-copy step (Phase 10 quirk) — **after** a
  successful compile. **On the Linux Docker builder Coolify uses, this exits 0.**

**Deploy:** `./scripts/deploy.sh` run at close of phase (push `main` + forced
Coolify deploy of the tagged commit `phase-14-shop-discovery`).

---

## 7. Plan deviations

1. **Required sub-skill unavailable.** `superpowers:subagent-driven-development`
   and `superpowers:executing-plans` are **not registered** in this exec
   environment (same as Phases 11–13). Worked the plan task-by-task with strict
   TDD (failing test → confirm fail → implement → confirm pass → commit per task)
   — the methodology the skill encodes.
2. **Test paths adapted to the real tree.** The plan named
   `tests/square/items.test.ts` (created), `tests/product/product-card.test.tsx`
   (actual: `tests/public/product-card.test.tsx`), and `tests/shop/*` (created).
   Used the real locations; no behavioral impact.
3. **`/shop` IP-nickname chip row removed** in favor of the new `ShopFilters`
   "Series" `<select>` (same public-nickname source). The chips were redundant
   with the category filter; dropping them avoids duplicate state. The empty
   state is preserved and a "No products match your filters." message was added
   for the filtered-to-empty case.
4. **`ProductGrid` (artist page) now takes a `summaries` prop.** The inline grid
   became `<ProductCard>` and the helper signature gained
   `summaries: Map<string, ReviewSummary>` so ratings flow through.
5. **Lint via scoped `biome check`** rather than repo-wide `pnpm lint` (red on
   pre-existing CRLF files locally — Phase 10+ deviation). Phase 14 changed set
   verified clean; committed blobs are LF; CI passes.
6. **Build run as `corepack pnpm exec next build`** to bypass the `prebuild`
   bare-`pnpm` call — same as Phase 10–13. No code change.

---

## 8. Operator-pending items (DO NOT BLOCK)

- **None required for the features to work.** Ratings populate automatically as
  published reviews accrue; filters/sort/pagination work against the live
  catalog immediately.
- **Sandbox verify (spec §8):** load `/shop` → grid + filters + pagination
  render; search a product name; filter by a **series** and by an **artist**;
  set a price range; sort by **rating / price / newest**; page through; confirm
  cards show star ratings where published reviews exist; open a **category** page
  and an **artist** page and confirm both render via the shared `ProductCard`.
- **Tags (deferred) require operator data setup** if pursued later (see §9):
  Square custom-attribute definitions + an operator tagging workflow + projection
  changes — not just code.
- **Carried forward (still pending, unchanged from Phase 13):** configure Resend
  (`RESEND_API_KEY` + `RESEND_FROM_EMAIL`); apply migration `0014` + run the
  integration suite against a live DB; mount the `uploads-data` volume; enable
  Logto self-registration; wire the abandoned-cart cron; Coolify Auto-Deploy +
  `/api/health` check; guest-lookup rate-limiting.

---

## 9. What's deferred / Phase 15+ candidates

**Newly deferred by Phase 14:**
- **Tags / free-form taxonomy** — Square catalog items have **no native tags**
  and we surface no custom-attribute data. Real tag filtering needs Square
  custom-attribute definitions + an operator tagging workflow + a projection
  extension — a separate **operator-data project**, not just code. Category (IP)
  + artist already cover "browse by theme."
- **Faceted / multi-select filters** — today each of category/artist is a single
  select; AND-of-many-values facets (e.g. two series at once) are not built.
- **Square server-side search at scale** — the in-app filter loads the whole
  active catalog. Revisit Square-side cursor search (or a search index) when the
  catalog exceeds **~1000 items**; the `batchGet` chunking fix buys headroom
  until then.
- **Search relevance ranking** — `q` is a plain case-insensitive name substring;
  no fuzzy/typo tolerance, weighting, or relevance sort.
- **Filter UX niceties** — no "clear filters" affordance, no result-count-aware
  disabling, no client-side instant filtering (intentional: GET-form, no-JS).

**Carried forward (unchanged):** Square production cutover; monitoring/alerting,
CI/CD, automated DB backups; review editing/replies/helpful-votes; profile
name/email editing (Logto-owned); the Phase 10 operator items (uploads volume,
Resend cron); guest-lookup rate-limiting; Discord/SMS refund fanout.

---

## 10. Where credentials live

Phase 14 **sourced no new secrets and added zero env vars.** Locations unchanged
from Phase 11–13:
- **Local dev:** `.env.local` (gitignored). `scripts/deploy.sh` greps
  `COOLIFY_API_TOKEN_ANIMANIACS_TEAM` from it at runtime.
- **Deployed (dev):** Coolify app `h4400cg04wg8www84ggks4sg` runtime env.
- **Coolify API:** base `https://empower.relentnet.com`, app UUID
  `h4400cg04wg8www84ggks4sg`.
- **Leftover `GOAFFPRO_*` / `SQUARE_PROD_ACCESS_TOKEN`** in `.env.local` are
  expected + unused; goaffpro canary stays 0.

---

## 11. How to verify this hand-off

```sh
git fetch --tags
git rev-parse phase-14-shop-discovery
git checkout main && git pull

corepack pnpm install
corepack pnpm content:build                      # gitignored manifest
corepack pnpm typecheck                          # clean
corepack pnpm test                               # 491 passed (84 files)
grep -rn "goaffpro\|GoAffPro" src/ tests/        # 0

# Build proves /shop compiles dynamic + no build-time DB read
DATABASE_URL=postgresql://x:x@unreachable-host:5432/db corepack pnpm exec next build
#   → "Compiled successfully", 0 ENOTFOUND
#     (Linux exits 0; Windows stops at the standalone symlink step — EPERM)

# Operator-assisted (live, after deploy) — §8:
#   /shop → grid + filters + pagination; search; filter by series + artist;
#   price range; sort rating/price/newest; page through; ratings on cards;
#   category + artist pages render via the shared ProductCard.
```
