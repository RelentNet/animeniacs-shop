# Phase 17 → Phase 18 hand-off

**Status:** Phase 17 shipped to dev as a **read-only admin order log + dashboard**.
Refunds and fulfillment/shipping are handled in **Square + Shippo**; their state
flows back into the log via the existing Square webhooks. **Plus a critical
order-recording bug fix** (BigInt) surfaced by live verification — it had been
silently killing ALL order recording, not just Phase 17. Code on `main`
@ `c40b83e`, deployed to dev. **Tag `phase-17-admin-order-tooling` HELD** until
the (now lighter, read-only) live verification passes.

**Date:** 2026-06-16

> Master planned + launched the build, verified it, deployed, then ran live
> verification on dev sandbox WITH the operator — which surfaced both the BigInt
> bug and an architecture course-correction (below). `SQUARE_ENV` stays
> `sandbox`; goaffpro + logto canaries stay **0**. No DB migration.

---

## 1. TL;DR + what changed mid-flight

Phase 17 was originally built with on-site **full-refund issuance** + **fulfillment
push-to-Square**. Live verification on dev changed two things:

1. **Found + fixed a latent order-recording bug.** Square SDK v44 returns Money
   as `bigint`; `buildOrder` stored the live Square order in the jsonb `raw`
   column, and serialization threw *"Do not know how to serialize a BigInt"* —
   so `payment.created` webhooks never recorded orders. `/admin/orders` (and the
   whole order read-model) was always empty. Fixed by sanitizing bigints in
   `raw`. The old unit test asserted `raw === squareOrder` (reference equality)
   so it never serialized and never caught this; corrected + added a
   serialization regression test. **This was the real blocker on the entire
   order/webhook chain.**

2. **Operator re-scoped to read-only.** Decision: centralize operations in
   **Square + Shippo** (processing, shipments, labels), with the site as a
   **read-only order log**. Removed on-site refund issuance + fulfillment push
   (dual money/state surfaces). Refund/fulfillment state still reflects on the
   site via the existing `refund.*` / `order.fulfillment.updated` webhooks →
   shared reconcile.

**Net Phase 17 deliverable:** `/admin/orders` (list: paginated, search, status/
fulfillment filters) + `/admin/orders/[id]` (read-only detail) + dashboard strip
on `/admin` + the "Orders" nav entry. No on-site money movement.

## 2. Final state of the code

**Kept / shipped:**
- `src/lib/db/queries/orders.ts` — `listOrders`, `countOrders` (filters + `q`
  search, parameterized/injection-safe, limit capped 100), `getOrderDashboardStats`.
- `src/app/(admin)/admin/orders/{page.tsx, [id]/page.tsx, _components/OrdersTable.tsx, _components/OrderDetail.tsx}` — list + read-only detail.
- Dashboard strip + "Orders" entry in `src/app/(admin)/admin/page.tsx`.
- `src/lib/webhooks/reconcile.ts` (`reconcileRefundFromSquare`,
  `reconcileFulfillmentFromSquare`) — extracted from `handle-event.ts`; now the
  ONLY refund/fulfillment reconcile path (webhook-driven). Single source of math.
- **`src/lib/orders/build-order.ts` BigInt fix** (`toJsonSafe` on `raw`) — essential.

**Removed in the read-only re-scope:** `src/lib/square/refunds.ts`,
`src/lib/square/fulfillment.ts`, `src/lib/orders/fulfillment-states.ts`,
`src/app/(admin)/admin/orders/[id]/actions.ts`, `RefundPanel`, `FulfillmentPanel`
(+ their tests).

## 3. Commit trail (on `main`)

`ae11af3`→`5a6715e` Phase 17 build (list/detail/refund/fulfillment/dashboard) ·
`7635e66` interim handoff · `d8b4844` **BigInt order-recording fix** ·
`636dc1a` read-only re-scope (removals) · `c40b83e` fix: stage the read-only
page/test that `636dc1a` left unstaged (transient broken intermediate — see §6) ·
`a5c33dc` docs · `7957794` **refund reconcile-by-payment-id fix** (see §6).

## 4. Verification state

- **Gates (re-run by Master after every change):** typecheck clean ·
  **563 unit tests pass** (95 files; down from 593 — 30 tests removed with the
  refund/fulfillment features) · unreachable-DB build = Compiled + 41/41 static +
  0 ENOTFOUND, exit 0; `/admin/orders` + `/admin/orders/[id]` dynamic (`ƒ`).
  Canaries logto 0, goaffpro 0.
