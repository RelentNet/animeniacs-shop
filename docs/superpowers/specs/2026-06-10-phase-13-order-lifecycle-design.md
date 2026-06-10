# Phase 13 — Order Lifecycle Completeness — Design Spec

**Date:** 2026-06-10
**Status:** Designed. Awaiting plan execution.
**Predecessor:** Phase 12 (`phase-12-reviews-engagement`, HEAD `c111a16`).

---

## 1. Goal

Round out the orders system end-to-end:

1. **Refund reflection** — wire the `refund.created` / `refund.updated` webhook
   (already subscribed) to flip `orders.status` to `refunded` / `partially_refunded`
   and record the refunded amount.
2. **Order confirmation + refund emails** — send the buyer a receipt on
   `payment.created` and a refund notice on refund, reusing the Phase 10 Resend
   integration (env-gated, silent no-op when unconfigured).
3. **Fulfillment tracking** — wire `order.fulfillment.updated` (already subscribed)
   to capture and display a fulfillment state (Processing → Prepared → Shipped →
   Delivered) on order pages.
4. **Guest order lookup** — a public `/orders/lookup` page where a guest enters
   their email + order number to view a read-only order.

Customer pages use **Tailwind / storefront** conventions.

---

## 2. Locked decisions (brainstorm 2026-06-10)

1. **Track fulfillment state.** Add `orders.fulfillmentState` (nullable), populated
   from the Square order's fulfillment(s) at record time and on
   `order.fulfillment.updated`. Display a friendly label on order list + detail.
   *Caveat (operator):* only meaningful if the operator advances fulfillment in the
   Square dashboard; otherwise it sits at its initial state. Documented, not blocking.
2. **Guest lookup = email + order-number form.** Public `/orders/lookup`; match
   `buyerEmail` (case-insensitive) + `squareOrderId`; render a read-only order.
   The order number (shown on checkout-success) is the shared secret. *Rejected:*
   magic-link (more moving parts, hard-depends on Resend); skip (loses guest UX).

Out of scope (Phase 14+): SMS refund fanout; full Square fulfillment management UI
(shipping labels, tracking numbers); rate-limiting / lockout on guest lookup
(noted as a follow-up); multi-currency display; partial-refund line-item detail.

---

## 3. Webhook event routing (`src/lib/webhooks/handle-event.ts`)

Replace the `if (event.type !== 'payment.created') return` short-circuit with
routing **after** the idempotency guard + `appendOrderLog` (both unchanged). Each
branch is **best-effort** (wrapped in try/catch; never throws out of the webhook):

- **`payment.created`** (existing) → markCartCompleted, Discord + SMS fanout, record
  order via `buildOrder`/`upsertOrder`. **NEW:** after recording, if a buyer email is
  known, `sendOrderConfirmationEmail`.
- **`refund.created` / `refund.updated`** (NEW) → retrieve the authoritative Square
  order (`orders.get`), sum its `refunds[].amountMoney` → `refundedCents`; status =
  `refunded` when `refundedCents >= order.totalMoney`, else `partially_refunded`;
  `updateOrderStatus(squareOrderId, status, refundedCents)`. Best-effort:
  `sendRefundEmail` to the buyer + a Discord refund ping.
- **`order.fulfillment.updated`** (NEW) → retrieve the Square order, read the most
  advanced `fulfillments[].state`, `setOrderFulfillmentState(squareOrderId, state)`.

Idempotency: the existing `order_log.eventId` / `hasEventId` guard filters duplicate
deliveries. Distinct lifecycle events (each a new `event_id`) proceed correctly, so
fulfillment/refund progressions are processed in order.

---

## 4. Schema changes (Drizzle → `pnpm db:generate`)

Additive only (low risk):
- **`orders.fulfillmentState`** `text` nullable — raw Square fulfillment state
  (`PROPOSED|RESERVED|PREPARED|COMPLETED|CANCELED|FAILED`); null when none.
- **`orders.refundedCents`** `integer notNull default 0` — cumulative refunded amount
  (for "Refunded $X of $Y" display).

`status` enum is unchanged (`completed | refunded | partially_refunded` already exist).

---

## 5. New / changed files

**Libs**
- `src/lib/orders/build-order.ts` — capture `fulfillmentState` from
  `squareOrder.fulfillments` (most-advanced state); `refundedCents` defaults 0 at
  creation.
- `src/lib/db/queries/orders.ts` — add `getOrderBySquareOrderId(id)`,
  `getOrderBySquareOrderIdAndEmail(id, email)` (case-insensitive email),
  `updateOrderStatus(squareOrderId, status, refundedCents)`,
  `setOrderFulfillmentState(squareOrderId, state)`.
- `src/lib/notifications/email.ts` — add `sendOrderConfirmationEmail({ to, orderId,
  items, totalCents, shopUrl })` and `sendRefundEmail({ to, orderId, refundedCents,
  totalCents, shopUrl })`, mirroring `sendAbandonedCartEmail`'s env-gate + no-op.
