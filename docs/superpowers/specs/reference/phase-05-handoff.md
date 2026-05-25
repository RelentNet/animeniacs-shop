# Phase 5 → Phase 6 hand-off

**Status:** Phase 5 closed pending operator manual smoke + tag. Tag
`phase-5-product-detail-page` to be applied at HEAD (`6349b4e` or
descendant) once the operator confirms smoke is green.
This document is the source of truth for the next agent picking up
Phase 6 (or any later phase). Read it end-to-end before opening code.

**Date:** 2026-05-24

---

## TL;DR

Phase 5 shipped the public Product Detail Page (`/product/[id]`) end-to-end
against real Square catalog data, plus the supporting infrastructure: a
read-through product cache, an `ip_nicknames` table + admin CRUD area for
mapping Square IP categories to public-safe nicknames, the public
`/category/[slug]` IP browse page, and a two-tier related-products resolver
(artist → IP nickname). All five acceptance criteria from the spec pass.

What Phase 6 picks up: the cart. The PDP renders a disabled Add-to-Cart
button with a "launching soon" tooltip. The button is already in the DOM,
ready for a click handler. Cart drawer + localStorage state + checkout
handoff to Square are the next natural step.

---

## Required reading order

Before touching any code:

1. **This document** front-to-back.
2. `docs/superpowers/specs/reference/phase-04-handoff.md` — Phase 4 closeout;
   the hard constraints in its §"Hard constraints (still in force)" are
   all still active in Phase 5.
3. `docs/superpowers/specs/2026-05-22-phase-05-product-detail-page-design.md` —
   the approved Phase 5 spec. Especially §6 (cart/wishlist scope notes),
   §7 (reviews), §8 (recently viewed), and §15 (out-of-scope items now
   queued for Phase 6+).
4. `docs/superpowers/plans/2026-05-22-phase-05-product-detail-page.md` —
   the execution plan we just ran. The "Plan deviations" section below
   captures everything that differed from the plan-as-written.
5. `docs/superpowers/specs/2025-05-13-animeniacs-shop-design.md` — the
   master design doc. §6 ("Cart & wishlist") is most of Phase 6's spec
   surface; reviews / recently-viewed land later.
6. `docs/operations/credentials-inventory.md` — every credential, where
   it lives, what it's for, end-of-project cleanup checklist.
7. `docs/operations/logto-setup.md` — how Logto is wired; needed if you
   add admin routes.

---

## What Phase 5 actually shipped

### Code

