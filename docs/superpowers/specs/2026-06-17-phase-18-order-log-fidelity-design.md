# Phase 18 — Order-Log Fidelity + Checkout Shipping Address — Design Spec

**Date:** 2026-06-17
**Status:** approved for planning (operator chose "all three" — order state +
shipment details + checkout address — 2026-06-17).
**Depends on:** Phase 17 (read-only order log) — shipped + verified + tagged.

## 1. Goal

Make the read-only order log mirror Square more fully, and capture the data
needed to ship physical goods via Square + Shippo:

1. **Mirror Square order state** (`DRAFT/OPEN/COMPLETED/CANCELED`) in the admin
   log, ALONGSIDE our derived `status` (which stays — it's customer-facing and
   powers review-verification). Fixes the "we say Completed, Square says OPEN"
   mismatch.
2. **Reflect shipment details** — recipient (name/address), carrier, tracking
   number + URL — in the admin order detail. Production orders already carry
   these (matters for cutover).
3. **Checkout collects a ship-to address** (customer-facing) so NEW orders carry
   shipping data Square + Shippo can fulfill against.

**Migration-free, no new webhook subscription, no new build-time env var.**

## 2. Current state (repo truth)

- `orders.raw` (jsonb) stores the full Square order — and **already contains
  `state` + `fulfillments[].shipmentDetails`**. But `raw` is written ONLY at
  recording (`upsertOrder` via `buildOrder`); the refund/fulfillment webhooks
  (`updateOrderStatus`, `setOrderFulfillmentState`) do NOT refresh it → `raw`
  goes stale. `src/lib/db/queries/orders.ts`.
- `buildOrder` already sanitizes `raw` via `toJsonSafe` (BigInt-safe) — Phase 17
  fix. `src/lib/orders/build-order.ts` (the sanitizer is currently file-private).
- `listOrders` returns full `Order` rows **including `raw`** — so reading
  `raw.state` for a list column is free (data already loaded).
- Checkout: `createPaymentLink` sets `checkoutOptions: { redirectUrl }` only —
  no shipping address collected. `src/lib/checkout/create-payment-link.ts`.
- Reconcile path: `src/lib/webhooks/reconcile.ts` already fetches the authoritative
  Square order on refund/fulfillment events — the natural place to also persist
  fresh `raw`.

## 3. Square SDK shapes (v44 — pinned)

- `CheckoutOptions.askForShippingAddress?: boolean` — set `true` on the payment
  link to make Square collect the buyer's shipping address + create a SHIPMENT
  fulfillment.
- `Fulfillment.shipmentDetails?: FulfillmentShipmentDetails` =
  `{ recipient?: FulfillmentRecipient, carrier?, shippingType?, trackingNumber?, trackingUrl?, shippedAt? }`.
- `FulfillmentRecipient` = `{ displayName?, emailAddress?, phoneNumber?, address?: Address }`.
- `Address` = `{ addressLine1?, addressLine2?, locality?, administrativeDistrictLevel1?, postalCode?, country? }`.
- Order state lives at `order.state` (`DRAFT/OPEN/COMPLETED/CANCELED`).

## 4. Design

