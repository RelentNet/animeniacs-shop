# Phase 6 — Cart design spec

**Status:** APPROVED design, ready to plan.
**Date:** 2026-05-24
**Predecessor:** `docs/superpowers/specs/reference/phase-05-handoff.md`
**Next step:** invoke `superpowers:writing-plans` to produce
`docs/superpowers/plans/2026-05-24-phase-06-cart.md`.

---

## 0. Goals

Ship the client-side cart. Customer can add items from the PDP, see them
in a slide-out drawer with always-fresh product data, edit quantities,
remove lines, and see a subtotal. The cart persists in localStorage.

The drawer's **Checkout** button is rendered but disabled with a launch
tooltip — Phase 7 wires the actual checkout API. This continues the
Phase 5 pattern of "visible but not-yet-functional CTA" until the
operator decides the launch is ready.

## 1. Non-goals (Phase 6 does NOT ship)

- No checkout API (`/api/checkout`).
- No `/checkout/success` page.
- No Square writes anywhere.
- No abandoned-cart Postgres logging (table from Phase 2 stays unused).
- No promo progress bar (spec §6.3) — defers to Phase 7+ alongside
  `/admin/settings`.
- No `/cart` page route. Drawer is the only cart UI.
- No wishlist (spec §6.2).
- No order notifications / Square webhook handler.
- No multi-tab drawer-open sync (cart contents *do* sync; the drawer's
  open/closed state intentionally does not).
- No authenticated cart merging — Phase 6 is anonymous-only.

## 2. Hard constraints (still in force from Phase 4 + 5)

Inherited unchanged from `phase-05-handoff.md`:

1. **No GoAffPro at runtime.**
2. **No `artist` Square custom attribute definition.**
3. **No new auth vendors.**
4. **No commission engine.**
5. **No additional Postgres tables for affiliate / commission tracking.**
   Phase 6 adds zero new tables.
6. **Sandbox-first for any production write.** Phase 6 does no Square
   writes; this becomes load-bearing in Phase 7.
7. **IP categories never public via their literal Square name.** Two
   Phase 5 regression tests stay green throughout Phase 6.

## 3. Locked decisions (10)

| # | Decision |
|---|----------|
| 1 | **Phase 6 scope = cart-only.** No checkout. Drawer's Checkout button rendered + disabled with tooltip. |
| 2 | **Cart state via React Context + useReducer + `useCart()` hook.** Zero new state-management deps. localStorage sync via useEffect. `isHydrated` flag prevents SSR/CSR mismatch. |
| 3 | **Cart entry shape = ID-only:** `{ catalogItemId, variationId, quantity, addedAt }`. Drawer hydrates display data via `getProductById()` so the cart never goes stale. |
| 4 | **No promo bar in Phase 6.** Defers to Phase 7+ alongside `/admin/settings`. |
| 5 | **Header cart icon = `<CartButton>` client island** inside the existing server `<Header>` component. |
| 6 | **Drawer state lives in the cart context.** `useCart()` returns `isDrawerOpen`, `openDrawer`, `closeDrawer`. Drawer is rendered once inside `<CartProvider>`. |
| 7 | **No `/cart` page route.** Drawer-only. |
| 8 | **Three trust badges in drawer footer**, constants in `src/lib/site-copy.ts`: `CART_BADGE_DELIVERY`, `CART_BADGE_HANGING_STRIPS`, `CART_BADGE_SUPPORT_ARTIST`. |
| 9 | **Stale entries** (line that hydrates to `null`): show "No longer available" badge on first drawer-open, auto-remove on next open. |
| 10 | **Drawer hydrates via `POST /api/cart/hydrate`** route handler. |

Plus four self-locked design choices (made by the master terminal at
operator request to reduce question volume):

