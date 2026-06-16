# Phase 17 — Admin Order Tooling — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-06-16-phase-17-admin-order-tooling-design.md`
**Method:** strict TDD per task (failing test → confirm fail → implement →
confirm pass → commit per task), same as Phases 11–16.
**Hard constraints:** §8 of the spec. Deploy ONLY via `./scripts/deploy.sh`.
`SQUARE_ENV=sandbox`. goaffpro + logto canaries 0. Use `corepack pnpm` for
everything (bare-`pnpm` prebuild is bypassed — Phase 10+ convention). Repo-wide
`pnpm lint` is red on pre-existing CRLF files — scope `biome check` to files you
touch. The workstation cannot reach the dev DB; anything DB-live happens via the
deployed app or a local Postgres (`docker compose up` on port 5433 per
`.env.local`). **No DB migration in this phase. No partial refunds. Fulfillment
pushes to Square (not a local override).**

## Baseline verification (already green on this Mac, 2026-06-16)

```sh
git checkout main && git pull && git rev-parse HEAD       # expect d78ab79 or later
corepack pnpm install && corepack pnpm content:build
corepack pnpm typecheck                                    # clean
corepack pnpm test                                         # 539 passed
DATABASE_URL=postgresql://x:x@unreachable-host:5432/db corepack pnpm exec next build
#   → Compiled successfully + Generating static pages (40/40) + 0 ENOTFOUND/ECONNREFUSED
```

## Task 1: Data layer — `listOrders` / `countOrders`

`src/lib/db/queries/orders.ts`:
- `listOrders({ limit, offset, status?, fulfillmentState?, q? })` →
  `Order[]`, ordered `placedAt DESC NULLS LAST, createdAt DESC`. `q` =
  case-insensitive match on `squareOrderId` OR `buyerEmail`. `status` /
  `fulfillmentState` exact filters. Cap `limit` (e.g. ≤100).
- `countOrders({ status?, fulfillmentState?, q? })` → `number`.
- Tests: filter combinations, search, pagination bounds, ordering, empty result.
  Follow the existing `tests/db/*orders*`/queries test idiom.

## Task 2: Data layer — `getOrderDashboardStats`

`src/lib/db/queries/orders.ts`: `getOrderDashboardStats()` returning counts +
`sum(totalCents)` for today/7d/30d windows, `sum(refundedCents)`, and a
"needs-fulfillment" count (`status='completed'` AND `fulfillmentState` in
`(null,'PROPOSED','RESERVED','PREPARED')`). ≤2 SQL round-trips. Window math is
relative to `now()` — make it testable (inject/clock or assert SQL shape).
Tests: window boundaries, refund sum, needs-fulfillment predicate.

## Task 3: Admin order list page + nav entry

- `src/app/(admin)/admin/orders/page.tsx` (server component): reads
  `searchParams` (status, fulfillment, q, page) → `listOrders` + `countOrders`;
  renders `OrdersTable` + filter controls + pager. Empty state. Match
  `/admin/artists` styling (inline styles, table idiom, `padding:1.5rem`).
- `src/app/(admin)/admin/orders/_components/OrdersTable.tsx`: columns =
  order# (link to detail), placed date, buyer email, total (`formatCents`),
  status (`statusLabel`), fulfillment (`fulfillmentLabel`). Reuse
  `src/lib/orders/labels.ts` + `formatCents`.
- Add `{ href: '/admin/orders', title: 'Orders', description: '…' }` to the
  `SECTIONS` array in `src/app/(admin)/admin/page.tsx`.
- Tests: `tests/admin/orders-page.test.tsx` (renders heading/table/filters/
  pager; empty state; links to detail). Mock the queries.

## Task 4: Admin order detail page (read-only first)

`src/app/(admin)/admin/orders/[id]/page.tsx` (server component): `getOrderById`,
`notFound()` if missing. `OrderDetail` component renders buyer (email, userId,
squareCustomerId), payment (`squarePaymentId`), status, refunded
(`formatCents(refundedCents)` of total), fulfillment label, line-items table,
`placedAt`, and a collapsed/raw link or "view in Square" deep-link. Refund +
fulfillment **panels are added in Tasks 6–7** (this task ships the static view).
Tests: detail renders all fields; 404 path.

## Task 5: Square wrappers — refund + fulfillment helpers (pure-ish, mocked)

- `src/lib/square/refunds.ts`: `issueFullRefund({ order }): Promise<{ refundId, status }>`
  — guards (`squarePaymentId` present, `status==='completed'`,
  `refundedCents===0`, `remaining>0`); calls
  `getSquareClient().refunds.refundPayment({ idempotencyKey: 'refund_'+squareOrderId,
  paymentId, amountMoney:{ amount: BigInt(remaining), currency }, reason })`;
  maps SDK response/errors. Does NOT write the DB (webhook reconciles); MAY
  return enough for the action to call the existing reconcile path.