- **Live (dev sandbox, with operator):**
  - Order recording: a sandbox purchase (`jWeyBdtqis0VLLc75KWCl2dJKdLZY`, $75,
    payment COMPLETED) confirmed at Square; pre-fix it failed with the BigInt
    error, post-fix recording works. **Operator to confirm it now lists in
    `/admin/orders`** (DB side).
  - Fulfillment shape: real paid orders DO carry a fulfillment `uid`
    (`DIGITAL:PROPOSED`) — confirmed via Square API.
- **⚠️ PENDING (lighter, read-only) — lifts the tag:** see §5.

## 5. Operator-pending — read-only live verification (lifts the tag)

1. **Order log:** confirm the `jWey…` order (and a fresh one) appears in
   `/admin/orders` with correct total/status; detail renders. (P17-1)
2. **Refund reflection:** issue a refund **in the Square dashboard** for a test
   order → confirm the site shows status `refunded` + refunded amount (the
   `refund.*` webhook → reconcile). This is the existing chain, now unblocked by
   the BigInt fix — never verified live before.
3. **Fulfillment reflection:** advance fulfillment **in Square** → confirm the
   site's label updates (`order.fulfillment.updated` webhook).
4. **Dashboard** reflects orders/refunds.

Then lift `phase-17-admin-order-tooling` @ `c40b83e`.

**Other operator-pending (unchanged):** Resend (`RESEND_API_KEY` +
`RESEND_FROM_EMAIL` still EMPTY → receipt/refund emails) · cron scheduled task
(secret matches; UI step only) · retire standalone Logto · duplicate empty
`${VAR:-}` Coolify placeholders (tidy before prod).

## 6. Notes / deviations

- **Refund reconcile keyed by payment, not order (`7957794`):** live verification
  showed Square books a refund onto a SEPARATE $0 "refund order"
  (`refund.order_id` ≠ the sale order; the sale order's `refunds[]` stays empty;
  the synthetic order has `total=0`). The old `handleRefund` matched on
  `refund.order_id` → `updateOrderStatus` hit 0 rows → refunds never reflected.
  Fixed: `reconcileRefundFromSquare(paymentId)` resolves the sale order via
  `payment.orderId` and uses the payment's cumulative `refundedMoney`. Proven in
  sandbox (payment `RYu36c…`/order `jWey…` vs refund order `L2mvf…`). **Live
  end-to-end still PENDING** — `jWey…`'s refund event was processed by the old
  code (event_id now "seen", won't replay) and `jWey…` is fully refunded; needs a
  FRESH purchase + API refund to confirm reflection on dev (sandbox dashboard
  can't issue refunds — known Square limitation, production dashboard is fine).
- **BigInt webhook idempotency caveat:** `handleSquareEvent` logs the event_id to
  `order_log` (marking it "seen") BEFORE the handler runs, and a handler failure
  doesn't un-mark it. So the orders that failed pre-fix won't auto-recover on a
  webhook retry — use a fresh purchase. Worth hardening in Phase 18 (mark seen
  only after successful processing, or make recording retry-safe).
- **Staging slip (`636dc1a`→`c40b83e`):** `636dc1a` committed the panel deletions
  but the page-simplification edit was unstaged, so that one commit didn't build;
  `c40b83e` corrected it (HEAD verified: typecheck + build green). Left as two
  commits rather than a force-push (deploy.sh non-force-pushes).

## 7. Phase 18 — order-log fidelity + shipping (operator-requested 2026-06-17)

Operator wants the read-only log to mirror Square more fully:
1. **Mirror Square order state** (`DRAFT/OPEN/COMPLETED/CANCELED`) in the admin
   log, ALONGSIDE (not replacing) our derived `status` (which stays customer-
   facing + powers review-verification). Today the admin shows "Completed" while
   Square says "OPEN" — confusing. `raw.state` is already captured at recording
   but goes STALE (refund/fulfillment webhooks don't refresh `raw`); a faithful
   mirror needs the state refreshed on the relevant webhooks (or an `order.updated`
   subscription) + a column/extraction + display.
2. **Reflect shipment details** — recipient (name/address/phone), carrier,
   tracking number + URL from Square fulfillment `shipmentDetails`. **Production
   orders already carry shipping details** (matters for cutover); sandbox orders
   are DIGITAL with none, so testing needs the checkout-address piece below or a
   manually-created SHIPMENT fulfillment. Capture on recording + fulfillment
   webhooks; display in the order detail (tracking as a link).
   - **Prerequisite for NEW orders:** the Square payment-link checkout doesn't
     collect a ship-to name/address, so Square/Shippo have nothing to ship to.
     Enable shipping-address collection on the payment link
     (`checkoutOptions.askForShippingAddress`).
- Also queued: harden webhook idempotency (mark event seen only after successful
  processing — §6); receipt/refund email verification once Resend is set;
  order-log filters/export if it grows.
- **LAST:** production cutover — live WooCommerce replacement; operator-gated.
