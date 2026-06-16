# Phase 17 — Admin Order Tooling — Design Spec

**Date:** 2026-06-16
**Status:** approved for planning (operator decisions captured §3)
**Depends on:** Phase 16 (rendering/caching pass) — shipped, deployed, verified
on dev. Order/webhook chain (Phases 7–9) — shipped.

## 1. Goal

Give the operator a self-service admin surface for the order lifecycle so they
stop using the Square dashboard for day-to-day work. Five pieces, one phase:

1. **Order list** (`/admin/orders`) — paginated, searchable, filterable.
2. **Order detail** (`/admin/orders/[id]`) — full order view (line items,
   buyer, payment, status, fulfillment, refund state, raw link).
3. **Full-refund issuance** — admin issues a full refund against the order's
   Square payment; the existing `refund.*` webhook reconciles the DB + emails
   the buyer.
4. **Fulfillment status push** — admin advances the order's fulfillment state
   via Square's Orders API; the existing `order.fulfillment.updated` webhook
   reconciles the DB.
5. **Small read-only dashboard** (`/admin` or `/admin/orders` header) — order
   counts + revenue + refund + pending-fulfillment totals over rolling windows.

This phase is **additive**. No schema migration. No change to the public
catalog, checkout, or the customer-facing order surfaces.

## 2. Current state (repo truth — read before designing further)

The order/webhook chain already exists and is unit-tested; Phase 17 reuses it
rather than re-implementing reconciliation.

| Concern | Today | File |
|---|---|---|
| Order schema | `orders` (id, squareOrderId UNIQUE, squarePaymentId, userId, buyerEmail, squareCustomerId, status, totalCents, currency, lineItems jsonb, fulfillmentState, refundedCents, placedAt, raw, timestamps) + `orderLog` audit table | `src/lib/db/schema.ts:141` |
| Order status enum | `'completed' \| 'refunded' \| 'partially_refunded'` (DB CHECK `orders_status_valid`) | `src/lib/db/queries/orders.ts` |
| Fulfillment state | raw Square values `PROPOSED/RESERVED/PREPARED/COMPLETED/CANCELED/FAILED` → customer labels via `src/lib/orders/labels.ts` | `src/lib/orders/build-order.ts` |
| Read helpers | `getOrderById`, `getOrderBySquareOrderId`, `getOrdersForUser`, `getOrderBySquareOrderIdAndEmail` — **NO list-all / paginated query yet** | `src/lib/db/queries/orders.ts` |
| Reconcile helpers | `updateOrderStatus(squareOrderId, status, refundedCents)`, `setOrderFulfillmentState(squareOrderId, state)` | `src/lib/db/queries/orders.ts` |
| Webhook handler | handles `payment.created`, `refund.*`, `order.fulfillment.updated`; idempotent via `order_log.event_id`; HMAC-verified | `src/lib/webhooks/handle-event.ts`, `src/app/api/webhooks/square/route.ts` |
| Square client | v44 SDK, env-gated sandbox/prod singleton | `src/lib/square/client.ts` |
| Refund issuance | **DOES NOT EXIST** — refunds are 100% webhook-reactive today (refund happens in Square dashboard → webhook mirrors it) | — |
| Admin section | `(admin)/layout.tsx` gates via better-auth + `ADMIN_EMAILS`; slim "← Admin home" header (P16); inline-styled, no component lib; template feature = `/admin/artists` | `src/app/(admin)/` |

**Correction to the Phase 16 handoff:** it claimed "refund helpers orphaned in
Phase 15 are reusable." There are **no** refund-issuance helpers in the repo;
only `getSquareCustomer` (`src/lib/square/customers.ts`) is orphaned and it is
unrelated to refunds. Phase 17 builds refund issuance fresh.

## 3. Operator decisions (captured 2026-06-16)

- **Refunds: FULL ONLY.** No partial-amount UI. A refund refunds the entire
  remaining refundable amount (`totalCents − refundedCents`, which for a clean
  order is the full total). Behind a typed confirmation + required reason.
