# Phase 11 — Accounts Area (Order History, Logto↔Square Customer Mapping, Account UI) — Design Spec

**Date:** 2026-06-10
**Status:** Designed. Awaiting plan execution.
**Predecessor:** Phase 10 (`phase-10-cart-emails-storage`, HEAD `34461cb`).

---

## 1. Goal

Give signed-in buyers a customer-facing account area: a landing page, durable
**order history** (list + detail), and an optional **saved shipping address**.
Establish a real **Logto↔Square customer mapping** so each buyer maps to one
Square Customer record, and start **recording completed orders** in our own
database (Square stays the system of record for money; our `orders` table is the
queryable read model for "this user's orders").

This is a **customer-facing storefront area**, NOT an admin area. It uses the
storefront's Tailwind conventions — **not** the admin inline-style/`useFormState`
idiom (that constraint applies only to `(admin)` pages).

---

## 2. Locked decisions (from brainstorm 2026-06-10)

1. **Order source → new `orders` table, written by the existing `payment.created`
   webhook.** Denormalize line items + totals from the authoritative Square
   Order. The account UI reads our DB (fast, durable, no Square rate limits).
   *Rejected:* querying Square on every page load (slow, rate-limited); reusing
   `abandoned_carts`/`order_log` (partial data — cart snapshots hold only catalog
   IDs + expected prices, not final paid totals, taxes, or item names).
2. **Customer mapping → find-or-create a Square Customer at checkout** for
   logged-in buyers; persist the mapping in `customer_link`; attach `customerId`
   to the Square order. *Rejected:* DB-only mapping (leaves Square dashboard
   anonymous); lazy mapping (early orders never get a customerId).
3. **Account UI this phase →** `(account)` route group gated to any authenticated
   user: `/account` landing, `/account/orders` list, `/account/orders/[id]`
   detail. Callback routes admins→`/admin`, everyone else→`/account`.
4. **Address → optional saved shipping address stored on the Square Customer
   object**, editable from the account. **No** verification/autocomplete API
   (Square has no standalone address-validation API; Square hosted checkout still
   collects + validates the real shipping address at pay time). *Rejected:*
   Google Places/Address Validation (new key + billing, convenience-only here).

Out of scope (deferred to Phase 12+): profile name/email editing (owned by
Logto), wishlist UI (`wishlists` table exists, no UI), reviews surfacing, refund
status reflection on orders, guest order lookup by email, Square production
cutover.

---

## 3. Identity model

- **Primary key for "who owns this order" = Logto `sub`** (stable user id),
  stored as `orders.userId`. `buyerEmail` is kept for display + fallback only.
- The `payment.created` webhook is **server-to-server** (no Logto session), so it
  cannot read the buyer's `sub` from a cookie. The attribution bridge is the
  `abandoned_carts` row: at checkout we already write a row keyed by
  `squareOrderId`; Phase 11 **adds `buyerUserId` and `squareCustomerId` columns**
  to that row so the webhook can read them and attribute the order.
- Claims available from `getLogtoContext(logtoConfig)`: `sub`, `email`, `name`,
  `roles` (ID-token claims; scopes already include `openid profile email roles`).

---

## 4. Data flow

### 4.1 Checkout (logged-in buyer) — `POST /api/checkout`
1. Read Logto claims (`sub`, `email`, `name`) — already reads `email`; add `sub`
   + `name`. Anonymous → all null (unchanged guest behavior).
2. If signed in: `findOrCreateSquareCustomer({ userId, email, name })` →
   `squareCustomerId` (cached via `customer_link`).
3. `createPaymentLink({ …, customerId })` → sets `order.customerId` on the Square
   order so the payment is attributed to the customer in Square.
4. `createPendingCart({ …, buyerUserId, squareCustomerId })` → persists the
   bridge fields on the `abandoned_carts` row.

### 4.2 Payment settles — `payment.created` webhook
1. (Existing) idempotency via `order_log.eventId`, `markCartCompleted`, notify
   Discord/SMS.
2. (New) **Record the order:** retrieve the authoritative Square Order
   (`client.orders.get`), read the bridge `abandoned_carts` row for
   `buyerUserId`/`buyerEmail`/`squareCustomerId`, map to a `NewOrder`, and
   `upsertOrder` keyed by `squareOrderId` (idempotent — duplicate webhook
   deliveries DO UPDATE the same row, never duplicate).