- `src/lib/orders/labels.ts` — `statusLabel(status)` and `fulfillmentLabel(state)` →
  friendly customer-facing strings (e.g. `PREPARED` → "Being prepared", `COMPLETED`
  fulfillment → "Shipped/Delivered"). Single source of truth for both account + guest views.
- `src/lib/webhooks/handle-event.ts` — event routing + refund/fulfillment handlers +
  confirmation-email wiring; extract `handlePaymentCreated` / `handleRefund` /
  `handleFulfillmentUpdated` helpers for testability.

**Shared component (DRY refactor)**
- `src/components/orders/OrderDetailView.tsx` — presentational read-only order view
  (placed date, status + fulfillment labels, total, "Refunded $X" when applicable,
  line items). Extracted from the inline markup in the account order-detail page and
  **reused by both** the account detail page and the guest lookup result.

**Account UI (Tailwind)**
- `src/app/(account)/account/orders/[id]/page.tsx` — keep the IDOR guard; render via
  `OrderDetailView`.
- `src/app/(account)/account/orders/page.tsx` — show fulfillment label alongside status.

**Guest lookup (public — NOT under `(account)`)**
- `src/app/orders/lookup/page.tsx` — form (email + order number) + result; uses
  `OrderDetailView` for the matched order.
- `src/app/orders/lookup/actions.ts` — `lookupOrderAction`: normalize email →
  `getOrderBySquareOrderIdAndEmail` → return the order or a **generic** "no matching
  order" error (never reveal which field was wrong).
- `src/app/checkout/success/page.tsx` — display the order number prominently and a
  hint linking to `/orders/lookup` so guests can find it later.

---

## 6. Security / correctness invariants

- **Guest lookup requires BOTH** a matching `buyerEmail` (case-insensitive) AND the
  exact `squareOrderId`. Errors are **generic** ("We couldn't find an order matching
  that email and order number") — never disclose which part matched. Rate-limiting is
  a documented Phase 14 follow-up.
- **Refund status, refundedCents, and fulfillmentState are server-computed** from the
  authoritative Square order — never from webhook payload fields alone (the payload is
  used only to identify the order; amounts/states come from `orders.get`).
- **The account IDOR guard is unchanged** — `/account/orders/[id]` still 404s unless
  `order.userId === currentUser.userId`. The guest lookup is a separate, email-gated
  read path and never exposes another user's order without the order number.
- **All webhook side effects remain best-effort** — every branch wrapped in try/catch;
  an email/Discord/recording failure logs and continues, never throws out of the webhook.
- **Emails are env-gated** (`RESEND_API_KEY` + `RESEND_FROM_EMAIL`) and no-op silently
  when unconfigured — safe in environments without Resend.
- `SQUARE_ENV=sandbox`; goaffpro canary **0**; deploy via `./scripts/deploy.sh` only;
  **no new env vars** (Resend vars already exist from Phase 10). Pages dynamic (root
  layout already `force-dynamic`).

---

## 7. Operator-pending (post-deploy)

- **Resend must be configured** (`RESEND_API_KEY` + `RESEND_FROM_EMAIL`, a verified
  sender) for receipt/refund emails to actually send — same pending item as Phase 10's
  abandoned-cart emails. Until then they no-op.
- **Fulfillment state only advances if the operator updates fulfillment in Square** —
  confirm the workflow or the state stays at its initial value.
- **Sandbox verify:** complete a sandbox order → receipt email + an `orders` row with a
  fulfillment state; issue a sandbox refund → status flips to refunded/partially and a
  refund email sends; advance fulfillment in Square → the order page reflects it; place
  a guest (logged-out) order → look it up at `/orders/lookup` with the email + order number.

---

## 8. Test strategy (TDD)

Unit (mock `db`, Square client, Resend, env):
- `build-order` — `fulfillmentState` captured from `fulfillments`; null when absent.
- `orders` queries — `getOrderBySquareOrderId`, `getOrderBySquareOrderIdAndEmail`
  (case-insensitive; no match → undefined), `updateOrderStatus` (sets status +
  refundedCents), `setOrderFulfillmentState`.
- `email` — `sendOrderConfirmationEmail` / `sendRefundEmail` call Resend with the right
  to/subject/body; both no-op when env unset (mirror the abandoned-cart tests).
- `labels` — status + fulfillment mappings incl. unknown → sensible fallback.
- `handle-event` — `refund.created` → status flip (full vs partial via summed refunds)
  + refund email; `order.fulfillment.updated` → fulfillment state set; `payment.created`
  → confirmation email sent when email present, skipped when absent; duplicate event_id
  short-circuits; a failing email does NOT throw.
- `lookupOrderAction` — match returns the order; wrong email OR wrong number →
  generic error; email normalized/case-insensitive.
- `OrderDetailView` — renders status + fulfillment labels + refunded line; guest +
  account both render.
- account order detail — IDOR guard still 404s for non-owner (regression).

Gates (match Phase 12): `pnpm lint` clean · `pnpm typecheck` clean · `pnpm test`
(expect ~+30 unit) · `pnpm test:integration` (≥75; run live or note unrun) ·
`grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0 ·
`DATABASE_URL=postgresql://x:x@unreachable-host/db pnpm build` → compiles + 0 `ENOTFOUND`.