- **Fulfillment: PUSH TO SQUARE.** Admin advances fulfillment via Square's
  Orders API (Square stays the source of truth); the webhook reconciles our DB.
  NOT a local-only override.

Both money/state-moving actions follow the same shape: **call Square → let the
existing webhook reconcile.** No new reconciliation logic.

## 4. The two Square integrations (pinned to SDK v44)

### 4.1 Refund issuance — `client.refunds.refundPayment`

```ts
// src/lib/square/refunds.ts (NEW)
const res = await getSquareClient().refunds.refundPayment({
  idempotencyKey,                 // stable: `refund_${order.squareOrderId}` (full-only → one refund per order)
  paymentId: order.squarePaymentId,        // REQUIRED — guard: must be non-null
  amountMoney: { amount: BigInt(remainingCents), currency: order.currency },
  reason,                          // admin-supplied, trimmed, length-capped
})
```

- **Guard before calling:** `order.squarePaymentId` present; `order.status === 'completed'`
  AND `order.refundedCents === 0` (full-only ⇒ refund only a not-yet-refunded
  order); `remainingCents > 0`.
- **After the call:** do NOT hand-write `refundedCents`/status. Square fires
  `refund.created` → existing `handleRefund` re-fetches the authoritative Square
  order, recomputes `refundedCents` from `squareOrder.refunds[]`, sets status,
  and sends the refund email (Resend-gated). The admin action returns success
  and the detail page reflects the new state on next load (≤ webhook latency).
- **Optimistic feedback (should-have):** because dev webhook delivery can lag,
  the action MAY also call the existing reconcile path directly after a
  successful Square refund — re-fetch the Square order and call
  `updateOrderStatus(...)` — so the admin sees the refunded state immediately.
  This is idempotent with the webhook (same authoritative recompute). Keep it
  behind the same code path the webhook uses; do not duplicate the math.
- **Errors:** Square refund can fail (payment too old, sandbox balance, already
  refunded). Surface `error.message` to the admin form; never partially apply.

### 4.2 Fulfillment push — `client.orders.update`

```ts
// src/lib/square/fulfillment.ts (NEW)
const current = await getSquareClient().orders.get({ orderId: squareOrderId })
const o = current.order
const fulfillment = o.fulfillments?.[0]          // the order's fulfillment (if any)
await getSquareClient().orders.update({
  orderId: squareOrderId,
  idempotencyKey,                                 // stable per (order, targetState)
  order: {
    locationId: o.locationId,
    version: o.version,                           // optimistic-concurrency token
    fulfillments: [{ uid: fulfillment.uid, state: targetState }],
  },
})
```

- **Allowed transitions** (admin-facing, forward-only by default):
  `PROPOSED → RESERVED → PREPARED → COMPLETED`, plus `→ CANCELED` from any
  non-terminal state. Disallow backward moves and edits to terminal
  (`COMPLETED`/`CANCELED`/`FAILED`) states in the UI.
- **After the call:** Square fires `order.fulfillment.updated` → existing
  `setOrderFulfillmentState` reconciles. Same optimistic-update option as §4.1.
- **⚠️ Open risk (validate live, §10):** `client.orders.update` can only change
  the state of an **existing** fulfillment (needs its `uid`). It is unknown
  whether Square Checkout payment-link orders are created **with** a fulfillment.
  If they are not, advancing state requires first **adding** a `SHIPMENT`/`PICKUP`
  fulfillment (`fulfillments: [{ type, state, shipmentDetails|pickupDetails }]`).
  The execution session MUST confirm the fulfillment shape against a real
  sandbox order (the V2 purchase) before finalizing this path, and handle both
  "has fulfillment" and "no fulfillment" cases. If the no-fulfillment case is
  materially more complex than budgeted, fall back to **read-only fulfillment +
  a deep-link to the Square dashboard order** for this phase and record it as a
  deviation — refund issuance is the higher-value money action and must ship.

## 5. Data-layer additions (no migration)

