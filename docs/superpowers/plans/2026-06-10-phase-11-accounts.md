# Phase 11 — Accounts Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Write the failing test first, confirm it fails, implement, confirm it passes, commit.

**Design spec:** `docs/superpowers/specs/2026-06-10-phase-11-accounts-design.md` (read it first — §3 identity model, §5 schema, §7 SDK notes, §8 invariants are load-bearing).

**Goal:** Customer-facing account area — order history (list + detail) backed by a new `orders` table written from the `payment.created` webhook, a real Logto↔Square customer mapping created at checkout, and an optional saved address on the Square Customer.

**Stack:** Next.js 14 App Router, Drizzle/Postgres, Square SDK (`square`), Logto. Account pages use **Tailwind** (storefront conventions) — NOT the admin inline-style idiom.

---

## Baseline verification

- [ ] `git status` clean on `main`, HEAD `34461cb` or later.
- [ ] `pnpm test` → 299 unit pass; `pnpm typecheck` clean.
- [ ] `grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0.
- [ ] Confirm the installed `square` SDK method names for customers + orders (§7 of the spec) before writing Square calls: inspect `node_modules/square` types or a quick scratch import. Record the exact signatures you'll use.

---

## Task 1: Schema — `orders` table, reshape `customer_link`, extend `abandoned_carts`

**Files:** `src/lib/db/schema.ts`, generated migration under `drizzle/migrations/`.

- [ ] **Step 1:** Add the `orders` table to `schema.ts` (see spec §5.1). Use the existing idioms: `uuid('id').primaryKey().defaultRandom()`, a `text('status', { enum: [...] })` column **plus** an explicit `check('orders_status_valid', sql\`...\`)`, `integer`, `jsonb`, `timestamp({ withTimezone: true })`, and `index('orders_user_id_idx').on(table.userId)`. Export `Order` / `NewOrder` inferred types.
- [ ] **Step 2:** Reshape `customerLink` (spec §5.2): PK becomes `userId` (Logto sub); add `email`, `name`, keep `squareCustomerId` (notNull) + `cachedAt`. Export updated types.
- [ ] **Step 3:** Extend `abandonedCarts` (spec §5.3): add `buyerUserId: text('buyer_user_id')` and `squareCustomerId: text('square_customer_id')` (both nullable).
- [ ] **Step 4:** `pnpm db:generate`. Review the generated `.sql` — confirm: new `orders` table + CHECK + index; `customer_link` PK change (drop old PK on `email`, add PK on `user_id`); two new nullable columns on `abandoned_carts`. The `customer_link` reshape is safe (table is empty + unreferenced).
- [ ] **Step 5:** Apply to the local sandbox DB: `pnpm db:push` (dev) — requires Postgres on `:5433` (`docker compose --profile local up -d postgres`). If Docker is unavailable in the exec environment, note it and rely on integration CI; do NOT skip generating the migration file.
- [ ] **Step 6:** `pnpm typecheck` (schema types compile). Commit:
  `git add src/lib/db/schema.ts drizzle/migrations && git commit -m "feat(db): orders table, customer_link re-key to Logto sub, abandoned_carts bridge columns"`

---

## Task 2: `getCurrentUser()` auth helper

**Files:** create `src/lib/auth/get-current-user.ts`, `tests/auth/get-current-user.test.ts`.

- [ ] **Step 1 (test first):** assert `getCurrentUser()` returns `{ isAuthenticated: true, userId, email, name, roles }` when `getLogtoContext` resolves authenticated claims (mock `@logto/next/server-actions`), and `{ isAuthenticated: false, userId: null, ... }` when unauthenticated or when `getLogtoContext` throws.
- [ ] **Step 2:** Implement. Signature:
  ```ts
  export interface CurrentUser {
    isAuthenticated: boolean
    userId: string | null   // Logto sub
    email: string | null
    name: string | null
    roles: string[]
  }
  export async function getCurrentUser(): Promise<CurrentUser>
  ```
  Wrap `getLogtoContext(logtoConfig)` in try/catch; map `claims.sub|email|name|roles`. `import 'server-only'`.
- [ ] **Step 3:** Tests pass; `pnpm typecheck`. Commit: `feat(auth): getCurrentUser() helper over getLogtoContext`.

---

## Task 3: `customer_link` queries

**Files:** create `src/lib/db/queries/customer-link.ts`, `tests/db/customer-link.test.ts`.

- [ ] **Step 1 (test first):** mock `@/lib/db/client` (follow the `mockDb.select/from/where` chain pattern in `tests/db/abandoned-carts.test.ts`). Test `getCustomerLinkByUserId('u1')` returns the row; `upsertCustomerLink(...)` calls insert→onConflictDoUpdate keyed on `userId`.
- [ ] **Step 2:** Implement `getCustomerLinkByUserId(userId)` and `upsertCustomerLink({ userId, email, squareCustomerId, name })` (`.onConflictDoUpdate({ target: customerLink.userId, set: { email, squareCustomerId, name, cachedAt: new Date() } })`). `import 'server-only'`.
- [ ] **Step 3:** Tests pass; typecheck. Commit: `feat(db): customer-link queries (get by userId, upsert)`.

---

## Task 4: Square customers module (`findOrCreateSquareCustomer`)

**Files:** create `src/lib/square/customers.ts`, `tests/square/customers.test.ts`.

- [ ] **Step 1 (test first):** mock `@/lib/square/client` (`getSquareClient`) and `@/lib/db/queries/customer-link`. Cover:
  - **cached path:** `getCustomerLinkByUserId` returns a link → returns its `squareCustomerId`, no Square API call.
  - **search-found path:** no link, `client.customers.search` returns a customer by email → uses it, upserts link.
  - **create path:** no link, search empty → `client.customers.create` → upserts link.
- [ ] **Step 2:** Implement (verify SDK method/response shapes per spec §7; cast `as any` where the SDK types are loose, mirroring `create-payment-link.ts`):
  ```ts
  export async function findOrCreateSquareCustomer(opts: {
    userId: string; email: string | null; name: string | null
  }): Promise<string>           // returns squareCustomerId
  export async function getSquareCustomer(customerId: string): Promise<SquareCustomer | null>
  export async function updateSquareCustomerAddress(customerId: string, address: CustomerAddress): Promise<void>
  ```
  `findOrCreate`: check link → search by email (if email) → create (referenceId = userId) → `upsertCustomerLink`. `import 'server-only'`.
- [ ] **Step 3:** Tests pass; typecheck. Commit: `feat(square): findOrCreateSquareCustomer + customer get/update-address`.

---

## Task 5: `orders` queries + `build-order` mapper

**Files:** create `src/lib/orders/build-order.ts`, `src/lib/db/queries/orders.ts`, `tests/orders/build-order.test.ts`, `tests/db/orders.test.ts`.

- [ ] **Step 1 (mapper test first):** `buildOrder(squareOrder, bridge)` → `NewOrder`. Assert: `totalCents` from `totalMoney.amount` (handle `bigint`), `lineItems` mapped to `[{ name, quantity, unitPriceCents, totalCents, catalogObjectId }]`, `status: 'completed'`, `userId`/`buyerEmail`/`squareCustomerId` from the bridge, `placedAt` from the Square order timestamp, `raw` = the square order.
- [ ] **Step 2:** Implement `buildOrder` as a pure function (no I/O) in `src/lib/orders/build-order.ts`.
- [ ] **Step 3 (query tests):** mock `db`. `upsertOrder(newOrder)` → insert + `onConflictDoUpdate({ target: orders.squareOrderId, set: {...} })`. `getOrdersForUser(userId)` → select where `userId` eq, `orderBy placedAt desc`. `getOrderById(id)` → single row or undefined.
- [ ] **Step 4:** Implement the three queries. `import 'server-only'`.
- [ ] **Step 5:** Tests pass; typecheck. Commit: `feat(orders): build-order mapper + orders queries (upsert, getForUser, getById)`.

---

## Task 6: Record orders from the `payment.created` webhook

**Files:** modify `src/lib/webhooks/handle-event.ts`, `src/lib/db/queries/abandoned-carts.ts` (extend `getCartBySquareOrderId` already returns full row — confirm it exposes the new bridge columns), `tests/webhooks/handle-event.test.ts` (extend existing).

- [ ] **Step 1 (test first):** extend the webhook test. On `payment.created`: mock `client.orders.get` to return a Square order, mock `getCartBySquareOrderId` to return a row with `buyerUserId`/`buyerEmail`/`squareCustomerId`, and assert `upsertOrder` is called with the mapped order. Assert a **duplicate** event (already-seen `eventId`) does NOT call `upsertOrder`.
- [ ] **Step 2:** In `handleSquareEvent`, after `markCartCompleted` + reading the cart, add order recording: retrieve the Square order (`getSquareClient().orders.get({ orderId: squareOrderId })`), build via `buildOrder(squareOrder, { userId: cart?.buyerUserId ?? null, buyerEmail: cart?.buyerEmail ?? null, squareCustomerId: cart?.squareCustomerId ?? null, squarePaymentId })`, `await upsertOrder(...)`. Wrap in try/catch — an order-recording failure must **log + continue** (notifications already succeeded; never throw out of the webhook). Place it inside the existing `event.type === 'payment.created'` block, after the `alreadySeen` guard so duplicates skip it.
- [ ] **Step 3:** Tests pass; typecheck. Commit: `feat(webhook): record completed orders into orders table on payment.created`.

---

## Task 7: Capture buyer identity + Square customer at checkout

**Files:** modify `src/app/api/checkout/route.ts`, `src/lib/checkout/create-payment-link.ts`, `src/lib/db/queries/abandoned-carts.ts`, extend `tests/api/checkout-buyer-email.test.ts` (or a new `tests/api/checkout-customer.test.ts`).

- [ ] **Step 1 (test first):** assert that for a signed-in buyer the route calls `findOrCreateSquareCustomer`, passes the returned `customerId` to `createPaymentLink`, and `createPendingCart` receives `buyerUserId` (the sub) + `squareCustomerId`. Assert that when `findOrCreateSquareCustomer` **throws**, the route still returns a checkout URL (best-effort, spec §8) with `customerId` omitted. Assert guest checkout still passes nulls.
- [ ] **Step 2:** `create-payment-link.ts` — add optional `customerId?: string` to `CreatePaymentLinkArgs`; set `order.customerId` when present.
- [ ] **Step 3:** `abandoned-carts.ts` — extend `CreatePendingCartInput` + `createPendingCart` insert with `buyerUserId` and `squareCustomerId` (both nullable).
- [ ] **Step 4:** `checkout/route.ts` — read `claims.sub` + `claims.name` alongside the existing email capture; if signed in, `try { customerId = await findOrCreateSquareCustomer({ userId: sub, email, name }) } catch { /* log, continue */ }`; pass `customerId` to `createPaymentLink`; pass `buyerUserId: sub` + `squareCustomerId: customerId ?? null` to `createPendingCart`.
- [ ] **Step 5:** Tests pass; typecheck. Commit: `feat(checkout): map buyer to Square customer + persist identity bridge`.

---

## Task 8: `(account)` route group + gate + landing

**Files:** create `src/app/(account)/layout.tsx`, `src/app/(account)/account/page.tsx`, `tests/account/account-page.test.tsx`.

- [ ] **Step 1:** `(account)/layout.tsx` — `export const dynamic = 'force-dynamic'`; use `getCurrentUser()`; if `!isAuthenticated` → `redirect('/sign-in')`; otherwise render a minimal Tailwind account shell wrapping `children`. (No admin inline-style idiom; this is storefront.)
- [ ] **Step 2 (test first):** `/account` renders a greeting using the user's name/email and links to `/account/orders`.
- [ ] **Step 3:** Implement `account/page.tsx` (server component): greeting + link to orders + the address section (placeholder until Task 10). Tailwind.
- [ ] **Step 4:** Tests pass; typecheck. Commit: `feat(account): (account) route group, auth gate, landing page`.

---

## Task 9: Order history list + detail (with ownership authorization)

**Files:** create `src/app/(account)/account/orders/page.tsx`, `src/app/(account)/account/orders/[id]/page.tsx`, `tests/account/orders-list.test.tsx`, `tests/account/order-detail.test.tsx`.

- [ ] **Step 1 (list test first):** mock `getCurrentUser` + `getOrdersForUser`; assert the list renders each order's date/total and links to `/account/orders/[id]`; empty state when none.
- [ ] **Step 2:** Implement the list page: `getOrdersForUser(currentUser.userId)`, render Tailwind cards/rows.
- [ ] **Step 3 (detail test first — THE security test):** mock `getCurrentUser` + `getOrderById`. Assert: owner sees line items + total; **a user whose `userId` ≠ `order.userId` gets `notFound()` (404)**; missing order → 404.
- [ ] **Step 4:** Implement the detail page: fetch by `params.id`; if `!order || order.userId !== currentUser.userId` → `notFound()`; else render line items, totals, status, placedAt.
- [ ] **Step 5:** Tests pass; typecheck. Commit: `feat(account): order history list + detail with ownership guard`.

---

## Task 10: Saved address (Square customer)

**Files:** create `src/app/(account)/account/_components/AddressForm.tsx`, `src/app/(account)/account/_components/actions.ts`, wire into `account/page.tsx`, `tests/account/address-action.test.ts`.

- [ ] **Step 1 (test first):** `saveAddressAction` — parses form fields, `findOrCreateSquareCustomer` for the current user, calls `updateSquareCustomerAddress(customerId, address)`, returns `{ saved: true }`. Mock Square + `getCurrentUser`.
- [ ] **Step 2:** Implement `actions.ts` (`'use server'` server action) + `AddressForm.tsx` (`'use client'`, `useFormState` from `react-dom`, Tailwind styling). Read current address on the landing page via `getSquareCustomer(customerId)` (resolve `customerId` from `customer_link`; if none, show empty form).
- [ ] **Step 3:** Wire the form into `account/page.tsx`; on save, `revalidatePath('/account')`.
- [ ] **Step 4:** Tests pass; typecheck. Commit: `feat(account): saved shipping address on Square customer`.

---

## Task 11: Post-login routing — admins→/admin, others→/account

**Files:** modify `src/app/callback/route.ts`, `tests/app/callback.test.ts` (create if absent; if the callback is hard to unit-test due to `handleSignIn`, cover the role→destination decision via a small extracted pure helper `postLoginDestination(roles)` with its own test).

- [ ] **Step 1 (test first):** `postLoginDestination(['admin'])` → `/admin`; `postLoginDestination([])` → `/account`.
- [ ] **Step 2:** Extract `postLoginDestination(roles: string[])`; in the callback, after `handleSignIn`, read the freshly-established context (`getLogtoContext`) for roles and redirect via `postLoginDestination`. Update the stale comment (lines 39–40) to reflect that `/account` now exists.
- [ ] **Step 3:** Tests pass; typecheck. Commit: `feat(auth): route non-admin users to /account after sign-in`.

---

## Task 12: Final verification + handoff + tag + deploy

- [ ] **Step 1:** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration`. Expect lint/typecheck clean; unit ≈ 299 + ~25 new; integration ≥ 75 (run against a live Postgres if Docker available; otherwise note it and rely on CI — do NOT claim integration green if it wasn't run).
- [ ] **Step 2:** `grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0.
- [ ] **Step 3:** Production-sim build: `DATABASE_URL=postgresql://x:x@unreachable-host/db pnpm build` → compiles + 0 `ENOTFOUND` (account/callback pages are dynamic). On Windows the standalone copy may EPERM-symlink at exit 1 *after* a successful compile (known Phase 10 quirk — Linux deploy exits 0); record which you observed.
- [ ] **Step 4:** Write `docs/superpowers/specs/reference/phase-11-handoff.md` (follow `phase-10-handoff.md` format): file-by-file table + commits; the three schema changes + migration; the identity bridge; new libs; the IDOR authorization guard; operator-pending (Logto sign-up, sandbox verify checklist from spec §9); deferred items (profile edit, wishlist UI, reviews surfacing, refund status, guest order lookup, Square prod cutover).
- [ ] **Step 5:** `git tag phase-11-accounts && ./scripts/deploy.sh`.

---

## Constraints (must hold throughout)
- `SQUARE_ENV=sandbox` — no production cutover. goaffpro canary **0**.
- Deploy ONLY via `./scripts/deploy.sh`.
- Account pages = **Tailwind / storefront** conventions (NOT the admin inline-style + `useFormState`-mandatory idiom; `useFormState` may still be used for the address form, styled with Tailwind).
- Square customer creation is **best-effort** at checkout — never block payment.
- Order-detail page MUST enforce ownership (404 for non-owner) — Task 9 Step 3 is the gating test.
- Reuse the Logto session model; no new auth vendor; no new secrets/env vars.
