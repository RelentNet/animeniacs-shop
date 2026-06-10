# Phase 13 — Order Lifecycle Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task, TDD. Steps use checkbox (`- [ ]`). Write the failing test first, confirm it fails, implement, confirm it passes, commit per task.

**Design spec:** `docs/superpowers/specs/2026-06-10-phase-13-order-lifecycle-design.md` (read first — §3 webhook routing, §6 invariants are load-bearing).

**Goal:** Refund status reflection + order confirmation/refund emails + fulfillment-state tracking + a public guest order-lookup page.

**Stack:** Next.js 14 App Router, Drizzle/Postgres, Square, Resend, Logto. Customer pages = Tailwind.

---

## Baseline verification

- [ ] `git status` clean on `main`, HEAD `c111a16` or later.
- [ ] `pnpm test` → 398 unit pass; `pnpm typecheck` clean.
- [ ] `grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0.

---

## Task 1: Schema — `orders.fulfillmentState` + `orders.refundedCents`

**Files:** `src/lib/db/schema.ts`, generated migration.

- [ ] **Step 1:** Add to the `orders` table: `fulfillmentState: text('fulfillment_state')` (nullable) and `refundedCents: integer('refunded_cents').notNull().default(0)`. Update the `onConflictDoUpdate` set in `upsertOrder` later (Task 3) to include `fulfillmentState`.
- [ ] **Step 2:** `pnpm db:generate`; review the `.sql` (two `ADD COLUMN`). Apply via `pnpm db:push` if Postgres available; else note + rely on CI.
- [ ] **Step 3:** `pnpm typecheck`. Commit: `feat(db): add orders.fulfillment_state and orders.refunded_cents`.

---

## Task 2: `build-order` — capture fulfillment state

**Files:** `src/lib/orders/build-order.ts`, `tests/orders/build-order.test.ts` (extend).

- [ ] **Step 1 (test first):** assert `buildOrder` sets `fulfillmentState` from `squareOrder.fulfillments` (use the most advanced / first fulfillment's `state`); null when `fulfillments` is absent/empty; `refundedCents` is 0 (default — may be omitted from the returned object, set by the DB default).
- [ ] **Step 2:** Implement: read `squareOrder?.fulfillments?.[0]?.state` (or pick the most advanced by a small ordering helper if multiple) → `fulfillmentState` on the returned `NewOrder`. Leave `refundedCents` to the DB default (don't set it at creation).
- [ ] **Step 3:** Tests pass; typecheck. Commit: `feat(orders): capture fulfillment state in build-order`.

---

## Task 3: `orders` queries — lookup + status/fulfillment updates

**Files:** `src/lib/db/queries/orders.ts`, `tests/db/orders.test.ts` (extend).

- [ ] **Step 1 (test first):** mock `db`. Cover:
  - `getOrderBySquareOrderId('sq1')` → row or undefined.
  - `getOrderBySquareOrderIdAndEmail('sq1','A@B.com')` → matches case-insensitively (normalize both sides to lowercase); no match → undefined.
  - `updateOrderStatus('sq1','refunded',500)` → sets `status` + `refundedCents` + `updatedAt`, keyed on `squareOrderId`.
  - `setOrderFulfillmentState('sq1','PREPARED')` → sets `fulfillmentState` + `updatedAt`.
- [ ] **Step 2:** Implement the four functions. For the email match use `sql\`lower(${orders.buyerEmail}) = ${email.toLowerCase()}\`` plus `eq(orders.squareOrderId, id)`. Also add `fulfillmentState` to the existing `upsertOrder` `onConflictDoUpdate` set. `import 'server-only'`.
- [ ] **Step 3:** Tests pass; typecheck. Commit: `feat(orders): square-order lookups + status/fulfillment update queries`.

---

## Task 4: Order confirmation + refund emails

**Files:** `src/lib/notifications/email.ts`, `tests/notifications/email.test.ts` (extend).