In `src/lib/db/queries/orders.ts`:

- **`listOrders(opts: { limit, offset, status?, fulfillmentState?, q? }): Promise<Order[]>`**
  — ordered by `placedAt DESC NULLS LAST, createdAt DESC`. `q` matches
  `squareOrderId` OR `buyerEmail` (case-insensitive, prefix/substring). `status`
  / `fulfillmentState` are exact-match filters.
- **`countOrders(opts: { status?, fulfillmentState?, q? }): Promise<number>`**
  — for pagination.
- **`getOrderDashboardStats(): Promise<DashboardStats>`** — aggregate query(ies):
  count + sum(totalCents) for windows (today / 7d / 30d), sum(refundedCents),
  count where status='completed' AND fulfillmentState IN (null,'PROPOSED','RESERVED','PREPARED')
  (i.e. "needs fulfillment"). Keep to ≤2 SQL round-trips.
- **Build-phase tolerance:** these are admin-only reads under a `force-dynamic`
  layout, never prerendered → **no `NEXT_PHASE` build guard required** (unlike
  the catalog reads in P16). The unreachable-DB build gate must still pass
  because nothing imports these at module scope on a prerendered page — verify.

## 6. Routes & files (match the `/admin/artists` template)

```
src/app/(admin)/admin/orders/
├── page.tsx              # list: filters (status, fulfillment, q), pagination, table
├── [id]/
│   ├── page.tsx          # detail: order view + refund panel + fulfillment panel
│   └── actions.ts        # issueRefundAction(orderId, prev, form), advanceFulfillmentAction(orderId, prev, form)
└── _components/
    ├── OrdersTable.tsx        # list table (server-rendered ok; links to detail)
    ├── OrderDetail.tsx        # detail view (reuse formatCents/labels)
    ├── RefundPanel.tsx        # 'use client' — confirm + reason + submit (useFormState)
    └── FulfillmentPanel.tsx   # 'use client' — state select + submit (useFormState)
```

- Dashboard: add a compact stats strip to `src/app/(admin)/admin/page.tsx`
  (admin index) **or** the top of `/admin/orders`. Prefer the admin index so it
  is the first thing the operator sees. Read-only.
- Add an **"Orders"** entry to the `SECTIONS` array in
  `src/app/(admin)/admin/page.tsx`.
- Reuse `formatCents` and `src/lib/orders/labels.ts` (`statusLabel`,
  `fulfillmentLabel`). Do not fork formatting.

## 7. Authorization & safety (money moves here)

- The `(admin)` layout already gates access. **Additionally, the two mutating
  server actions MUST re-check admin** via `getCurrentUser()` (defense in depth
  — these move money / call external APIs and must never run on a layout-bypass).
  This is the documented exception to the "actions rely on the layout" norm.
- **Confirmation:** refund requires a typed confirmation (e.g. type `REFUND`)
  + a non-empty reason; fulfillment change requires an explicit submit (select +
  button), no free-text needed.
- **Idempotency / double-submit:** stable `idempotencyKey` per action; the
  refund guard re-reads the order inside the action and rejects if it is no
  longer `completed`/already refunded.
- **Audit trail (should-have):** record each admin-initiated action in
  `order_log` with a synthetic `eventType` (`admin.refund.issued`,
  `admin.fulfillment.advanced`), `payload` capturing `{ adminEmail, amountCents?,
  reason?, fromState?, toState?, squareRefundId? }`. Reuses the existing table;
  no schema change. Gives a who/when/what record for money movement.

## 8. Invariants (must hold)