- **Drawer primitive:** `@radix-ui/react-dialog` (NOT vaul, NOT hand-rolled). Sized at ~6 KB gz; gives focus trap + scroll lock + ARIA Dialog role + ESC handling for free. Vaul's mobile-bottom-sheet differentiators (swipe, snap points) are not needed for a desktop-first right-side cart.
- **Auto-strip stale entries** uses a `Set<string>` ref of warned line keys. First drawer-open after staleness shows the badge; subsequent opens remove the line. Ref is ephemeral (forgets on page reload — fine because reload re-hydrates from localStorage and re-runs the fetch).
- **Re-fetch on cart-ID change, not on quantity change.** Quantity edits don't change the set of catalog IDs, so no extra hydrate call. Subtotal recomputes locally from the cached `products` map.
- **Drawer width:** `100%` on mobile (full screen), `max-width: 24rem` on tablet+. Standard side-sheet pattern.

## 4. Acceptance criteria

1. Click Add to Cart on `/product/<id>` → drawer slides in showing the
   added line with the selected variation + quantity.
2. Drawer lines render with image, name, variant name (if applicable),
   unit price × qty, line subtotal, qty stepper (min 1), and remove button.
3. Header cart icon shows a badge with the live total quantity; updates
   on cart change; persists across reload.
4. Drawer footer shows three trust badges and a disabled Checkout button
   with the launch tooltip.
5. Stale-entry behaviour: archive a Square item between Add-to-Cart and
   drawer open → "No longer available" badge first render → line auto-
   removed on next drawer open.
6. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`,
   `pnpm build` all pass. Git tag `phase-6-cart` applied at the final
   commit.

## 5. Architecture overview

```
src/
├── app/
│   ├── layout.tsx                                # MODIFY: wrap children in <CartProvider>
│   └── api/cart/hydrate/route.ts                 # NEW: POST handler
├── components/
│   ├── Header.tsx                                # MODIFY: insert <CartButton />
│   ├── cart/
│   │   ├── CartProvider.tsx                      # NEW (client): reducer + localStorage sync + drawer mount
│   │   ├── CartDrawer.tsx                        # NEW (client): radix-dialog wrapper
│   │   ├── CartDrawer.module.css                 # NEW
│   │   ├── CartLine.tsx                          # NEW (client): single line subcomponent
│   │   ├── CartButton.tsx                        # NEW (client): header icon + badge
│   │   ├── useCart.ts                            # NEW: hook + context type
│   │   └── useCartHydration.ts                   # NEW: fetches /api/cart/hydrate for current cart
│   └── product/
│       └── PdpPurchasePanel.tsx                  # MODIFY: enable button, wire addItem + openDrawer
├── lib/
│   ├── cart/
│   │   ├── types.ts                              # NEW: CartEntry, CartState, CartAction
│   │   ├── reducer.ts                            # NEW: pure reducer + helpers
│   │   └── storage.ts                            # NEW: localStorage read/write/validate
│   └── site-copy.ts                              # MODIFY: rename DISABLED_ADD_TO_CART_TOOLTIP, add 3 badges
└── ...

tests/
├── api/cart-hydrate.test.ts                      # NEW (~9 cases)
├── cart/
│   ├── reducer.test.ts                           # NEW (~12 cases)
│   ├── storage.test.ts                           # NEW (~8 cases)
│   ├── cart-provider.test.tsx                    # NEW (~6 cases)
│   ├── cart-hydration-hook.test.ts               # NEW (~5 cases)
│   ├── cart-drawer.test.tsx                      # NEW (~12 cases)
│   ├── cart-line.test.tsx                        # NEW (~6 cases)
│   ├── cart-button.test.tsx                      # NEW (~5 cases)
│   └── helpers.tsx                               # NEW: renderWithCart() test helper
├── header.test.tsx                               # MODIFY: assert CartButton renders
├── public/pdp-purchase-panel.test.tsx            # MODIFY: button is enabled; click adds + opens
└── public/product-detail-page.test.tsx           # MODIFY: wrap in test provider if needed

package.json                                       # MODIFY: add @radix-ui/react-dialog
```

No DB migrations. No new env vars.

## 6. Cart state architecture

### 6.1 Types (`src/lib/cart/types.ts`)

```ts
export interface CartEntry {
  catalogItemId: string
  variationId: string
  quantity: number
  addedAt: string // ISO-8601
}