- [ ] **Step 1 (test first):** mirror the existing `sendAbandonedCartEmail` tests. `sendOrderConfirmationEmail({ to, orderId, items: [{name,quantity,totalCents}], totalCents, shopUrl })` → calls `resend.emails.send` with a receipt subject + body containing item lines + total + an order/account link; no-ops when `RESEND_API_KEY`/`RESEND_FROM_EMAIL` unset. Same for `sendRefundEmail({ to, orderId, refundedCents, totalCents, shopUrl })`.
- [ ] **Step 2:** Implement both, reusing the env-gate + `new Resend(apiKey)` + plain-text body pattern. Receipt links to `${shopUrl}/account/orders` (logged-in) — guests can use `/orders/lookup`; mention both.
- [ ] **Step 3:** Tests pass; typecheck. Commit: `feat(email): order confirmation + refund emails via Resend`.

---

## Task 5: Status + fulfillment label helpers

**Files:** create `src/lib/orders/labels.ts`, `tests/orders/labels.test.ts`.

- [ ] **Step 1 (test first):** `statusLabel('completed'|'refunded'|'partially_refunded')` → friendly strings; `fulfillmentLabel('PROPOSED'|'RESERVED'|'PREPARED'|'COMPLETED'|'CANCELED'|'FAILED'|null|unknown)` → friendly customer strings (e.g. PREPARED → "Being prepared"; COMPLETED → "Shipped"; null → "Processing"; unknown → a safe fallback).
- [ ] **Step 2:** Implement as pure functions (maps + fallback). `import 'server-only'` not needed (pure, usable in client too).
- [ ] **Step 3:** Tests pass; typecheck. Commit: `feat(orders): customer-facing status + fulfillment label helpers`.

---

## Task 6: Webhook — refund + fulfillment handling + confirmation email

**Files:** `src/lib/webhooks/handle-event.ts`, `tests/webhooks/handle-event.test.ts` (extend).

- [ ] **Step 1 (test first):** extend the webhook test:
  - `refund.created`: mock `orders.get` to return an order whose `refunds` sum **< total** → `updateOrderStatus(…, 'partially_refunded', sum)` + `sendRefundEmail`; sum **>= total** → `'refunded'`. Buyer email absent → no email, status still updates.
  - `order.fulfillment.updated`: mock `orders.get` with a fulfillment state → `setOrderFulfillmentState` called with it.
  - `payment.created`: with a buyer email → `sendOrderConfirmationEmail` called after `upsertOrder`; without → not called. Existing payment-path assertions stay green.
  - Duplicate `event_id` → short-circuits (no handler runs).
  - A throwing email does NOT throw out of `handleSquareEvent`.