### 4.3 Account reads
- `/account/orders` → `getOrdersForUser(currentUserId)` ordered by `placedAt desc`.
- `/account/orders/[id]` → `getOrderById(id)` then **authorize**: 404 unless
  `order.userId === currentUserId` (prevents IDOR / reading another user's order).
- `/account` address form → read current address from the Square Customer
  (`client.customers.get`), save via `client.customers.update`
  (find-or-creates the customer first if the buyer never checked out).

---

## 5. Schema changes (Drizzle → `pnpm db:generate`)

### 5.1 NEW `orders` table
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK defaultRandom | our id, used in `/account/orders/[id]` URLs |
| `squareOrderId` | text **notNull unique** | idempotency key for upsert |
| `squarePaymentId` | text nullable | from the payment event |
| `userId` | text nullable | Logto `sub`; null for guest orders |
| `buyerEmail` | text nullable | display/fallback |
| `squareCustomerId` | text nullable | mirror of the Square order customer |
| `status` | text enum `['completed','refunded','partially_refunded']` notNull default `'completed'` | + explicit CHECK (matches table convention) |
| `totalCents` | integer notNull | from Square order `totalMoney.amount` |
| `currency` | text notNull default `'USD'` | |
| `lineItems` | jsonb notNull | `[{ name, quantity, unitPriceCents, totalCents, catalogObjectId?, variationName? }]` |
| `placedAt` | timestamptz | Square order `createdAt`/`closedAt` |
| `raw` | jsonb | full Square order snapshot (audit/debug) |
| `createdAt` / `updatedAt` | timestamptz notNull defaultNow | |
- Index on `userId` (the account list query filters by it).

### 5.2 RESHAPE `customer_link` (currently unused — PK was `email`)
Re-key to Logto `sub`:
| Column | Type | Notes |
|---|---|---|
| `userId` | text **PK** | Logto `sub` |
| `email` | text | normalized lowercase |
| `squareCustomerId` | text notNull | |
| `name` | text nullable | |
| `cachedAt` | timestamptz notNull defaultNow | |
- Safe destructive change: the table is **empty and unreferenced** anywhere in
  code (confirmed). The generated migration will drop/recreate the PK.

### 5.3 EXTEND `abandoned_carts` (the attribution bridge)
Add two nullable columns:
- `buyerUserId` text — Logto `sub` of the buyer (null for guests).
- `squareCustomerId` text — the Square customer attributed at checkout.

---

## 6. New / changed files

**New libs**
- `src/lib/auth/get-current-user.ts` — `getCurrentUser()` wrapping
  `getLogtoContext(logtoConfig)` → `{ isAuthenticated, userId, email, name, roles }`
  (kills the repeated try/catch boilerplate; used by the account gate, checkout,
  and account pages).
- `src/lib/square/customers.ts` — `findOrCreateSquareCustomer({ userId, email,
  name })`, `getSquareCustomer(customerId)`, `updateSquareCustomerAddress(customerId,
  address)`. Wraps the Square Customers API (search → create → cache in
  `customer_link`).
- `src/lib/db/queries/customer-link.ts` — `getCustomerLinkByUserId(userId)`,
  `upsertCustomerLink(...)`.
- `src/lib/db/queries/orders.ts` — `upsertOrder(NewOrder)` (ON CONFLICT
  `square_order_id`), `getOrdersForUser(userId)`, `getOrderById(id)`.
- `src/lib/orders/build-order.ts` — pure mapper: Square Order + bridge fields →
  `NewOrder` (unit-testable, no I/O).

**Changed libs/routes**
- `src/lib/db/schema.ts` — `orders` table; reshape `customer_link`; extend
  `abandoned_carts`.
- `src/lib/checkout/create-payment-link.ts` — accept optional `customerId`, set
  `order.customerId`.
- `src/lib/db/queries/abandoned-carts.ts` — `createPendingCart` accepts
  `buyerUserId` + `squareCustomerId`.
- `src/app/api/checkout/route.ts` — capture `sub`/`name`; find-or-create Square
  customer; pass `customerId`; persist bridge fields.
- `src/lib/webhooks/handle-event.ts` — on `payment.created`, retrieve Square
  order + upsert into `orders`.
- `src/app/callback/route.ts` — route admins→`/admin`, others→`/account`.

**New account UI** (Tailwind, storefront conventions)
- `src/app/(account)/layout.tsx` — force-dynamic; gate: unauthenticated →
  `redirect('/sign-in')`; otherwise render the account shell.
- `src/app/(account)/account/page.tsx` — landing: greeting, links to orders,
  saved-address summary + edit form.
- `src/app/(account)/account/orders/page.tsx` — order list.
- `src/app/(account)/account/orders/[id]/page.tsx` — order detail (with ownership
  authorization).
- `src/app/(account)/account/_components/AddressForm.tsx` + `actions.ts` —
  `saveAddressAction` server action → Square customer update. (`useFormState` is
  fine here as a general pattern; style with Tailwind, not the admin idiom.)

---

## 7. Square SDK notes (verify against installed `square` version)

- The SDK return shapes vary (the existing `create-payment-link.ts` casts the
  response `as any` and reads `.paymentLink`). The executor must confirm the
  exact method names + response fields against the installed SDK's types:
  - Customers: `client.customers.search(...)`, `client.customers.create(...)`,
    `client.customers.get({ customerId })`, `client.customers.update(...)`.
  - Orders: `client.orders.get({ orderId })` (authoritative line items +
    `totalMoney` + `state` + `customerId`).
- Money amounts come back as `bigint` (see `extractTotalCents` in
  `handle-event.ts`, which already handles `bigint | number`). Convert with
  `Number(...)`.
- Square Customer `address` shape: `{ addressLine1, addressLine2?, locality,
  administrativeDistrictLevel1, postalCode, country }`.

---

## 8. Security / correctness invariants

- **Order-detail authorization:** `/account/orders/[id]` MUST 404 (not 403, to
  avoid confirming existence) when the order's `userId` ≠ the current user's
  `sub`. This is the key IDOR guard — add an explicit test.
- **Guest orders never appear in any account** (no `userId`); they still record
  to `orders` with `userId = null` for admin/analytics completeness.
- **Idempotency:** `upsertOrder` keys on `squareOrderId`; combined with the
  existing `order_log.eventId` guard, replayed webhooks never duplicate orders.
- **Square customer creation is best-effort at checkout:** if the Customers API
  call fails, checkout MUST still proceed (log + continue with
  `customerId = undefined`). A buyer must never be blocked from paying because
  customer mapping hiccuped.
- **`SQUARE_ENV=sandbox`** stays. **goaffpro canary 0.** Deploy via
  `./scripts/deploy.sh` only. Account pages are dynamic (Logto + DB reads) —
  the root layout is already `force-dynamic`; the `(account)` layout adds its
  own `force-dynamic` to be explicit (mirrors `(admin)`).

---

## 9. Operator-pending (post-deploy, documented in the handoff)

- **Logto sign-up enabled:** real customers need to register. Confirm Logto's
  sign-in experience permits self-registration (today only the admin user
  exists). Dashboard-only — no code.
- **No new env vars or secrets** (Square is already configured; sandbox).
- **Verify in sandbox:** sign in as a non-admin Logto user → land on `/account`;
  complete a sandbox checkout → confirm a Square Customer is created and an
  `orders` row appears; open `/account/orders` and the detail page; save an
  address and confirm it persists on the Square Customer.

---

## 10. Test strategy (TDD, per project convention)

Unit (vitest, mocked Square client + `db`):
- `get-current-user` — authenticated/anonymous shapes.
- `customer-link` queries — get/upsert.
- `findOrCreateSquareCustomer` — cached-link path, search-found path, create path,
  failure → throws (caller swallows).
- `build-order` mapper — Square order → `NewOrder` (totals, line items, bigint).
- `orders` queries — `upsertOrder` idempotent, `getOrdersForUser`, `getOrderById`.
- `handle-event` — `payment.created` records an order; duplicate event does not.
- checkout route — captures `sub`, attaches `customerId`, persists bridge fields;
  customer-API failure still returns a checkout URL.
- account pages — orders list renders; **order detail 404s for a non-owner**;
  landing renders; address save calls Square update.

Integration (Postgres) — extend as the existing suite allows for `orders` and
the reshaped `customer_link`; baseline 75 must stay green.

Gates (match Phase 10): `pnpm lint` clean · `pnpm typecheck` clean ·
`pnpm test` (expect ~+25 unit) · `pnpm test:integration` (≥75) ·
`grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0 ·
`DATABASE_URL=postgresql://x:x@unreachable-host/db pnpm build` → compiles + 0
`ENOTFOUND` (force-dynamic verified).