export interface CartState {
  items: CartEntry[]
  isDrawerOpen: boolean
  isHydrated: boolean
}

export type CartAction =
  | { type: 'HYDRATE'; items: CartEntry[] }
  | { type: 'ADD_ITEM'; entry: Omit<CartEntry, 'addedAt'> }
  | { type: 'REMOVE_ITEM'; catalogItemId: string; variationId: string }
  | { type: 'SET_QUANTITY'; catalogItemId: string; variationId: string; quantity: number }
  | { type: 'CLEAR' }
  | { type: 'OPEN_DRAWER' }
  | { type: 'CLOSE_DRAWER' }
```

### 6.2 Reducer rules

- **HYDRATE**: replace items, set `isHydrated=true`. Fires once on mount.
- **ADD_ITEM**: merge with existing entry by `(catalogItemId, variationId)` — quantity sums, `addedAt` unchanged. Otherwise append with fresh `addedAt`.
- **REMOVE_ITEM**: idempotent strip.
- **SET_QUANTITY**: `quantity <= 0` behaves as REMOVE_ITEM. Otherwise set.
- **CLEAR**: empty items. Drawer state untouched.
- **OPEN_DRAWER / CLOSE_DRAWER**: toggle drawer state independent of items.

### 6.3 Public `useCart()` API

```ts
interface UseCartReturn {
  items: readonly CartEntry[]
  isDrawerOpen: boolean
  isHydrated: boolean
  totalQuantity: number // 0 until isHydrated
  addItem: (entry: Omit<CartEntry, 'addedAt'>) => void
  removeItem: (catalogItemId: string, variationId: string) => void
  setQuantity: (catalogItemId: string, variationId: string, quantity: number) => void
  clear: () => void
  openDrawer: () => void
  closeDrawer: () => void
}

export function useCart(): UseCartReturn
```

Throws a clear error if used outside `<CartProvider>`. Subtotal is NOT
in the API — it requires hydrated prices and lives in the drawer.

### 6.4 localStorage sync

`<CartProvider>` runs three effects:

1. **Hydrate on mount** — read `animeniacs_cart_v1`, validate via Zod, dispatch HYDRATE. Any failure (missing, malformed, schema mismatch) → empty array.
2. **Persist on items change** — when `isHydrated && state.items changed`, write items to localStorage.
3. **Cross-tab sync** — `window.addEventListener('storage', ...)` re-dispatches HYDRATE when the same key changes in another tab. Drawer state is NOT synced across tabs.

Persisted-cart Zod schema:

```ts
const CartEntrySchema = z.object({
  catalogItemId: z.string().min(1),
  variationId: z.string().min(1),
  quantity: z.number().int().positive(),
  addedAt: z.string().datetime()
})
const PersistedCartSchema = z.array(CartEntrySchema)
```

Storage layer caps writes at 50 entries (defensive; truncates oldest).

## 7. `POST /api/cart/hydrate` route handler

```
POST /api/cart/hydrate
Content-Type: application/json
Body: { "ids": ["ITEM_A", "ITEM_B", ...] }   // max 50

200 OK:
{ "products": { "ITEM_A": <CachedProduct>, "ITEM_B": null, ... } }

