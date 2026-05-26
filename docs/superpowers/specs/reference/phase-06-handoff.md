# Phase 6 → Phase 7 hand-off

**Status:** Phase 6 closed pending operator manual smoke + tag. Tag
`phase-6-cart` to be applied at HEAD (`7793bbc` or descendant) once the
operator confirms smoke is green.
This document is the source of truth for the next agent picking up
Phase 7. Read it end-to-end before opening code.

**Date:** 2026-05-25

---

## TL;DR

Phase 6 shipped the client-side cart end-to-end against the Phase 5
product cache: a `<CartProvider>` context + `useReducer` for cart state,
synced to `localStorage` with hydration-safe guards; a slide-out
`<CartDrawer>` (radix `@radix-ui/react-dialog` for accessibility); a
header `<CartButton>` with item-count badge; an `Add to Cart` wiring in
`<PdpPurchasePanel>` that pushes the selected variation into the cart
and pops the drawer; and a single backend route `POST /api/cart/hydrate`
that fan-outs to `getProductById()` so the drawer can re-fetch product
display details on every open (cart entries store IDs only — never
stale prices or images). The drawer's **Checkout button is rendered
disabled** with a `"Checkout launching soon — follow us on Instagram
for the launch."` tooltip, ready for Phase 7 to wire to Square.

What Phase 7 picks up: the Checkout button. Click handler → POST to a
new `/api/checkout` route → create a Square Payment Link (Orders API +
Checkout API) → write an `abandoned_carts` row → redirect to Square
hosted checkout → handle the post-payment `/checkout/success` page.
Sandbox-first (Phase 4 hard constraint #6) — this is the first phase
that does Square writes.

---

## Required reading order

Before touching any code:

1. **This document** front-to-back.
2. `docs/superpowers/specs/reference/phase-05-handoff.md` — Phase 5
   closeout. Hard constraints in its §"Hard constraints (still in
   force)" all still active in Phase 6 + onward.
3. `docs/superpowers/specs/reference/phase-04-handoff.md` — Phase 4
   closeout; the IP-never-public + GoAffPro retirement context.
4. `docs/superpowers/specs/2026-05-24-phase-06-cart-design.md` — the
   approved Phase 6 spec. §9 includes a "Phase 7 checkout flow"
   sketch — **note the deprecated GoAffPro references in that
   section must be ignored**; Phase 6 reaffirms Phase 4's hard
   constraint #1 (no GoAffPro at runtime).
5. `docs/superpowers/plans/2026-05-24-phase-06-cart.md` — the
   execution plan we just ran. The "Plan deviations" section below
   captures everything that differed from the plan-as-written.
6. `docs/superpowers/specs/2025-05-13-animeniacs-shop-design.md` — the
   master design doc. §6 ("Cart & wishlist") is now half-shipped:
   cart UI is in, checkout flow + wishlist remain.
7. `docs/operations/credentials-inventory.md` — every credential,
   where it lives, end-of-project cleanup checklist. Phase 6 added
   zero credentials.

---

## What Phase 6 actually shipped

### Code