| File / area | What it does |
|---|---|
| `src/lib/square/types.ts` | Extended: `CachedItemOption`, `CachedItemOptionValue`, `CachedProduct.itemOptions: CachedItemOption[]`, `CachedVariation.optionValueIds: string[]`. Empty arrays for items / variations without options. |
| `src/lib/products/cache.ts` | **NEW.** `getProductById(itemId)` read-through cache hitting Postgres `product_cache` table with a 1-hour TTL. `denormalize(sdkItem, ctx)` projects Square SDK items into `CachedProduct` shape. `__forceRefresh(itemId)` is a test-only escape hatch. TTL is `PRODUCT_CACHE_TTL_MS = 60 * 60 * 1000`. |
| `src/lib/db/schema.ts` | Appended `ipNicknames` table (UUID PK, unique slug, unique square_category_id, nullable cover_image_url, default is_public=true). Migration `0010_tricky_korvac.sql` applied. |
| `src/lib/db/queries/ip-nicknames.ts` | **NEW.** 7 query helpers (`getAllIpNicknames`, `getPublicIpNicknames`, `getIpNicknameBySlug`, `getIpNicknameByCategoryId`, `getIpNicknameById`, `createIpNickname`, `updateIpNickname`) + Zod input schema. Slug regex disallows dot (artists allow it for handles like `Bxnny.Arts`; IP nicknames don't). |
| `src/lib/square/categories.ts` | Appended `getNonArtistCategories()` (excludes Artist parent + every Artist sub-category) and `buildHierarchicalLabel(category, allById)` (walks parent chain joining with ` > `; cycle-safe). |
| `src/lib/categories/related.ts` | **NEW.** `getRelatedProducts(currentItemId, categoryIds): RelatedResult` — two-tier resolver: artist (priority 1) → public IP nickname (priority 2). Caps at 6 items. Excludes current item id. |
| `src/lib/categories/index.ts` | **NEW.** `getProductsForIpNickname(nickname)` — thin wrapper over `getItemsByCategoryId`. |
| `src/lib/mockup-scenes.ts` | **NEW.** `MOCKUP_SCENES` const — 4 hardcoded scenes from the legacy site, baked in per Decision 3. |
| `src/lib/sanitize-html.ts` | **NEW.** `sanitizeProductDescription(html)` — isomorphic-dompurify with the Decision 11 whitelist (`p`, `br`, `ul`, `ol`, `li`, `strong`, `em`, `a`). Forces `rel="noopener noreferrer"` + `target="_blank"` on every `<a>`. `stripHtml(html)` returns plain text for SEO descriptions. |
| `src/lib/site-copy.ts` | **NEW.** `PRODUCTION_TIME_TEXT` and `DISABLED_ADD_TO_CART_TOOLTIP` consts. Future phases will probably migrate these to `site_settings`. |
| `src/components/product/MockupGallery.tsx` (+ `.module.css`) | **NEW client.** Scene + product-image gallery. Cross-fade on scene switch (400ms), instant overlay swap on product-image click, arrow-key navigation, `prefers-reduced-motion` honoured. Empty `productImages` renders the active scene only. |
| `src/components/product/VariantPicker.tsx` | **NEW client.** Auto-detects `itemOptions` axes: one `<select>` per axis. Zero options + multiple variations → single select over variation names. Zero options + one variation → renders nothing. Unmatched combo → `onChange(null)`. |
| `src/components/product/PdpPurchasePanel.tsx` | **NEW client island.** Wraps price display, variant picker, quantity stepper, and the disabled Add-to-Cart CTA with launch tooltip (Decision 5). |
| `src/app/(admin)/admin/ip-nicknames/page.tsx` | **NEW.** List page mirroring `/admin/artists`. Public/Hidden badge, staff-only Square category name column. |
| `src/app/(admin)/admin/ip-nicknames/new/page.tsx` + `actions.ts` | **NEW.** Create flow. Excludes already-mapped categories from the picker; Zod validation; unique-violation translation to friendly field errors. `revalidatePath('/admin/ip-nicknames')` + `revalidatePath('/category/<slug>')` after success. |
| `src/app/(admin)/admin/ip-nicknames/[id]/page.tsx` + `actions.ts` | **NEW.** Edit flow. Slug becomes read-only; current row's Square category re-included so the form's pre-filled value stays selectable. |
| `src/app/(admin)/admin/ip-nicknames/_components/` | `IpNicknameForm.tsx` (client form using `useFormState`), `SquareIpCategoryPicker.tsx` (server loader), `formData.ts` (form parser), `validation.ts` (Zod wrap + Postgres unique-violation detector). |
| `src/app/product/[id]/page.tsx` | **REPLACED.** Real PDP layout: breadcrumbs (`Home / {name}`), `<MockupGallery>`, `<h1>`, `<ArtistMetaLine>`, `<PdpPurchasePanel>`, sanitized description, related-products carousel. The route is now `ƒ /product/[id]` (dynamic, 2.27 kB) instead of the Phase 4 stub. |
| `src/app/product/[id]/{loading,error}.tsx` | **NEW.** Skeleton loading + error-boundary UI (Try Again button calling `reset()`). |
| `src/app/category/[slug]/page.tsx` | **NEW.** Public IP browse page. CSS gradient cover + nickname H1 + optional description + product grid. Empty state renders when category has no items. `notFound()` if the slug is missing OR the row has `isPublic=false`. |
| `src/app/category/[slug]/{loading,error}.tsx` | **NEW.** Skeleton + error UI matching the PDP shape. |
| `public/images/mockup-scenes/style{1,2,3,4}.webp` | **NEW.** 4 self-hosted scene backgrounds (downloaded from the legacy WordPress site, PNG → WebP at 88 quality). |
| `next.config.mjs` | Allowlisted Square S3 image hostnames (`items-images-production.s3.us-west-2.amazonaws.com`, `items-images-sandbox.s3.us-west-2.amazonaws.com`) in `images.remotePatterns`. Added `experimental.serverComponentsExternalPackages: ['isomorphic-dompurify']` to keep jsdom out of the server bundle (see deviation #2 below). |

### Tests added

- **Unit (60 new):** `tests/products/cache.test.ts` (2), `tests/admin/ip-nicknames-actions.test.ts` (5), `tests/square/non-artist-categories.test.ts` (5), `tests/categories/related.test.ts` (4), `tests/public/{mockup-gallery,variant-picker,pdp-purchase-panel,sanitize-html,product-detail-page,category-page}.test.tsx` (7+7+6+10+7+7). Total: 63 baseline → 123 (+60).
- **Integration (15 new):** `tests/integration/product-cache-readthrough.integration.test.ts` (5), `tests/integration/ip-nicknames.integration.test.ts` (10). Total: 40 baseline → 55 (+15).

### Infrastructure

No changes. The Coolify-hosted Logto + Plausible services from Phase 4
still run as-is. `compose.yml` still runs `app` + `postgres` only.

### Database

- New table `ip_nicknames` (9 columns + 2 unique indexes). Migration
  `drizzle/migrations/0010_tricky_korvac.sql` applied to local Postgres.
- **Row counts at handoff:** 15 active artists, 0 ip_nicknames (operator
  creates rows during smoke).
- `product_cache` table now actively used by `getProductById`. Existing
  Phase 2 schema; no changes.

### Operational

Nothing the operator needs to do in Square dashboard. All Phase 5 work
is read-only against Square.

---

## Plan deviations Phase 6 should know about

### 1. `tests/square/non-artist-categories.test.ts` doesn't mock the same way the plan describes

The plan suggested mocking `@/lib/square/categories` partially (spreading
`importOriginal()` and overriding `listCategoriesFromSquare`). That
approach doesn't work because `getNonArtistCategories` calls
`listCategoriesFromSquare` directly inside its own module — the mocked
export isn't what the function references at runtime.

**What I did instead:** followed the existing Phase 4 pattern from
`tests/square/categories.test.ts`. Mock the `square` SDK at the
constructor level (provide a fake `SquareClient` with a `catalog.list`
that yields fixture rows) and stub `next/cache.unstable_cache` to a
pass-through. The test reads identically from the call-site's perspective.

### 2. `next.config.mjs` had to add `serverComponentsExternalPackages: ['isomorphic-dompurify']`

The PDP imports `sanitize-html.ts` which imports `isomorphic-dompurify`,
which pulls in `jsdom`. Without the external-packages config, Next.js
bundles jsdom into the server output but fails to copy
`jsdom/lib/jsdom/browser/default-stylesheet.css`, causing a build-time
ENOENT in "Collecting page data". The fix is the standard pattern for
isomorphic-dompurify on Next 14: tell the bundler to leave it as an
external require so the file-tracing pass picks up the asset.

This was a one-line addition to `next.config.mjs`; commit
`d20294c Phase 5/D: replace PDP stub with real layout ...` includes it.

### 3. PDP page imports `<ArtistMetaLine>` without `@ts-expect-error`

The plan's PDP code includes `{/* @ts-expect-error Server Component */}`
before `<ArtistMetaLine />`. In this repo's Next 14 setup, the binding
typechecks cleanly without the comment, so the directive becomes an
unused-suppression error (`TS2578`). Removed it in the final commit;
Phase 6 should NOT add the comment back unless a future Next version
re-introduces the typing edge case.

### 4. Three test files needed `vi.hoisted()` instead of bare `vi.fn()`

`tests/public/product-detail-page.test.tsx` and
`tests/public/category-page.test.tsx` hit
`ReferenceError: Cannot access 'mockX' before initialization`. Vitest
hoists `vi.mock(...)` factories above the module body, so any module-level
`vi.fn()` declarations they reference aren't initialized yet. Solution
is `vi.hoisted(() => ({ mockX: vi.fn(), ... }))`. The plan's test code
uses the bare-`vi.fn()` form throughout; for these two specific files
I switched to the hoisted form. The other tests with `vi.mock(...,
async (importOriginal) => ...)` factories worked as-written because the
mock's body doesn't reference the outer variable at hoist time.

### 5. Several `getByLabelText(/quantity/i)` selectors needed tightening to `'Quantity'`

`<PdpPurchasePanel>`'s quantity input has `<label htmlFor="qty">Quantity</label>`,
and its increment/decrement buttons have aria-labels "Increase quantity"
and "Decrease quantity". `getByLabelText(/quantity/i)` matched all three.
Changed to exact-string match for the input. Same fix may be needed in
Phase 6 cart tests if you reuse the pattern.

### 6. Several biome lint fixes were needed inline

Mostly auto-fixable formatting (multiline → single-line for short
JSX / object literals) and one optional-chain rewrite in
`src/lib/categories/related.ts`. Two intentional a11y suppressions
were added to `<MockupGallery>` for the `tabIndex={0}` + `role="group"`
container, which is required for keyboard arrow-key navigation. Biome
otherwise wanted a `<fieldset>` (wrong semantic) or no tabIndex (kills
keyboard nav). Suppression comments document the reason.

---

## Hard constraints (still in force)

These come from Phase 4 + remain non-negotiable for every phase. Phase 5
introduced **no new** constraints beyond what's listed here.

1. **No GoAffPro at runtime.** `grep -rn "goaffpro\|GoAffPro" src/ tests/`
   must return zero. The probe script under `scripts/goaffpro/probe.ts`
   is historical reference only.
2. **No `artist` Square custom attribute definition.** Artists resolve via
   the local `artists` table joined by `squareCategoryId`.
3. **No new auth vendors.** Reuse existing Logto + `(admin)` route group.
   Phase 5's `/admin/ip-nicknames` inherits the gate for free.
4. **No commission engine.** Manual monthly Square dashboard reporting.
5. **No additional Postgres tables for affiliate / commission tracking.**
   Phase 5 added exactly one table (`ip_nicknames`) for the IP nickname
   admin feature, which is unrelated to commissions.
6. **Sandbox-first for any production write.** Phase 5 did no Square
   writes; Phase 6's cart → checkout flow will need to honour this when
   it starts creating Square orders.
7. **IP categories never public via their literal Square name.** THE
   constraint that drove the `ip_nicknames` design. The literal Square
   category name (e.g. `Anime > Naruto`) is staff-only — visible in the
   `/admin/ip-nicknames` list as the "Square category (staff-only)"
   column, but **never** in any public-route DOM. Two regression tests
   enforce this:
   - `tests/public/product-detail-page.test.tsx` asserts the breadcrumb
     text matches exactly `Home / {name}` (no IP segment) and contains
     no IP / category id strings.
   - `tests/public/category-page.test.tsx` asserts the rendered DOM
     never contains `Anime` or `Naruto` (the literal Square category
     name from the mocked `getCategoryNameMap`).
   Both tests must stay green. Don't disable them — fix any leak that
   trips them.

---

## What's deferred (NOT Phase 5 scope, queued for Phase 6+)

| Item | Source | Likely phase |
|---|---|---|
| Cart drawer + Add-to-Cart wiring + localStorage cart state | Spec §6.1 / plan §15 | Phase 6 (recommended) |
| Wishlist UI (Postgres + localStorage merge) | Spec §6.2 | Phase 7+ |
| Reviews UI (read + write) | Spec §7 | Phase 7+ |
| Recently-viewed strip (localStorage + server enrichment) | Spec §8 | Phase 7+ |
| `/admin/settings` route group (scene editor, universal upsells, promo) | Spec §10 | Phase 7+ |
| IP cover image uploads (`cover_image_url` column already exists) | Spec §6 sub-decisions | Phase 7+ |
| PDP upsells (universal-upsells admin row) | Spec §10 | Phase 7+ |
| Square `catalog.version.updated` webhook handler | Spec §2 + Phase 3 plan tasks 9–11 | Phase 7+ |
| `pnpm square:sync` backfill script | Phase 3 plan task 8 | Phase 7+ |
| `/shop` listing page + the middle breadcrumb segment | Spec §5 (deferred) | Phase 7+ |
| Footer / nav link to `/category/[slug]` | Decision: operator hand-shares URLs in Phase 5 | Phase 7+ |

Phase 4 deferred items still standing (none changed in Phase 5):

| Item | Status | When |
|---|---|---|
| Plan C.3 — re-categorize the 229 production items into artist + IP categories in Square | Operator's dashboard task | Whenever. New IP nicknames + cache pick up changes within 60s (60s cache TTL on `getItemsByCategoryId`). |
| Avatar uploads per artist | Operator's task via admin UI | Whenever. |
| GoAffPro subscription cancellation | Operator's task in GoAffPro dashboard | Whenever. Runtime no longer reads from it. |
| Credentials cleanup sweep | Final phase | All Phase 4-era short-lived credentials still in `.env.local` per operator's "defer to last phase" decision. See `docs/operations/credentials-inventory.md`. |

---

## Where credentials live

**TL;DR: every credential is in `.env.local` (gitignored).** Inventory + cleanup plan in
`docs/operations/credentials-inventory.md`. **Phase 5 added zero new credentials.**

Phase 6 will likely need:
- `SQUARE_ACCESS_TOKEN` (sandbox) — already set; cart → checkout sandbox testing
- `SQUARE_PROD_ACCESS_TOKEN` — already set; only for prod cutover
- `LOGTO_*` for any new admin routes — already set
- New: nothing yet locked, but if Phase 6 adds Square checkout, it may
  need `SQUARE_LOCATION_ID` (sandbox + prod variants); confirm during
  Phase 6 brainstorming.

Coolify resource UUIDs unchanged from Phase 4:
- Server `animaniacs-shared-host`: `z0sg4ogw4ossg4880080ws8k`
- Project `website` (where Logto lives): `q4gso4kow0k08gowc4g40ww4`

---

## Phase 6 scope (suggested, not locked)

The disabled `<button>` in `<PdpPurchasePanel>` is the natural starting
point. Look at it in `src/components/product/PdpPurchasePanel.tsx:67-80`
— it already has the correct semantics (`type="button"`, the launch
tooltip from `DISABLED_ADD_TO_CART_TOOLTIP`), so Phase 6 just needs to
swap `disabled` for an `onClick` handler that pushes the selected
`{variation, quantity}` into a cart state container.

Likely Phase 6 deliverables (master terminal will refine during
brainstorming):

1. **Cart store** — localStorage-backed, hydrated client-side. Probably
   a Zustand store or a simple React context + reducer per the
   design spec §6.1. Lines on cart key shape:
   `{ catalogObjectId: string, quantity: number }` (Square's checkout
   API accepts this directly via Catalog API).
2. **Cart drawer** — slide-out from the right on PDP click or header
   cart icon. Shows line items with thumbnails (from `CachedProduct.images[0]`
   via a fresh `getProductById` call), quantity steppers, subtotal,
   "Continue to checkout" CTA.
3. **Header cart icon** — badge count, opens drawer.
4. **Checkout handoff** — POST to `/api/checkout` that creates a Square
   Checkout via the Orders API + Checkout API, returns the hosted
   payment URL, redirects the buyer. This is the first phase to do
   Square writes — sandbox-first per hard constraint #6.
5. **Abandoned-cart logging** — write to the existing
   `abandoned_carts` Postgres table (Phase 2 schema already present).
   This is the seed for the SMS reminder flow that's documented in the
   master design spec but not yet built.

What Phase 6 should NOT scope:
- Reviews, wishlist, recently-viewed, PDP upsells — those are all queued
  later per the spec.
- The Square webhook handler — Phase 7+.

Don't lock anything from this list. The next master terminal brainstorm
will refine.

---

## Verification state at handoff

- `pnpm lint`: clean (123 files)
- `pnpm typecheck`: clean
- `pnpm test`: 123/123 passing (up from 63 baseline; +60)
- `pnpm test:integration`: 55/55 passing (up from 40 baseline; +15)
- `pnpm build`: clean. 28 routes total (up from 21 in Phase 4):
  - 5 new dynamic routes: `/product/[id]` (real, was a 404 stub),
    `/category/[slug]`, `/admin/ip-nicknames`,
    `/admin/ip-nicknames/[id]`, `/admin/ip-nicknames/new`
  - All other routes unchanged from Phase 4
- Git tag `phase-5-product-detail-page` to be applied at HEAD after
  operator manual smoke confirmation. Pre-tag HEAD: `6349b4e` (or the
  commit of the handoff doc itself).
- Phase 5 commit count: 34 commits from `phase-4-artist-system` tag to
  the pre-handoff HEAD.
- Local DB: 15 active artist rows, 0 ip_nicknames rows. Operator creates
  ip_nicknames rows during smoke; expect 1+ post-smoke.
- Production Square: 15 artist sub-categories, 30 graveyard SKUs
  archived. Unchanged from Phase 4.
- Coolify-hosted services healthy: Logto + Plausible. Unchanged.

---

## How to verify this hand-off is correct

Before starting Phase 6 work, the next agent should run:

```sh
# Confirm we're at the right commit
git describe --tags --abbrev=0       # → phase-5-product-detail-page
git rev-parse HEAD                    # → 6349b4e... or descendant

# Confirm green baseline
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration

# Confirm DB state
docker exec animeniacs-postgres psql -U animeniacs -d animeniacs \
  -c "SELECT count(*) FROM artists WHERE status='active';" \
  -c "SELECT count(*) FROM ip_nicknames;"
# Should print: 15 artists, ≥0 ip_nicknames (depends on whether
# operator created rows during the Phase 5 smoke; treat any count as
# acceptable — the production schema is what matters).

# Confirm new routes render (with dev server up)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/ip-nicknames
# Should print: 307 (redirect to /sign-in if not authed) or 200 if authed.

# Confirm hard-constraint canary still clean
grep -rn "goaffpro\|GoAffPro" src/ tests/
# Should print: nothing.
```

If any of those fail, stop and investigate before touching Phase 6 code.
The baseline state is part of the contract.