- [ ] **Step 2:** Refactor `handleSquareEvent`: keep idempotency + `appendOrderLog`; replace the `!== 'payment.created'` return with routing by `event.type` (prefix match) into extracted helpers `handlePaymentCreated`, `handleRefund`, `handleFulfillmentUpdated`. Each helper wraps its side effects in try/catch (log + continue). In `handlePaymentCreated`, after `upsertOrder`, call `sendOrderConfirmationEmail` when a buyer email is known (reuse the built order's `lineItems`). In `handleRefund`, retrieve the Square order, sum `refunds[].amountMoney.amount` (bigint→Number), compute status vs `totalMoney`, `updateOrderStatus`, then best-effort `sendRefundEmail` + Discord refund ping. In `handleFulfillmentUpdated`, retrieve the Square order, read the most-advanced `fulfillments[].state`, `setOrderFulfillmentState`.
- [ ] **Step 3:** Tests pass; typecheck. Commit: `feat(webhook): handle refunds + fulfillment updates + send order confirmation email`.

---

## Task 7: Extract `OrderDetailView` + show fulfillment on account pages

**Files:** create `src/components/orders/OrderDetailView.tsx`, modify `src/app/(account)/account/orders/[id]/page.tsx` and `…/orders/page.tsx`, `tests/orders/order-detail-view.test.tsx`, keep `tests/account/order-detail.test.tsx` (IDOR) green.

- [ ] **Step 1 (test first):** `OrderDetailView` renders placed date, `statusLabel(status)`, `fulfillmentLabel(fulfillmentState)`, total, a "Refunded {amount}" line when `refundedCents > 0`, and the line items. Pure presentational (takes an `order`-shaped prop).
- [ ] **Step 2:** Implement `OrderDetailView` by extracting the existing inline markup from the account detail page; add the fulfillment label + refunded line.
- [ ] **Step 3:** Refactor `account/orders/[id]/page.tsx` to fetch + run the **unchanged** IDOR guard, then render `<OrderDetailView order={order} />`. Update `account/orders/page.tsx` list rows to also show `fulfillmentLabel`.
- [ ] **Step 4:** Run the IDOR regression test + new tests → green; typecheck. Commit: `refactor(account): shared OrderDetailView + fulfillment display`.

---

## Task 8: Guest order lookup — `/orders/lookup`

**Files:** create `src/app/orders/lookup/page.tsx`, `src/app/orders/lookup/actions.ts`, modify `src/app/checkout/success/page.tsx`, `tests/orders/lookup-action.test.ts`, `tests/orders/lookup-page.test.tsx`.

- [ ] **Step 1 (action test first):** `lookupOrderAction(prev, formData)` — mock `getOrderBySquareOrderIdAndEmail`. Match → `{ ok: true, order }`; wrong email OR wrong number → `{ error: '<generic>' }` (same message both cases — assert it does not differ); email normalized (trim + lowercase) before lookup.
- [ ] **Step 2:** Implement `actions.ts` (`'use server'`). Implement `page.tsx` (public, NOT under `(account)`; `'use client'` form via `useFormState`, Tailwind): email + order-number inputs; on `{ ok }` render `<OrderDetailView order={order} />` read-only; on error show the generic message. `export const dynamic = 'force-dynamic'` if it reads anything at request time (the action does the DB read).
- [ ] **Step 3:** Update `checkout/success/page.tsx`: display the order number prominently (it already reads `orderId`) and add a line/link: "Look up your order anytime at /orders/lookup using your email and this order number."
- [ ] **Step 4 (page test):** renders the form; shows the generic error on `{ error }`; renders `OrderDetailView` on `{ ok }`.
- [ ] **Step 5:** Tests pass; typecheck. Commit: `feat(orders): public guest order lookup by email + order number`.

---

## Task 9: Final verification + handoff + tag + deploy

- [ ] **Step 1:** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration`. Expect lint/typecheck clean; unit ≈ 398 + ~30 new; integration ≥ 75 (run live or note unrun — do NOT claim green if not run).
- [ ] **Step 2:** `grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0.
- [ ] **Step 3:** Production-sim build: `DATABASE_URL=postgresql://x:x@unreachable-host/db pnpm build` → compiles + 0 `ENOTFOUND`. (Windows post-compile EPERM-symlink exit 1 is the known quirk; Linux deploy exits 0 — record which you saw. Confirm the new `/orders/lookup` route compiled.)
- [ ] **Step 4:** Write `docs/superpowers/specs/reference/phase-13-handoff.md` (follow `phase-12-handoff.md` format): file-by-file table + commits; the two new columns + migration; webhook event-routing change; refund full-vs-partial logic; fulfillment-state source; the guest-lookup generic-error invariant; operator-pending (Resend config, fulfillment-workflow caveat, sandbox verify checklist from spec §7); deferred items (SMS refund fanout, guest-lookup rate-limiting, tracking numbers/shipping UI).
- [ ] **Step 5:** `git tag phase-13-order-lifecycle && ./scripts/deploy.sh`.

---

## Constraints (must hold throughout)
- `SQUARE_ENV=sandbox`; goaffpro canary **0**; deploy ONLY via `./scripts/deploy.sh`; no new env vars/secrets.
- All webhook side effects are **best-effort** — wrapped in try/catch, never throw out of the handler.
- Refund status / refundedCents / fulfillmentState are **server-computed from the authoritative Square order** (`orders.get`), not from raw payload amounts.
- Guest lookup requires **email + order number both**, returns a **generic** error for any mismatch (no field-level disclosure); rate-limiting is a documented Phase 14 follow-up.
- The account `/account/orders/[id]` **IDOR guard is unchanged** (404 for non-owner) — keep its regression test green.
- Emails are **env-gated** and no-op when Resend is unconfigured.
- Customer pages = **Tailwind / storefront** conventions.