- `src/lib/square/fulfillment.ts`: `advanceFulfillment({ squareOrderId, toState })`
  — `orders.get` for `version`+fulfillment `uid`; validate allowed transition;
  `orders.update({ orderId, idempotencyKey, order:{ locationId, version,
  fulfillments:[{ uid, state: toState }] } })`. **Handle both branches:**
  existing fulfillment (update state) vs none (add a fulfillment, or — if that
  proves complex — throw a typed "NO_FULFILLMENT" error the action surfaces; see
  spec §4.2 fallback). Map errors.
- Tests: mock `getSquareClient()`; assert request payloads, guard rejections,
  transition validation, error mapping. **Pin against SDK v44** (`square@44.0.1`):
  `client.refunds.refundPayment`, `client.orders.get`, `client.orders.update`.

## Task 6: Refund action + panel

- `src/app/(admin)/admin/orders/[id]/actions.ts` → `issueRefundAction(orderId, prev, form)`:
  `'use server'`; **re-check admin** via `getCurrentUser()` (spec §7 — money
  moves); read `confirm` (must equal `REFUND`) + `reason` (non-empty,
  length-capped); `getOrderById`; call `issueFullRefund`; on success optionally
  re-fetch Square order + `updateOrderStatus(...)` for immediate feedback;
  write audit `order_log` row (`admin.refund.issued`); `revalidatePath` the
  detail + list; return `{ ok }`/`{ error }` (no redirect — stay on page).
- `_components/RefundPanel.tsx` (`'use client'`, `useFormState`): hidden/disabled
  when `squarePaymentId` null or status≠completed; typed-confirm input + reason +
  submit; shows Square error inline; success banner.
- Tests: `tests/admin/orders-actions.test.ts` — guards, non-admin rejection,
  happy path (correct Square args + audit write + revalidate), Square-error
  surfacing, already-refunded rejection.

## Task 7: Fulfillment action + panel

- `issueRefundAction`'s sibling `advanceFulfillmentAction(orderId, prev, form)`
  in the same `actions.ts`: re-check admin; read `toState`; validate transition;
  call `advanceFulfillment`; optional optimistic `setOrderFulfillmentState`;
  audit `order_log` (`admin.fulfillment.advanced`, from/to); revalidate; return
  state.
- `_components/FulfillmentPanel.tsx` (`'use client'`): state `<select>` limited
  to allowed forward targets + CANCELED; disabled on terminal states; surfaces
  the `NO_FULFILLMENT` error if Square has no fulfillment to advance.
- Tests: transition validation, non-admin rejection, Square args, error paths,
  audit write.

## Task 8: Dashboard strip

Add a compact read-only stats strip to `src/app/(admin)/admin/page.tsx` using
`getOrderDashboardStats()` (orders today/7d/30d, revenue, refunded total,
needs-fulfillment count). Keep `(admin)/layout.tsx` `force-dynamic`. Test:
renders the numbers from a mocked stats object.

## Task 9: Final gates + deploy

```sh
corepack pnpm typecheck
corepack pnpm test                                  # 539 + new tests, all green
grep -rni "logto" src/ tests/                       # 0
grep -rn "goaffpro\|GoAffPro" src/ tests/           # 0
DATABASE_URL=postgresql://x:x@unreachable-host:5432/db corepack pnpm exec next build
#   → Compiled successfully + 0 ENOTFOUND/ECONNREFUSED; new /admin/orders routes listed dynamic (ƒ)
./scripts/deploy.sh
```

Post-deploy read-only probes from the workstation: `/admin/orders` → 307 anon;
`/api/health` 200; existing pages unaffected. (Authenticated admin checks are
the operator/live-verify step.)

## Task 10: Live verification (with the operator) — spec §10 (P17-1…P17-6)

Run after deploy, folded into the deferred V1–V7. **P17-2 (fulfillment shape)
gates whether Task 5/7's no-fulfillment branch needs the "add fulfillment" path
or the read-only fallback** — confirm against the real sandbox order before
declaring fulfillment-push done. Record Resend-blocked email legs as "partial:
blocked on Resend".

## Task 11: Handoff + tag

Write `docs/superpowers/specs/reference/phase-17-handoff.md` (skeleton like
phase-16: TL;DR, file-by-file, verification state incl. live results + any §4.2
fallback taken, plan deviations, operator-pending, Phase 18 candidates). Update
`RESUME-HERE.md`. Tag `phase-17-admin-order-tooling`. Report back to Master.

## Constraints (must hold throughout)

- Never edit `SQUARE_ENV`, goaffpro values, or deploy outside `deploy.sh`.
- `(account)`/`(admin)` keep `force-dynamic`; IDOR + admin-gate tests green.
- No DB migration; no new build-time-required env var.
- Refunds full-only; fulfillment pushes to Square.
- The two mutating actions re-check admin (defense in depth).
- Commit per task; conventional-commit style matching the existing log.
- Reconciliation stays in the existing webhook handlers — actions call Square and
  reuse `updateOrderStatus`/`setOrderFulfillmentState`; do not fork the math.
```