- `SQUARE_ENV=sandbox`; goaffpro canary **0** (`grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0).
- Logto canary **0** (`grep -rni "logto" src/ tests/` → 0).
- Deploy ONLY via `./scripts/deploy.sh`.
- Unreachable-DB build gate green: `DATABASE_URL=…@unreachable-host… corepack pnpm exec next build`
  → Compiled successfully + Generating static pages (40/40) + 0 ENOTFOUND/ECONNREFUSED.
  (Page count may rise above 40 if new admin routes prerender as dynamic
  placeholders — assert 0 DB-reach errors and that new admin routes are listed
  as dynamic `ƒ`, not static.)
- `(account)`/`(admin)` stay `force-dynamic`; existing IDOR + admin-gate tests
  stay green. `getCurrentUser` interface untouched.
- **No new build-time-required env var.** No DB migration.
- **No partial refunds** (operator decision). **No local fulfillment override**
  (operator decision — push to Square).
- Customer-facing order surfaces (`/orders/lookup`, `/account/orders`) unchanged.

## 9. Test strategy (strict TDD per task)

- **Data layer:** `listOrders`/`countOrders` filter + pagination + search
  (against a test DB or query-builder assertions consistent with existing query
  tests); `getOrderDashboardStats` window math.
- **Refund action:** mock `client.refunds.refundPayment` + DB; assert (a) guards
  reject when `squarePaymentId` null / status≠completed / already refunded
  (no Square call), (b) happy path calls Square with correct
  `paymentId`/`amountMoney`/`idempotencyKey`, (c) Square error → form error, no
  state change, (d) admin re-check rejects non-admin, (e) audit-log write.
- **Fulfillment action:** mock `client.orders.get` + `client.orders.update`;
  assert allowed-transition validation, correct `version`/`uid` passthrough,
  error surfacing, admin re-check, audit-log write; cover both
  "has fulfillment" and "no fulfillment" branches.
- **Pages:** list renders table/filters/pagination + empty state; detail renders
  order + panels; panels disable on terminal states / missing paymentId.
- **Reconcile reuse:** an integration-style test that feeds a `refund.created`
  event through `handleSquareEvent` still updates status (proves the loop the
  admin action relies on is intact). Likely already exists — extend if so.
- Existing suite (539) stays green; canon gates from §8.

## 10. Live verification (dev, sandbox — folds into the deferred V1–V7)

Phase 17's tooling makes the deferred V2/V4 legs easier, so run them together
after deploy:

| # | Flow | How |
|---|---|---|
| P17-1 | Order appears in admin list | After a sandbox purchase (V2), the order shows in `/admin/orders` with correct total/status; detail page renders. |
| P17-2 | **Fulfillment shape** (the §4.2 risk) | Inspect the sandbox order's `raw`/fulfillments via detail page; confirm whether a fulfillment `uid` exists. This decides the §4.2 has/has-no-fulfillment branch. |
| P17-3 | Fulfillment push | Advance state in admin → Square reflects it → `order.fulfillment.updated` webhook → DB + customer label update. |
| P17-4 | Full refund | Issue refund in admin → Square shows refund → `refund.created` webhook → status `refunded`, `refundedCents=total`, buyer refund email (Resend-gated; record "partial: blocked on Resend" if unset). |
| P17-5 | Dashboard | Stats reflect the test order/refund. |
| P17-6 | Guards | Refund button hidden/disabled when already refunded or `squarePaymentId` null; backward fulfillment moves rejected. |

Resend-dependent legs are recorded "partial: blocked on Resend", not skipped.

## 11. Deferred (explicitly out of scope)

- Partial / multi refunds; refund of an already-partially-refunded order.
- Local-only fulfillment override; carrier/tracking capture; packing slips.
- Bulk actions; CSV export; date-range reporting beyond the small dashboard.
- Editing order line items / customer info; manual order creation.
- Embedded Square Web Payments checkout; tags. Production cutover (LAST).

## 12. Sequencing note (for the orchestrator)

The build (code + unit tests, mocked Square/DB) needs no live secrets and is
safe to launch now; it does not touch prod. Live verification (§10) requires a
sandbox purchase and benefits from Resend. Recommended order: **spec/plan
(this) → launch build session → verify gates + deploy to dev → run §10 together
with the still-pending V1–V7.** This merges Phase 17's live verification with
the deferred Phase 16 verification rather than blocking the build on it.
