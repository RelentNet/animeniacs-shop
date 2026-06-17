# Phase 18 — Order-Log Fidelity + Checkout Shipping Address — Plan

**Spec:** `docs/superpowers/specs/2026-06-17-phase-18-order-log-fidelity-design.md`
**Method:** strict TDD per task; commit per task on `main`. `corepack pnpm`.
**Hard constraints:** spec §5. No migration, no new webhook subscription, no new
build-time env var. Deploy ONLY via `./scripts/deploy.sh`. Scope `biome check` to
touched files (repo-wide lint is red on pre-existing CRLF).

## Baseline
`git rev-parse HEAD` → `456396c` or later · `corepack pnpm install && content:build`
· typecheck clean · `corepack pnpm test` → 564 pass · unreachable-DB build green.

## Task 1: BigInt-safe sanitizer is shared + raw-refresh query
- Export the BigInt-safe `toJsonSafe` from `src/lib/orders/build-order.ts` (or
  move to `src/lib/orders/json-safe.ts` and re-export). Add
  `updateOrderRaw(squareOrderId, raw)` to `src/lib/db/queries/orders.ts` (writes
  `raw` + `updatedAt`). Tests: sanitizer drops bigints; query sets raw.

## Task 2: Refresh raw on refund + fulfillment webhooks
- In `src/lib/webhooks/reconcile.ts`, after fetching the authoritative Square
  order in BOTH `reconcileRefundFromSquare` and `reconcileFulfillmentFromSquare`,
  persist `updateOrderRaw(saleOrderId, toJsonSafe(order))`. (Refund path already
  resolves the sale order via the payment — refresh THAT order's raw, not the
  synthetic refund order.) Extend `tests/webhooks/handle-event.test.ts`: assert
  raw is refreshed (bigint-free) on both event types.

## Task 3: Shipment parser (pure)
- `src/lib/orders/shipment.ts`: `parseShipment(raw): { recipientName, address (formatted lines), carrier, shippingType, trackingNumber, trackingUrl, shippedAt } | null` —
  from the first `raw.fulfillments[]` with `type==='SHIPMENT'` + `shipmentDetails`.
  Returns null when none (DIGITAL). Tests: SHIPMENT present; absent; non-SHIPMENT
  ignored; partial fields.

## Task 4: Detail view — Square state + Shipment section
- `OrderDetail.tsx`: add a "Square state" row (`raw.state`, literal; "—" if
  absent) near our Status row, and a "Shipment" section from `parseShipment`
  (recipient name, address, carrier, trackingNumber as a link to trackingUrl,
  shippedAt) with an empty state. Read-only. Extend
  `tests/admin/order-detail-page.test.tsx`.

## Task 5: List view — Square state column
- `OrdersTable.tsx` + `/admin/orders/page.tsx`: add a "Square" column from
  `raw.state` (data already loaded by `listOrders`). Extend
  `tests/admin/orders-page.test.tsx`.

## Task 6: Checkout asks for shipping address (customer-facing)
- `src/lib/checkout/create-payment-link.ts`: add `askForShippingAddress: true`
  to `checkoutOptions` (keep `redirectUrl`). Add/extend a test asserting the
  Square request includes it. Confirm no other checkout code assumes its absence.

## Task 7: Gates (no deploy — orchestrator deploys)
```
corepack pnpm typecheck
corepack pnpm test                       # 564 + new, all green
grep -rni "logto" src/ tests/            # 0
grep -rn "goaffpro\|GoAffPro" src/ tests/# 0
corepack pnpm content:build && DATABASE_URL=postgresql://x:x@unreachable-host:5432/db corepack pnpm exec next build
#  → Compiled + Generating static pages (N/N) + 0 ENOTFOUND; exit 0
```
STOP before deploy. Return: commits (hash+subject), gate results, deviations,
anything to double-check (esp. that `raw` refresh stays bigint-safe and the
checkout change doesn't break the existing checkout happy-path test).

## Constraints
- No migration / no new webhook subscription / no new build-time env var.
- Derived `status` untouched; ADD Square state only. Customer order views unchanged.
- `raw` only ever persisted through the BigInt-safe sanitizer.
- Commit per task, conventional style + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
