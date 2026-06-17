# Phase 18 → Phase 19 hand-off

**Status:** Phase 18 SHIPPED + deployed + **VERIFIED live on dev** + **TAGGED
`phase-18-order-log-fidelity`**. Read-only order-log fidelity: mirror Square
order **state** + reflect **shipment details**, plus the customer-facing checkout
now collects a **ship-to address**. Code on `main` @ `41e4923` (tag at the docs
commit). Migration-free, no new webhook subscription, no new build-time env var.

**Date:** 2026-06-17

> Master planned (spec+plan), launched a background build session, verified diff
> + gates, deployed via `./scripts/deploy.sh`, and verified live with the
> operator. `SQUARE_ENV=sandbox`; goaffpro + logto canaries **0**.

## 1. TL;DR — what shipped
1. **Square order state mirror** — the admin order **list** + **detail** show
   Square's literal `order.state` (`OPEN/COMPLETED/…`, read from `raw.state`)
   ALONGSIDE our derived `status` (unchanged — still customer-facing + powers
   review-verification). Fixes the "we say Completed, Square says OPEN" mismatch.
2. **Shipment section** in the order detail — recipient name + address, carrier,
   tracking number (as a link), shippedAt — parsed read-only from the first
   `SHIPMENT` fulfillment in `raw`. Empty state for DIGITAL orders.
3. **Snapshot freshness** — `raw` is now refreshed on `refund.*` and
   `order.fulfillment.updated` (via the shared `updateOrderRaw`, BigInt-safe) so
   state + shipment stay current. (`order.updated` for pure state changes is
   deferred — needs a webhook-subscription change.)
4. **Checkout collects ship-to address** — `createPaymentLink` sets
   `checkoutOptions.askForShippingAddress: true`. Square then collects the
   address and creates a SHIPMENT fulfillment on the order.

## 2. Commits (on `main`)
`ee06396` spec+plan · `dc828ed` share BigInt-safe `toJsonSafe` (now
`src/lib/orders/json-safe.ts`) + `updateOrderRaw` query · `d34cc51` refresh raw
on refund+fulfillment reconcile · `dcf30af` pure shipment parser
(`src/lib/orders/shipment.ts`) · `0359e4a` detail: Square state + Shipment
section · `9047dd6` list: Square state column · `41e4923` checkout asks for
shipping address.

## 3. Verification
- **Gates (Master re-ran):** typecheck clean · **583 unit tests** (97 files; +19)
  · unreachable-DB build = Compiled + 41/41 static + 0 ENOTFOUND, exit 0 ·
  canaries logto 0, goaffpro 0.
- **Live (dev sandbox, 2026-06-17):**
  - **Square state mirror (P18-3):** ✅ orders list/detail show Square state.
  - **Shipment display (P18-2):** ✅ verified end-to-end. Square sandbox can't
    collect an address through its simulator (see §4), so Master injected a
    SHIPMENT fulfillment with recipient/carrier/tracking onto a sandbox order via
    the API and paid it; the `payment.created`/fulfillment webhook → raw refresh
    → the detail's Shipment section rendered (Test Recipient · Springfield, IL ·
    USPS · tracking link). Order `VvuoI7sy…`.
  - **Snapshot freshness (P18-4):** ✅ implicitly proven — the injected shipment
    surfaced via the webhook→raw-refresh path.

## 4. ⚠️ Sandbox limitation (not a bug) — checkout address prompt
`askForShippingAddress: true` is correctly set — confirmed by unit test AND by
creating a real sandbox payment link whose response echoed
`checkoutOptions: {"askForShippingAddress":true}`. BUT Square's **sandbox
"Checkout API Testing Panel" (the Overview→Test Payment simulator) does NOT
render the address step** — same class of limitation as "sandbox dashboard can't
issue refunds." On the **production hosted checkout the address fields WILL
appear.** Confirmed Square DOES create SHIPMENT fulfillments on checkout orders
now (post-deploy DRAFT orders carry `SHIPMENT:PROPOSED`). **So P18-1 (the live
address prompt) is verifiable only in production** — re-confirm at cutover.

## 5. Notes
- Migration-free: state + shipment read from the existing `raw` jsonb;
  `listOrders` already returns `raw`. No schema change, no new subscription.
- `raw` is only ever persisted through the shared BigInt-safe `toJsonSafe`
  (the Phase 17 crash class stays fixed; webhook tests assert raw is bigint-free).
- Derived `status` + customer order views (`/orders/lookup`, `/account/orders`)
  untouched. Only admin detail/list gained the Square-state + Shipment surfaces.
- Square rejects >1 fulfillment per order (`ARRAY_LENGTH_TOO_LONG`) — relevant if
  anyone later tries to add fulfillments to already-fulfilled orders.

## 6. Phase 19+ candidates
- **`order.updated` subscription** so pure order-state changes (not tied to a
  fulfillment/refund event) refresh promptly — needs a Square webhook-config
  change (add the event type to the subscription) + a handler branch.
- Harden webhook idempotency (mark event "seen" only AFTER successful processing —
  Phase 17 §6 carry-over). Receipt/refund email verification once **Resend** is set.
- Still operator-pending config: Resend keys, wire abandoned-cart cron task,
  retire standalone Logto.
- **LAST:** production cutover — live WooCommerce replacement; operator-gated.
  (At cutover, confirm P18-1 address prompt + real production shipment details.)