400 Bad Request (malformed body, oversize array, wrong types)
405 Method Not Allowed (anything other than POST)
```

Implementation: `Promise.all(ids.map(getProductById))` after dedup, no
HTTP cache headers (rely on the Postgres TTL from Phase 5). Per-ID
errors are swallowed and surface as `null` in the response.

## 8. Drawer + button components

### 8.1 `<CartDrawer>` — wraps `@radix-ui/react-dialog`

- Right-anchored slide-in, ~250ms animation. CSS-module styles. `prefers-reduced-motion` disables transitions.
- Renders Title `"Your cart ({totalQuantity})"`, lines list (or empty state), footer (subtotal, badges, disabled Checkout, hint).
- Subtotal = sum of `(variation.price.amount × entry.quantity)` for entries whose product+variation hydrated successfully.
- `Dialog.Root` controlled by `isDrawerOpen` via `onOpenChange`.
- Width: `100%` mobile, `max-width: 24rem` tablet+.

### 8.2 `<CartLine>` — single line subcomponent

Three render states:

1. **Hydrating** (initial fetch in flight): skeleton (gray blocks).
2. **Hydrated**: `next/image` thumbnail, name, variant name, unit price, qty stepper (− / number / +), line subtotal, remove button.
3. **Stale** (product or variation is `null`): greyed-out container, "No longer available" badge, remove button only.

### 8.3 Auto-strip stale entries

The drawer holds a `Set<string>` ref of "warned line keys" (`${catalogItemId}::${variationId}`). On drawer open:
- Any stale entry **not** in the set: add to set, render with badge (warning the user).
- Any stale entry **already** in the set: call `removeItem(...)` before render (user already saw the warning on previous open).

Ref forgets on page reload — fine, because reload re-runs hydration anyway.

### 8.4 `<CartButton>` — header client island

- Inline SVG cart icon (no icon-library dep — Phase 4 precedent with `<InstagramIcon>`).
- Badge hidden until `isHydrated`; renders count when > 0; renders "99+" past 99.
- Click → `openDrawer()`.
- `aria-label="Open cart ({n} items)"`.

### 8.5 `useCartHydration()` hook

- Reads cart items from `useCart()`.
- Builds stable `idsKey` from sorted unique IDs.
- On `idsKey` change (and after isHydrated), POSTs `/api/cart/hydrate` with the deduped IDs.
- Exposes `{ products, isLoading, refresh }`.
- Network error → all-null products map (drawer treats every line as stale; user can close+reopen to retry).

## 9. PDP + Header integration

### 9.1 Root layout

`src/app/layout.tsx` wraps `{children}` in `<CartProvider>`. Server
component stays server; provider is the client island. `<CartDrawer>`
renders once inside provider.

### 9.2 Header

`<Header>` stays server. One new line: `<CartButton />` inserted next to
nav links. Existing header tests unchanged; one new assertion added.

### 9.3 PDP — `<PdpPurchasePanel>` wiring

Changes to the existing component:

- Add `productId: string` prop.
- Remove `disabled` + `title` from the button.
- Remove the `<small>{DISABLED_ADD_TO_CART_TOOLTIP}</small>` hint below.
- Wire `onClick={handleAddToCart}` where:
  ```ts
  function handleAddToCart() {
    if (!selected) return
    addItem({ catalogItemId: productId, variationId: selected.id, quantity: qty })
    openDrawer()
  }
  ```
- `disabled={!selected}` — preserves the "Combination unavailable" disabled state.
- `src/app/product/[id]/page.tsx` passes `productId={product.id}`.

### 9.4 `site-copy.ts` changes

- Rename `DISABLED_ADD_TO_CART_TOOLTIP` → `DISABLED_CHECKOUT_TOOLTIP`.
- New copy: `'Checkout launching soon — follow us on Instagram for the launch.'`
- Add `CART_BADGE_DELIVERY = 'Ships in 3-10 days depending on convention schedule.'`
- Add `CART_BADGE_HANGING_STRIPS = 'Free hanging strips included with every order.'`
- Add `CART_BADGE_SUPPORT_ARTIST = 'Every purchase supports an independent artist.'`
- `PRODUCTION_TIME_TEXT` stays.

## 10. Testing strategy

Same discipline as Phases 4 + 5. No new frameworks. New `tests/cart/helpers.tsx` exposes `renderWithCart(ui, { initialItems })`.

### 10.1 Unit tests (~62 new)

- `tests/cart/reducer.test.ts` (~12) — all actions + merge + clamp.
- `tests/cart/storage.test.ts` (~8) — read/write/validate/cap/recover.
- `tests/cart/cart-provider.test.tsx` (~6) — mount, throw outside provider, hydrate effect, persist effect, cross-tab `storage` event.
- `tests/cart/cart-hydration-hook.test.ts` (~5) — fetch with dedup, loading state, refresh, network error.
- `tests/cart/cart-drawer.test.tsx` (~12) — empty state, lines from mocked hydration, subtotal, stale-badge first open, auto-remove second open, remove + qty stepper, qty clamp, disabled Checkout + tooltip, trust badges, close button.
- `tests/cart/cart-line.test.tsx` (~6) — hydrating skeleton, hydrated rendering, stale rendering, remove triggers `removeItem`.
- `tests/cart/cart-button.test.tsx` (~5) — badge hidden pre-hydration, count, "99+", click opens, aria-label.
- `tests/api/cart-hydrate.test.ts` (~9) — happy path, dedup, null passthrough, throw passthrough, malformed body 400, oversize array 400, missing key 400, wrong type 400, GET → 405.

### 10.2 Test files modified

- `tests/public/pdp-purchase-panel.test.tsx` — Phase 5 "disabled with launch tooltip" assertions replaced with cart-wired behaviour:
  - Button is enabled when variation selected.
  - Button disabled when `selected === null` ("Combination unavailable" branch).
  - Click calls `addItem` with `{catalogItemId, variationId: selected.id, quantity: qty}` and `openDrawer()`.
- `tests/header.test.tsx` — add one assertion that `<CartButton>` renders (look for the open-cart aria-label).
- `tests/public/product-detail-page.test.tsx` — wrap in `renderWithCart` if context errors arise from `<PdpPurchasePanel>`'s new `useCart()` dependency.

### 10.3 Integration tests

None added. Phase 6 has no DB writes and no new server-side data paths beyond the route handler (unit-tested with mocked `getProductById`). Integration count stays at 55.

### 10.4 Manual smoke checklist (operator runs before tagging)

1. `pnpm dev` + Postgres up.
2. Visit `/product/<real-item-id>`. Variant picker behaves (Phase 5).
3. Click Add to Cart. Drawer slides in. Line shows correctly.
4. Increment qty in drawer. Subtotal updates.
5. Decrement to 0 → line removed.
6. Close drawer. Header badge shows count.
7. Reload page. Cart contents survive. Badge matches.
8. Open second tab to a public page. Add an item in tab 1. Tab 2's badge updates (storage event). Confirm: the drawer that opened in tab 1 does NOT auto-open in tab 2 — drawer open/close state is intentionally not cross-tab synced (per Decision 6 architecture).
9. Add an item, then in dev tools localStorage edit the variationId to bogus. Reopen drawer: stale badge. Close+reopen: line gone.
10. Click disabled Checkout button. Tooltip says "Checkout launching soon — follow us on Instagram for the launch."
11. Confirm no DOM regressions on `/`, `/artist`, `/artist/<slug>`, `/category/<slug>`. Header cart icon present on all.
12. View source on a public page. No Square category names. Phase 5 regression guard intact.

### 10.5 Pre-tag acceptance gate

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
grep -rn "goaffpro\|GoAffPro" src/ tests/   # must be zero
```

Expected counts: unit 123 → ~185, integration 55 unchanged.

## 11. What's NOT in Phase 6 (deferred to Phase 7+)

- Cart drawer's Checkout button click handler (Phase 7).
- `/api/checkout` route + Square Payment Link creation (Phase 7).
- `/checkout/success` page (Phase 7).
- `abandoned_carts` row writes (Phase 7).
- Square webhook handler + signature verification (Phase 7+).
- Order notifications (Discord + SMS) (Phase 7+).
- Promo progress bar + `/admin/settings` infrastructure (Phase 7+).
- Wishlist UI (Phase 7+).
- Reviews UI (Phase 7+).
- Recently-viewed strip (Phase 7+).
- IP cover-image upload UI (Phase 7+).
- PDP upsells (Phase 7+).
- `/shop` listing page (Phase 7+).
- Footer / nav links to `/category/[slug]` (Phase 7+).

## End of spec.