| File / area | What it does |
|---|---|
| `src/lib/cart/types.ts` | **NEW.** `CartEntry`, `CartState`, `CartAction`, `INITIAL_CART_STATE`. Pure data shapes; no React, no DOM. ID-only cart entries per Decision 3. |
| `src/lib/cart/reducer.ts` | **NEW.** `cartReducer(state, action)` with full exhaustiveness checks. `HYDRATE` / `ADD_ITEM` (merges by `(catalogItemId, variationId)`, preserves `addedAt` on merge) / `REMOVE_ITEM` (idempotent) / `SET_QUANTITY` (auto-removes at qty ≤ 0) / `CLEAR` / `OPEN_DRAWER` / `CLOSE_DRAWER`. `totalQuantity(items)` helper. |
| `src/lib/cart/storage.ts` | **NEW.** `CART_STORAGE_KEY = 'animeniacs_cart_v1'`, `MAX_PERSISTED_ENTRIES = 50`. `readPersistedCart()` / `writePersistedCart(items)`. Zod-validated reads; both return-safe (never throw) when localStorage is missing / malformed / unavailable. Write path oldest-first truncates at the cap. |
| `src/app/api/cart/hydrate/route.ts` | **NEW.** `POST /api/cart/hydrate`. Accepts `{ ids: string[] }` (max 50). De-dupes server-side. Fan-out via `Promise.all` over Phase 5's `getProductById()`. Per-id errors swallowed → null. Returns `{ products: Record<id, CachedProduct \| null> }`. 400s for malformed JSON / schema mismatch / oversize. |
| `src/components/cart/useCart.ts` | **NEW.** `useCart()` hook + `CartContext`. Returns `items`, `isDrawerOpen`, `isHydrated`, `totalQuantity`, plus mutations (`addItem`, `removeItem`, `setQuantity`, `clear`) and drawer (`openDrawer`, `closeDrawer`). Throws if used outside `<CartProvider>`. |
| `src/components/cart/CartProvider.tsx` | **NEW client.** `useReducer(cartReducer)`. Hydrates from localStorage in a `useEffect` (so SSR ≠ initial CSR is safe). Persists on item change but only after `isHydrated=true` to avoid clobbering. Cross-tab sync via `storage` event listener (drawer state NOT synced — drawer is per-tab). Always renders `<CartDrawer />` as a sibling to `{children}` so the drawer is portal-mountable from anywhere in the tree. |
| `src/components/cart/useCartHydration.ts` | **NEW client.** Reads cart items, derives a stable `idsKey` (sorted, deduped catalog ids joined), POSTs to `/api/cart/hydrate` on changes. Quantity edits do NOT trigger refetch. Network failure → fallback map of `{ id: null }` so the drawer renders "No longer available" badges. `refresh()` bumps a `version` counter to force re-fetch. |
| `src/components/cart/CartDrawer.tsx` + `CartDrawer.module.css` | **NEW client.** Wraps `@radix-ui/react-dialog`. Three states: empty, hydrating (skeleton lines), hydrated (line items + subtotal). Footer shows three trust badges + disabled Checkout button. Auto-strip-stale on second drawer open (Decision 9): first open shows "No longer available" badges, second open silently removes the stale lines. Stripping is gated on `allItemsHaveProductData` so it doesn't fire while hydration is still pending on the first open. `prefers-reduced-motion` honoured (no slide-in animation). |
| `src/components/cart/CartLine.tsx` | **NEW client.** Per-line renderer. Skeleton while `isHydrating && product === undefined`. "No longer available" + Remove button when product is null OR variation is missing. Otherwise: thumbnail (`next/image`), name, variant, unit price, quantity stepper, line subtotal, Remove. |
| `src/components/cart/CartButton.tsx` | **NEW client.** Header island. SVG cart icon + count badge. Badge hidden pre-hydration (avoids SSR/CSR count mismatch). Badge shows `"99+"` over 99 items. Click opens drawer. `aria-label="Open cart (N items)"`. |
| `src/lib/site-copy.ts` | **MODIFIED.** Phase 5's `DISABLED_ADD_TO_CART_TOOLTIP` renamed to `DISABLED_CHECKOUT_TOOLTIP` (semantic moved: now lives on the checkout button, not the add-to-cart button). Added `CART_BADGE_DELIVERY`, `CART_BADGE_HANGING_STRIPS`, `CART_BADGE_SUPPORT_ARTIST` for the drawer footer trust badges (Decision 8). |
| `src/app/layout.tsx` | **MODIFIED.** Wrapped `<Header />` + `<main>` + `<Footer />` in `<CartProvider>` so the cart context is available app-wide (including the header's `<CartButton>`). |
| `src/components/layout/Header.tsx` | **MODIFIED.** Replaced the stub `<Link href="/cart">Cart</Link>` with `<CartButton />`. Added `items-center` so the SVG icon aligns vertically with the text links. |
| `src/components/product/PdpPurchasePanel.tsx` | **REWRITTEN.** New `productId: string` prop. `useCart()` import. `disabled={!selected}` instead of always disabled. `onClick={handleAddToCart}` — dispatches `ADD_ITEM` + `openDrawer()`. Button background flips to dark when enabled. Removed all references to the launch-tooltip constant (the tooltip now lives on the cart drawer's Checkout button). |
| `src/app/product/[id]/page.tsx` | **MODIFIED.** One-line change: passes `productId={product.id}` to `<PdpPurchasePanel>`. |
| `src/test/setup.ts` | **MODIFIED.** Added a minimal in-memory `localStorage` polyfill for jsdom because Node 26 gates its native `localStorage` behind the `--localstorage-file` CLI flag (which we don't pass). See plan deviation #2 below. |

### Tests added

- **Unit (+68 from baseline 123 = 191):**
  - `tests/cart/reducer.test.ts` — 18 tests
  - `tests/cart/storage.test.ts` — 8 tests
  - `tests/cart/helpers.tsx` — test helpers (`renderWithCart`, `makeEntry`); not a test file but lives under `tests/cart/`
  - `tests/cart/cart-provider.test.tsx` — 6 tests
  - `tests/cart/cart-hydration-hook.test.tsx` — 5 tests
  - `tests/cart/cart-line.test.tsx` — 6 tests
  - `tests/cart/cart-drawer.test.tsx` — 8 tests
  - `tests/cart/cart-button.test.tsx` — 5 tests
  - `tests/api/cart-hydrate.test.ts` — 10 tests
- **Unit (modified):**
  - `tests/header.test.tsx` — 1 case rewritten (cart link → cart button), 1 new case added (`renders the cart button`). Net: 2 → 3 tests.
  - `tests/public/pdp-purchase-panel.test.tsx` — rewritten. 6 cases → 7. The "disabled with launch tooltip" assertion moved to `tests/cart/cart-drawer.test.tsx`; "click adds to cart and opens drawer" added.
- **Integration:** zero added. Phase 6 is client-side; the new
  `POST /api/cart/hydrate` route is exercised by unit tests with a
  mocked `getProductById`. Integration test count unchanged at 55.

Final test counts:
- **Unit:** 191 (123 baseline + 68 new = ≥60 target met)
- **Integration:** 55 (unchanged)

### Infrastructure

No changes. Postgres, Coolify-hosted Logto + Plausible, all unchanged
from Phase 5. `compose.yml` still runs `app` + `postgres` only.

### Database

No schema changes. No migrations.

- **Row counts at handoff:** 15 active artists, 0 `ip_nicknames` (no
  operator IP-nickname rows since Phase 5 smoke).
- `product_cache` still actively used by `getProductById` (which the
  new hydrate route fan-outs to).

### Operational

Nothing the operator needs to do in Square dashboard for Phase 6. All
Phase 6 work is read-only against Square (just re-fetches existing
product cache rows via `getProductById`).

---

## Plan deviations Phase 7 should know about

### 1. Plan referred to `src/components/Header.tsx`; actual file is `src/components/layout/Header.tsx`

The plan's Task D.3 said "Modify: `src/components/Header.tsx`". In this
repo the Header lives at `src/components/layout/Header.tsx`. No code
impact — just adjust references when navigating.

### 2. Added `localStorage` polyfill to `src/test/setup.ts`

Node 26 ships a native `localStorage` but gates it behind a
`--localstorage-file` CLI flag we don't pass. jsdom 25 (the version in
this repo) does NOT install its own `localStorage` shim when Node's is
absent, so `window.localStorage` was `undefined` in tests. Phase 6 is
the first time the test suite touches localStorage (`storage.test.ts`
+ the provider hydration flow), so we added an ~30-line in-memory
`Storage` shim to `src/test/setup.ts`. Phase 7 inherits this — any
future test that reads `localStorage` Just Works.

### 3. CartDrawer auto-strip-stale logic redesigned vs the plan's snippet

The plan's `useEffect` triggered staleness processing only on the
"justOpened" transition (`isDrawerOpen && !prevOpenRef.current`). That
breaks because the products map from `useCartHydration` arrives
asynchronously — at the moment of the open transition, products is
still empty, so no entry registers as stale, and by the time products
loads, `justOpened` is false. **Fix:** added a third ref
`processedThisOpenRef` that resets to false on the open transition and
flips to true once products has data for every cart item. Processing
runs at most once per open. Behaviour matches Decision 9 exactly
(first open shows badges, second open removes). Documented in
`src/components/cart/CartDrawer.tsx` with a comment.

### 4. Test-only: `<DrawerOpener>` fixture must not render its own `<CartDrawer />`

The plan's `tests/cart/cart-drawer.test.tsx` rendered a `<DrawerOpener>`
helper containing `<button>open</button> + <CartDrawer />`. But the
`<CartProvider>` already renders `<CartDrawer />` as its sibling, so
the test ended up with two drawer instances racing for `aria-hidden`
ownership and breaking `getByRole('dialog')`. Removed the second
`<CartDrawer />` from the fixture — provider-mounted drawer is the
only one needed.

### 5. Test-only: `tests/cart/cart-line.test.tsx` quantity-stepper assertion needed a live-state wrapper

`<CartLine>` is purely presentational — its `entry` prop is static. The
plan's test clicked the "Increase quantity" button and asserted the
input value reflected the new quantity, but since the prop never
updates, that assertion fails. Wrapped CartLine in a tiny `Wrapper`
component that reads `items[0]` from `useCart()` and passes it as the
entry prop, so the input value tracks the live cart state.

### 6. Test-only: `tests/cart/cart-drawer.test.tsx` subtotal assertion scoped to test id

The plan asserted `screen.getByText('$30.00')` for the case where a
single line at qty 2 of a $15 item yields both a $30 line subtotal AND
a $30 cart subtotal — duplicate match crashes `getByText`. Scoped the
cart-subtotal assertion to `getByTestId('cart-subtotal')` to match its
multi-line sibling test.

### 7. Test-only: `tests/cart/cart-hydration-hook.test.tsx` refresh test took baseline call count

Because `<CartProvider>` mounts its own `<CartDrawer>` which itself
calls `useCartHydration`, the initial render produces ≥1 fetch from
the drawer's hook in addition to the test's probe hook. Asserting
`toHaveBeenCalledTimes(1)` breaks. Captured the call count after
initial settle as `baseline`, then asserted `>baseline` after pressing
refresh — same correctness, deterministic across mount-orders.

### 8. Test-only: dropped `// biome-ignore lint/suspicious/noExplicitAny: stub fetch` suppressions

Replaced `global.fetch = fetchMock as any` with
`global.fetch = fetchMock as unknown as typeof fetch` in two test
files. Cleaner; doesn't trip biome's `noExplicitAny` rule; preserves
the type cast intent.

### 9. `useCartHydration` deps required restructure for biome

The plan's `useEffect` had `[idsKey, isHydrated, version]` in deps
with a single `biome-ignore lint/correctness/useExhaustiveDependencies`
above the `}, [...])` line. Biome flagged three separate issues
(missing `items.length`, missing `items.map`, unused `version`) and
the suppression syntax can suppress only the lint on the line directly
below. Restructure: pre-compute the dedupe-and-sort step into
`sortedIds = Array.from(new Set(items.map(...))).sort()` outside the
effect, so the effect itself doesn't reference `items`. To satisfy the
unused-`version` flag, the effect body does `void version` (the value
isn't used; the bump is what re-runs the effect). Net: zero
suppression comments needed.

### 10. `src/lib/site-copy.ts` kept a deprecated alias for one commit window

Task D.1 (site-copy rename) lands before D.4 (PdpPurchasePanel rewrite
that drops the old constant). To keep `pnpm typecheck` green for the
intermediate commits, `DISABLED_ADD_TO_CART_TOOLTIP` was kept as a
deprecated re-export of `DISABLED_CHECKOUT_TOOLTIP`. Removed in the
D.4 commit. Pure code-hygiene workaround; no runtime impact.

### 11. Followed Phase 5 deviations 4–6 patterns where applicable

- `vi.hoisted()`: not needed — Phase 6 mocks use the
  `vi.mock(path, () => ({ ... }))` factory form which avoids the
  initialization-order pitfall.
- `getByLabelText` exact-match: applied in `tests/public/pdp-purchase-panel.test.tsx`
  for the `Size` / `Media` selects (plan's snippet had it correct).
- Biome auto-fixes: ran `pnpm exec biome check --write .` several
  times during execution to clean up multi-line → single-line
  reformatting and import-order. Not committed standalone —
  bundled with the task that introduced the file.

---

## Hard constraints (still in force)

These come from Phase 4 + are reaffirmed by Phase 5 + Phase 6. All
non-negotiable for every future phase. Phase 6 introduced **no new**
constraints.

1. **No GoAffPro at runtime.** `grep -rn "goaffpro\|GoAffPro" src/ tests/`
   must return zero. The probe script under `scripts/goaffpro/probe.ts`
   is historical reference only.
2. **No `artist` Square custom attribute definition.** Artists resolve
   via the local `artists` table joined by `squareCategoryId`.
3. **No new auth vendors.** Reuse existing Logto + `(admin)` route
   group. Phase 6 added no admin routes.
4. **No commission engine.** Manual monthly Square dashboard reporting.
5. **No additional Postgres tables for affiliate / commission tracking.**
   Phase 6 added zero tables.
6. **Sandbox-first for any production write.** Phase 6 did no Square
   writes. **Phase 7 will need to honour this** when it creates Square
   orders + payment links from the cart.
7. **IP categories never public via their literal Square name.** Two
   regression tests enforce this:
   - `tests/public/product-detail-page.test.tsx` asserts breadcrumbs =
     `Home / {name}` (no IP segment).
   - `tests/public/category-page.test.tsx` asserts the rendered DOM
     never contains `Anime` or `Naruto` (literal Square category names
     from the mocked `getCategoryNameMap`).
   Both must stay green. Don't disable; fix any leak that trips them.

---

## What's deferred (NOT Phase 6 scope, queued for Phase 7+)

| Item | Source | Likely phase |
|---|---|---|
| Checkout API: `POST /api/checkout` → Square Payment Link → redirect | Spec §9 / handoff TL;DR | Phase 7 (recommended) |
| `/checkout/success` page (reads order id from query, fires Plausible conversion event) | Spec §9 | Phase 7 |
| Abandoned-cart writes to the existing `abandoned_carts` Postgres table | Spec §6 / Phase 2 schema | Phase 7 |
| Square checkout webhook handler (order.created / order.updated) | Phase 3 plan tasks 9–11 | Phase 7 or 8 |
| Discord + SMS post-purchase notifications | Master spec §6 / §9 | Phase 7+ |
| Promo bar (header alert strip) + `/admin/settings` page to edit | Spec §10 | Phase 7+ |
| Wishlist UI (Postgres + localStorage merge) | Spec §6.2 | Phase 7+ |
| Reviews UI (read + write) | Spec §7 | Phase 7+ |
| Recently-viewed strip (localStorage + server enrichment) | Spec §8 | Phase 7+ |
| IP cover image uploads (`cover_image_url` already exists) | Phase 5 sub-decisions | Phase 7+ |
| PDP upsells (universal-upsells admin row) | Spec §10 | Phase 7+ |
| `/shop` listing page + the middle breadcrumb segment | Spec §5 (deferred) | Phase 7+ |
| Footer / nav links to `/category/[slug]` | Phase 5 decision: operator hand-shares URLs | Phase 7+ |
| `pnpm square:sync` backfill script | Phase 3 plan task 8 | Phase 7+ |

Phase 4 deferred items still standing (none changed in Phase 5 or 6):

| Item | Status | When |
|---|---|---|
| Plan C.3 — re-categorize the 229 production items into artist + IP categories in Square | Operator's dashboard task | Whenever. New IP nicknames + cache pick up changes within 60s (60s cache TTL on `getItemsByCategoryId`). |
| Avatar uploads per artist | Operator's task via admin UI | Whenever. |
| GoAffPro subscription cancellation | Operator's task in GoAffPro dashboard | Whenever. Runtime no longer reads from it. |
| Credentials cleanup sweep | Final phase | All Phase 4-era short-lived credentials still in `.env.local` per operator's "defer to last phase" decision. See `docs/operations/credentials-inventory.md`. |

---

## Where credentials live

**TL;DR: every credential is in `.env.local` (gitignored).** Inventory + cleanup plan in
`docs/operations/credentials-inventory.md`. **Phase 6 added zero new credentials.**

Phase 7 will likely need:
- `SQUARE_ACCESS_TOKEN` (sandbox) — already set; checkout sandbox testing
- `SQUARE_PROD_ACCESS_TOKEN` — already set; only for prod cutover
- `SQUARE_LOCATION_ID` (sandbox + prod) — already set per Phase 5
  handoff note; Phase 7's Square Order creation will need this
- `LOGTO_*` for any new admin routes — already set
- New: nothing yet locked; if Phase 7 adds the webhook handler it'll
  need `SQUARE_WEBHOOK_SIGNATURE_KEY` (sandbox + prod).

Coolify resource UUIDs unchanged from Phase 4:
- Server `animaniacs-shared-host`: `z0sg4ogw4ossg4880080ws8k`
- Project `website` (where Logto lives): `q4gso4kow0k08gowc4g40ww4`

---

## Phase 7 scope (suggested, not locked)

The disabled Checkout button at the bottom of `<CartDrawer>` is the
natural starting point. Look at it in
`src/components/cart/CartDrawer.tsx:90-97`. It already has the correct
semantics (`type="button"`, the launch tooltip from
`DISABLED_CHECKOUT_TOOLTIP`). Phase 7 just needs to swap `disabled`
for an `onClick` handler that:

1. POSTs the current `cart.items` to a new `POST /api/checkout` route.
2. The route creates a Square Order via the Catalog/Orders API and
   then a Square Payment Link via the Checkout API. Sandbox-first per
   hard constraint #6.
3. The route writes a row to the existing `abandoned_carts` Postgres
   table for the SMS-reminder seed (the Phase 2 schema is already
   present; no migration needed).
4. The route returns the hosted Square payment URL.
5. Client redirects the buyer (`window.location.href = url`).
6. A new `src/app/checkout/success/page.tsx` reads `?orderId=` from
   the query, looks up the order details, displays a confirmation,
   and fires a Plausible `checkout_completed` event.
7. Optional in Phase 7 or pushed to Phase 8: the Square webhook
   handler at `POST /api/webhooks/square` that confirms the order
   status and triggers downstream notifications.

What Phase 7 should NOT scope:
- Reviews, wishlist, recently-viewed, PDP upsells, promo bar — all
  queued later per the spec.
- Discord + SMS notifications — depend on the webhook handler; if
  the handler ships in Phase 7, notifications can ship in Phase 8.
- IP cover image uploads — independent admin feature; pushed.

Don't lock anything from this list. The next master terminal
brainstorm will refine.

---

## Verification state at handoff

- `pnpm lint`: clean (143 files)
- `pnpm typecheck`: clean
- `pnpm test`: 191/191 passing (up from 123 baseline; **+68**)
- `pnpm test:integration`: 55/55 passing (unchanged)
- `pnpm build`: clean. 30 routes total (up from 29 in Phase 5):
  - 1 new dynamic route: `ƒ /api/cart/hydrate`
  - All other routes unchanged from Phase 5
- Git tag `phase-6-cart` to be applied at HEAD after operator manual
  smoke confirmation. Pre-tag HEAD: `7793bbc` (or the commit of the
  handoff doc itself).
- Phase 6 commit count: 18 commits from `phase-5-product-detail-page`
  tag to the pre-handoff HEAD.
- Local DB: 15 active artist rows, 0 `ip_nicknames` rows (operator
  hasn't created any yet — fine; Phase 6 doesn't read or write that
  table).
- Production Square: 15 artist sub-categories, 30 graveyard SKUs
  archived. Unchanged from Phase 4 / 5.
- Coolify-hosted services healthy: Logto + Plausible. Unchanged.

---

## How to verify this hand-off is correct

Before starting Phase 7 work, the next agent should run:

```sh
# Confirm we're at the right commit
git describe --tags --abbrev=0       # → phase-6-cart
git rev-parse HEAD                    # → 7793bbc... or descendant

# Confirm green baseline
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration

# Confirm DB state
docker exec animeniacs-postgres psql -U animeniacs -d animeniacs \
  -c "SELECT count(*) FROM artists WHERE status='active';" \
  -c "SELECT count(*) FROM ip_nicknames;"
# Should print: 15 artists, 0+ ip_nicknames (depends on whether
# operator has created rows since Phase 5; treat any count as
# acceptable — the production schema is what matters).

# Confirm new route renders (with dev server up)
curl -s -X POST http://localhost:3000/api/cart/hydrate \
  -H 'Content-Type: application/json' \
  -d '{"ids":[]}'
# Should print: {"products":{}}

# Confirm hard-constraint canary still clean
grep -rn "goaffpro\|GoAffPro" src/ tests/
# Should print: nothing.

# Confirm Phase 5 IP-leak regression tests still green
pnpm vitest run tests/public/product-detail-page.test.tsx tests/public/category-page.test.tsx
# Should print: 14 passing.

# Confirm production build still passes
pnpm build
# Should print: 30 routes total, including ƒ /api/cart/hydrate.
```

If any of those fail, stop and investigate before touching Phase 7
code. The baseline state is part of the contract.