### 4.1 Mirror order state (read-only)
- Display Square's raw `order.state` (read from `raw.state`) — show the literal
  Square value (matches the dashboard) — in the order **detail** and as a column
  in the **list**. Keep the derived `status` column too (clearly labeled, e.g.
  "Status" = ours, "Square" = Square's state).
- No mapping/relabel — the operator wants to MATCH Square's wording.

### 4.2 Reflect shipment details (read-only)
- In the order **detail**, add a "Shipment" section sourced from the first
  `raw.fulfillments[]` whose `type === 'SHIPMENT'` and that has `shipmentDetails`:
  recipient `displayName`, formatted `address`, `carrier`, `shippingType`,
  `trackingNumber` (rendered as a link to `trackingUrl` when present), `shippedAt`.
- Empty state ("No shipment details") when there is no SHIPMENT fulfillment —
  e.g. DIGITAL orders.
- Pure extraction/formatting (testable without I/O); put parsing in a small pure
  module (e.g. `src/lib/orders/shipment.ts`) so it's unit-testable.

### 4.3 Keep `raw` fresh (so 4.1/4.2 reflect current state)
- On `refund.*` and `order.fulfillment.updated`, after the reconcile helper
  fetches the authoritative Square order, **persist its sanitized `raw`** to the
  order row (BigInt-safe). Add a focused query (e.g. `updateOrderRaw(squareOrderId, raw)`)
  or extend the reconcile to write `raw` alongside status/fulfillment.
- Reuse the BigInt-safe sanitizer (export `toJsonSafe` from `build-order.ts`, or
  a shared `src/lib/orders/json-safe.ts`) — do NOT persist raw bigints (would
  re-introduce the Phase 17 serialization crash).
- `order.fulfillment.updated` already fires when fulfillments complete, which is
  when Square flips the order OPEN→COMPLETED — so order state stays current in
  practice without a new `order.updated` subscription. (Subscribing to
  `order.updated` for pure non-fulfillment state changes is a documented future
  enhancement, NOT in this phase — it needs a Square webhook-subscription change.)

### 4.4 Checkout collects ship-to address (customer-facing)
- In `createPaymentLink`, add `askForShippingAddress: true` to `checkoutOptions`
  (keep `redirectUrl`). Square then prompts the buyer for a shipping address and
  attaches a SHIPMENT fulfillment with `recipient` → flows into `raw` at
  recording and on refresh → surfaces via 4.2.
- This is the only customer-facing change; it must be verified live (a sandbox
  checkout now prompts for an address and still completes → order records with a
  shipment).

## 5. Invariants (must hold)
- `SQUARE_ENV=sandbox`; goaffpro + logto canaries **0**. Deploy ONLY via `./scripts/deploy.sh`.
- Unreachable-DB build gate green (Compiled + 40+/40+ static + 0 ENOTFOUND).
- **No DB migration. No new webhook subscription. No new build-time env var.**
- Derived `status` semantics UNCHANGED (customer-facing `/account`,`/orders/lookup`
  + `hasPurchasedProduct` review-verification). We ADD Square state, never replace.
- `(admin)`/`(account)` stay `force-dynamic`. Customer order views
  (`/orders/lookup`, `/account/orders`) unchanged.
- `raw` persisted only through the BigInt-safe sanitizer.

## 6. Test strategy (TDD)
- **Shipment parser** (`shipment.ts`): SHIPMENT fulfillment → recipient/address/
  carrier/tracking; no SHIPMENT → null/empty; ignores non-SHIPMENT (DIGITAL).
- **Order state display**: detail + list render `raw.state`; absent → "—".
- **Raw refresh**: reconcile persists fresh sanitized `raw` on refund +
  fulfillment events (mock `orders.get`/`payments.get` + the new update query);
  assert bigint-free.
- **Checkout**: `createPaymentLink` request includes `askForShippingAddress: true`.
- Existing suite (564) stays green; canon gates from §5.

## 7. Live verification (dev sandbox, with operator)
| # | Flow | Pass |
|---|---|---|
| P18-1 | Checkout prompts for shipping address | sandbox checkout now asks for address + completes |
| P18-2 | Order records with shipment | new order's detail shows the Shipment section (recipient/address) |
| P18-3 | Square state mirrored | detail + list show Square's order state (OPEN/COMPLETED) next to our status |
| P18-4 | Freshness | advance fulfillment in Square → state/shipment refresh on the next webhook |

## 8. Deferred
- `order.updated` subscription for non-fulfillment state changes (webhook-config
  change). Carrier/tracking *entry* (that's Shippo→Square, not us). Partial
  refunds; bulk/export. Production cutover (LAST).
