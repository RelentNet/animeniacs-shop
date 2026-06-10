# Phase 11 → Phase 12 hand-off

**Status:** Phase 11 **code-complete**. The customer-facing account area shipped
in 12 tasks: a new durable `orders` read model written from the `payment.created`
webhook, a real Logto↔Square customer mapping created at checkout, a gated
`(account)` route group (landing + order history list + detail with an IDOR
ownership guard), a saved shipping address on the Square Customer, and role-based
post-login routing (admins→`/admin`, everyone else→`/account`). All automated
**code** gates green (lint / typecheck / unit / canary / unreachable-DB build).
Tag `phase-11-accounts` applied at the final commit. Deploy triggered via
`./scripts/deploy.sh`.

**Date:** 2026-06-10

> **Read me first, master orchestrator:** the account area is **gated and live on
> deploy**, but two operator steps gate real-world use (§9, do NOT block):
> (1) **Logto self-registration** must be enabled in the Logto dashboard so real
> customers can register — today only the admin user exists; (2) the **sandbox
> verification checklist** (sign in as a non-admin → land on `/account`, run a
> sandbox checkout → confirm a Square Customer + an `orders` row, view the order
> pages, save an address). `SQUARE_ENV` stays `sandbox`; no prod cutover. goaffpro
> canary stays **0**. **No new env vars or secrets** were added this phase.
> Integration tests were **not run locally** (no Postgres/Docker in the exec
> environment) — run them in CI/against a live DB before relying on them (§8).

---

## 1. TL;DR

Phase 11 added:

- **`orders` table** — a durable read model of completed orders, written by the
  existing `payment.created` webhook from the authoritative Square Order. The
  account UI reads our DB (fast, durable, no Square rate limits). Square stays the
  system of record for money.
- **Logto↔Square customer mapping** — `findOrCreateSquareCustomer` maps each
  signed-in buyer to exactly one Square Customer at checkout (cached in the
  re-keyed `customer_link`), attaches `customerId` to the Square order, and is
  **best-effort** (a Customers-API failure never blocks payment).
- **Attribution bridge** — the server-to-server webhook can't read the buyer's
  Logto session, so checkout now writes `buyer_user_id` + `square_customer_id`
  onto the `abandoned_carts` row keyed by `square_order_id`; the webhook reads
  them to attribute the order.
- **`(account)` route group** (Tailwind, storefront conventions) — `/account`
  landing (greeting + saved-address form), `/account/orders` list,
  `/account/orders/[id]` detail with an **IDOR ownership guard** (404 for
  non-owners).
- **Saved shipping address** stored on the Square Customer, editable from the
  account landing page via a `useFormState` server action.
- **Post-login routing** — `postLoginDestination(roles)`: admins→`/admin`,
  everyone else→`/account`.

**Schema:** 3 changes (new `orders` table; `customer_link` re-keyed from `email`
PK to `user_id`/Logto sub; 2 nullable bridge columns on `abandoned_carts`) →
migration `0012_military_puma.sql`. **Env:** **no changes**. **Tests:** +43 unit
(299 → **342**). Integration unchanged structurally (1 existing test updated for
the re-keyed `customer_link`; **not run locally**).

---

## 2. Required reading order

1. **This doc** (`phase-11-handoff.md`).
2. **`phase-10-handoff.md`** — cart-clear fix, abandoned-cart emails, durable
   uploads; `corepack pnpm` build note; the Windows EPERM standalone quirk.
3. **`phase-09-handoff.md`** — promo bar, `/admin/settings`, `scripts/deploy.sh`,
   and the **`force-dynamic` post-mortem** (§11 there) — still in force.
4. **Phase 11 plan + spec:**
   `docs/superpowers/plans/2026-06-10-phase-11-accounts.md` +
   `docs/superpowers/specs/2026-06-10-phase-11-accounts-design.md`.

---

## 3. What Phase 11 shipped (file-by-file)

**Task 1 — schema (commit `cf33698`):**

| File | Change |
|---|---|
| `src/lib/db/schema.ts` | NEW `orders` table (uuid PK, `square_order_id` notNull unique, nullable `user_id`/`buyer_email`/`square_customer_id`/`square_payment_id`, status enum + CHECK `orders_status_valid`, `total_cents`, `currency` default USD, `line_items` jsonb, `placed_at`, `raw` jsonb, `created_at`/`updated_at`, index `orders_user_id_idx`). RESHAPED `customer_link` (PK `email`→`user_id`; `email`/`name` nullable; keep `square_customer_id` notNull + `cached_at`). EXTENDED `abandoned_carts` (+`buyer_user_id`, +`square_customer_id`, both nullable). Exported `Order`/`NewOrder` types. |
| `drizzle/migrations/0012_military_puma.sql` | NEW migration. **Hand-corrected**: drizzle-kit couldn't auto-name the old PK to drop, and Postgres rejects `ADD COLUMN … PRIMARY KEY` while the old PK exists. Rewrote to `DROP CONSTRAINT IF EXISTS customer_link_pkey` → add `user_id` → `ADD CONSTRAINT customer_link_pkey PRIMARY KEY (user_id)`. Safe: table empty + unreferenced. |
| `tests/integration/customer-link.integration.test.ts` | UPDATED to the re-keyed shape (userId PK; email/name nullable). The spec's "unreferenced" claim missed this test — see deviation 1. |

**Task 2 — `getCurrentUser()` (commit `cbb8d11`):**

| File | Change |
|---|---|
| `src/lib/auth/get-current-user.ts` | NEW — wraps `getLogtoContext(logtoConfig)` in try/catch → `{ isAuthenticated, userId, email, name, roles }`; anonymous fallback on unauth or throw. `import 'server-only'`. |
| `tests/auth/get-current-user.test.ts` | NEW — 4 unit tests (authed, anon, sparse claims, throw). |

**Task 3 — customer-link queries (commit `32342d8`):**

| File | Change |
|---|---|
| `src/lib/db/queries/customer-link.ts` | NEW — `getCustomerLinkByUserId(userId)` (select→where→limit), `upsertCustomerLink({userId,email,squareCustomerId,name})` (insert→onConflictDoUpdate on `customerLink.userId`). |
| `tests/db/customer-link.test.ts` | NEW — 3 unit tests (mocked db). |

**Task 4 — Square customers module (commit `0e14cd1`):**

| File | Change |
|---|---|
| `src/lib/square/customers.ts` | NEW — `findOrCreateSquareCustomer` (cached link → search by email → create with `referenceId=userId` → upsert link), `getSquareCustomer` (null on throw), `updateSquareCustomerAddress`. SDK responses cast `as any` (mirrors `create-payment-link.ts`). `CustomerAddress` type exported. |
| `tests/square/customers.test.ts` | NEW — 8 unit tests (cached/search/create/no-email/throw paths + get + update-address). |

**Task 5 — orders mapper + queries (commit `5c2827d`):**

| File | Change |
|---|---|
| `src/lib/orders/build-order.ts` | NEW — pure `buildOrder(squareOrder, bridge)` → `NewOrder`; bigint→cents; line-item mapping; `placedAt` from `closedAt`/`createdAt`; `OrderLineItem`/`OrderBridge` exported. |
| `src/lib/db/queries/orders.ts` | NEW — `upsertOrder` (onConflict `squareOrderId`), `getOrdersForUser` (where userId, orderBy placedAt desc), `getOrderById`. |
| `tests/orders/build-order.test.ts` (5) + `tests/db/orders.test.ts` (4) | NEW unit tests. |

**Task 6 — record orders in the webhook (commit `9143e97`):**

| File | Change |
|---|---|
| `src/lib/webhooks/handle-event.ts` | MODIFIED — on `payment.created`, after notifications: `getSquareClient().orders.get({orderId})` → `buildOrder(order, {userId,buyerEmail,squareCustomerId,squarePaymentId})` from the bridge cart → `upsertOrder`. Wrapped in try/catch (**log + continue, never throw**). Added `extractPaymentId`. Duplicate (already-seen) events skip recording via the existing `alreadySeen` guard. |
| `tests/webhooks/handle-event.test.ts` | EXTENDED — +4 (records with bridge identity; guest null userId; duplicate skips; recording failure swallowed). |

**Task 7 — checkout customer capture (commit `2b0aac9`):**

| File | Change |
|---|---|
| `src/app/api/checkout/route.ts` | MODIFIED — capture `claims.sub`+`claims.name` alongside email; if signed in, `findOrCreateSquareCustomer` (try/catch → log+continue, `customerId` stays undefined); pass `customerId` to `createPaymentLink`; pass `buyerUserId`+`squareCustomerId` to `createPendingCart`. |
| `src/lib/checkout/create-payment-link.ts` | MODIFIED — optional `customerId`; sets `order.customerId` when present. |
| `src/lib/db/queries/abandoned-carts.ts` | MODIFIED — `CreatePendingCartInput` + insert accept `buyerUserId`/`squareCustomerId` (nullable). |
| `tests/api/checkout-customer.test.ts` | NEW — 3 unit tests (signed-in maps + bridge; Customers-API throw still returns URL; guest nulls). |

**Task 8 — account group + gate + landing (commit `2775392`):**

| File | Change |
|---|---|
| `src/app/(account)/layout.tsx` | NEW — `force-dynamic`; `getCurrentUser()`; `!isAuthenticated`→`redirect('/sign-in')`; Tailwind account shell + nav. |
| `src/app/(account)/account/page.tsx` | NEW — greeting (name/email fallback), link to orders, saved-address section (form wired in Task 10). |
| `tests/account/account-page.test.tsx` | NEW — 2 unit tests. |

**Task 9 — order history list + detail (commit `947a100`):**

| File | Change |
|---|---|
| `src/app/(account)/account/orders/page.tsx` | NEW — `getOrdersForUser`, Tailwind list, empty state, per-row link (`aria-label` for the accessible name). |
| `src/app/(account)/account/orders/[id]/page.tsx` | NEW — `getOrderById` + `getCurrentUser`; **`notFound()` unless `order.userId === user.userId`** (IDOR guard); renders line items/total/status/date. |
| `tests/account/orders-list.test.tsx` (2) + `tests/account/order-detail.test.tsx` (3, incl. the IDOR security test) | NEW. |

**Task 10 — saved address (commit `080cc33`):**

| File | Change |
|---|---|
| `src/app/(account)/account/_components/actions.ts` | NEW — `'use server'` `saveAddressAction`: auth-guard → parse/validate → `findOrCreateSquareCustomer` → `updateSquareCustomerAddress` → `revalidatePath('/account')` → `{saved:true}`; errors returned as `{error}`. |
| `src/app/(account)/account/_components/AddressForm.tsx` | NEW — `'use client'`, `useFormState`, Tailwind fields + saved/error banners. |
| `src/app/(account)/account/page.tsx` | MODIFIED — resolves the current address via `customer_link`→`getSquareCustomer` and pre-fills `<AddressForm>`. |
| `tests/account/address-action.test.ts` | NEW — 3 unit tests. `account-page.test.tsx` gained the Phase-9-style partial `react-dom` mock (useFormState undefined under jsdom). |

**Task 11 — post-login routing (commit `8305963`):**

| File | Change |
|---|---|
| `src/lib/auth/post-login-destination.ts` | NEW — pure `postLoginDestination(roles)` → `/admin` if admin else `/account`. |
| `src/app/callback/route.ts` | MODIFIED — after `handleSignIn`, read `getLogtoContext` roles → redirect via `postLoginDestination`; stale comment corrected. |
| `tests/auth/post-login-destination.test.ts` | NEW — 2 unit tests. |

**Cleanup:** `style(phase-11): apply biome formatting to Phase 11 files`
(`e48cbbc`) — `biome check --write` scoped to the 31 changed files (import
ordering + line-wrapping). No unrelated files touched (Phase 10 deviation 9 CRLF
churn avoided by scoping the write to changed files only).

---

## 4. The identity model + attribution bridge

"Who owns this order" = the **Logto `sub`** (`orders.user_id`). `buyer_email` is
display/fallback only. Because the `payment.created` webhook is server-to-server
(no Logto cookie), it reads the buyer's `sub` + `square_customer_id` from the
`abandoned_carts` row keyed by `square_order_id` (written at checkout). Flow:

1. **Checkout (signed in):** read `sub/email/name` → `findOrCreateSquareCustomer`
   (best-effort) → `createPaymentLink({…, customerId})` →
   `createPendingCart({…, buyerUserId, squareCustomerId})`.
2. **`payment.created`:** idempotency (`order_log.eventId`) → `markCartCompleted`
   → notify → `orders.get` → read bridge cart → `buildOrder` → `upsertOrder`
   (idempotent on `square_order_id`).
3. **Account reads:** `/account/orders` → `getOrdersForUser(sub)`;
   `/account/orders/[id]` → `getOrderById` then **404 unless owner**.

Guest orders still record with `user_id = null` (admin/analytics completeness)
and never appear in any account.

---

## 5. Security / correctness invariants (verified)

- **IDOR guard:** `/account/orders/[id]` calls `notFound()` (404, not 403) unless
  `order.userId === currentUser.userId`. Covered by
  `tests/account/order-detail.test.tsx` — *"SECURITY: 404s when the order belongs
  to another user"* (and missing-order → 404). **This gating test passes.**
- **Idempotency:** `upsertOrder` keys on `square_order_id`; combined with the
  `order_log.eventId` guard, replayed webhooks never duplicate orders. Test
  asserts a duplicate event records nothing.
- **Best-effort customer mapping:** a Customers-API throw at checkout is caught;
  the route still returns a checkout URL with `customerId` omitted. Test covers it.
- **Order recording never throws out of the webhook:** wrapped in try/catch
  (log + continue). Test covers `orders.get` rejecting.

---

## 6. Schema changes + migration

Migration `drizzle/migrations/0012_military_puma.sql`:
- `CREATE TABLE orders (…)` + `orders_status_valid` CHECK + `orders_square_order_id_unique` + `orders_user_id_idx`.
- `customer_link`: `DROP CONSTRAINT IF EXISTS customer_link_pkey` → `email` drop-not-null → add `user_id` → `ADD CONSTRAINT customer_link_pkey PRIMARY KEY (user_id)` → add `name`.
- `abandoned_carts`: add `buyer_user_id`, `square_customer_id` (both nullable).

**Not applied locally** — no Postgres on `:5433` / no Docker CLI in the exec
environment (same as Phase 10). The migration file + the drizzle snapshot/journal
were generated and the SQL hand-verified. **Apply on deploy / in CI** against a
live DB. The `customer_link` reshape is a destructive PK change but the table is
empty + unreferenced (confirmed), so it is safe.

---

## 7. Square SDK reference (installed `square@44.0.1`)

The v44 namespaced client (`client.<resource>.<method>`), awaited directly →
response body. Confirmed signatures used:
- `client.customers.search({ query: { filter: { emailAddress: { exact } } }, limit })` → `{ customers?: Customer[] }`
- `client.customers.create({ idempotencyKey, referenceId, emailAddress, givenName, familyName })` → `{ customer?: Customer }`
- `client.customers.get({ customerId })` → `{ customer?: Customer }`
- `client.customers.update({ customerId, address })` → `{ customer?: Customer }`
- `client.orders.get({ orderId })` → `{ order?: Order }`
- Money `amount` is `bigint | null` → `Number(...)`. Address shape:
  `{ addressLine1, addressLine2?, locality, administrativeDistrictLevel1, postalCode, country }`.
Responses cast `as any` where SDK types are loose (mirrors `create-payment-link.ts`).

---

## 8. Verification state at handoff

**Automated code gate (local, via `corepack pnpm`):**
- **Lint:** `biome check` (the `pnpm lint` script) reports the known CRLF
  `lineEnding` noise on pre-existing files (Phase 10 deviation 9). **All 31
  Phase-11 changed files pass `biome check` cleanly** (verified by scoping the
  check to the changed file set; committed blobs are LF; CI Linux lint passes).
- **Typecheck:** `pnpm typecheck` (tsc --noEmit) → **clean (exit 0)**.
- **Unit tests:** `pnpm test` → **342 passed** (65 files) — up from 299 (+43:
  4 get-current-user + 3 customer-link + 8 square-customers + 5 build-order +
  4 orders-queries + 4 webhook + 3 checkout-customer + 2 account-page +
  2 orders-list + 3 order-detail + 3 address-action + 2 post-login-destination).
- **Integration tests:** **NOT run** (no Postgres/Docker locally). The suite is
  structurally unchanged except `customer-link.integration.test.ts` was updated to
  the re-keyed shape. **Do not claim integration green until run** against a live
  DB / in CI. Baseline to confirm: 75.
- **Canary:** `grep -rn "goaffpro\|GoAffPro" src/ tests/` → **0**.
- **Production build, unreachable DB:**
  `DATABASE_URL=postgresql://x:x@unreachable-host:5432/db corepack pnpm exec next build`
  → **✓ Compiled successfully**, **✓ Generating static pages (36/36)**,
  **0 `ENOTFOUND`/`ECONNREFUSED`**. The `(account)` pages + `callback` route
  compiled (chunks present under `.next/server/app/(account)/…`), and no
  prerendered `.html` exists for the account pages (confirming they're dynamic).
  The command **exits 1 only** on the Windows-specific `EPERM: symlink` in the
  `output: standalone` copy step (Phase 10 quirk) — **after** a successful
  compile + page generation. **On the Linux Docker builder Coolify uses, this
  exits 0.**

**Deploy:** `./scripts/deploy.sh` run at close of phase (push `main` + forced
Coolify deploy of the tagged commit).

---

## 9. Operator-pending items (DO NOT BLOCK — documented for follow-up)

1. **Enable Logto self-registration.** Real customers need to register; today only
   the admin user exists. Logto dashboard → Sign-in experience → enable sign-up.
   Dashboard-only, no code.
2. **Apply migration `0012` + run the integration suite against a live DB.** Bring
   up Postgres (`docker compose --profile local up -d postgres`),
   `corepack pnpm db:push` (or migrate), then `corepack pnpm test:integration`
   (confirm 75 + the updated customer-link test pass).
3. **Sandbox verification checklist (spec §9):** sign in as a non-admin Logto user
   → land on `/account`; complete a sandbox checkout → confirm a Square Customer
   is created (Square dashboard) and an `orders` row appears; open `/account/orders`
   + a detail page; save an address and confirm it persists on the Square Customer.
4. **No new env vars or secrets** — Square is already configured (sandbox). Nothing
   to add in Coolify for this phase.
5. **Carried from Phase 10 (still pending):** add the `uploads-data` Coolify volume;
   set Resend env + wire the abandoned-cart cron; clear stale sandbox avatar URLs.
   **Carried from Phase 9:** enable Coolify Auto-Deploy; `/api/health` 200 check;
   admin mobile dark-mode visual check.

---

## 10. Plan deviations

1. **`customer_link` was referenced after all (1 file).** The spec asserted the
   table was "empty and unreferenced anywhere in code." It was *unreferenced in
   src/* but `tests/integration/customer-link.integration.test.ts` exercised the
   old `email`-PK shape. The reshape necessarily broke it (typecheck caught it),
   so the test was rewritten to the new `user_id`-keyed shape (email/name nullable,
   cleanup keyed on `user_id`). This is the only change beyond the plan's Task 1
   file list. Table *data* is still empty, so the destructive PK change is safe.

2. **Migration `0012` hand-corrected.** `pnpm db:generate` emitted a commented-out
   "drop the old PK manually" placeholder (drizzle-kit can't auto-detect the PK
   name) and an `ADD COLUMN … PRIMARY KEY` that Postgres rejects while the old PK
   exists. Rewrote the SQL to explicitly drop `customer_link_pkey` and re-add it on
   `user_id`. Final schema state matches the generated snapshot.

3. **`account-page.test.tsx` partial `react-dom` mock (test-only).** `useFormState`
   is `undefined` under the jsdom/SSR transform (same as Phase 9 deviation 3 for
   the settings page). Added the partial mock so the landing page (which now renders
   `<AddressForm>`) renders. Production contract unchanged.

4. **Orders-list link `aria-label`.** The per-row link's visible "View →" affordance
   is `aria-hidden`, leaving the link without an accessible name. Added an
   `aria-label` ("View order from <date>") so it's reachable/announced — also what
   the list test asserts against.

5. **Build run as `corepack pnpm exec next build`** (after `corepack pnpm
   content:build`) to bypass the `prebuild` lifecycle's bare-`pnpm` call — same as
   Phase 10 deviation 1. No code change.

6. **Lint via scoped `biome check`** rather than repo-wide `pnpm lint` (which is
   red on pre-existing CRLF files locally — Phase 10 deviation 9). The Phase 11
   changed-file set is verified clean; committed blobs are LF; CI passes.

---

## 11. What's deferred / Phase 12+ candidates

**Explicitly out of scope this phase (from the spec):**
- **Profile name/email editing** (owned by Logto — would need a Management API call).
- **Wishlist UI** (`wishlists` table exists, no UI).
- **Reviews surfacing** in the account.
- **Refund status reflection on orders** — the `orders.status` enum already has
  `refunded`/`partially_refunded`, but no writer sets them yet; wire from a
  `refund.created`/`refund.updated` webhook handler (the webhook already subscribes
  to `refund.created`).
- **Guest order lookup by email** (no `user_id` → not in any account today).
- **Square production cutover** (`SQUARE_ENV=production` + prod token/domain/DB/
  Logto callback/webhook sub).

**Carried forward (unchanged):** refund notifications fan-out; monitoring/alerting,
CI/CD, automated DB backups; `/shop` pagination/search/filtering; the `batchGet`
1000-object image cap; shared `ProductCard` for category/artist grids; the Phase 10
operator items (uploads volume, Resend cron).

**New notes introduced by Phase 11:**
- `orders.raw` stores the full Square order snapshot (audit/debug) — useful for a
  future admin order viewer or refund reconciliation.
- `customer_link` is now keyed on the Logto sub and cached at checkout; a TTL/
  refresh policy isn't enforced (the cached link is reused indefinitely). Revisit
  if a buyer's Square customer is ever deleted/merged.
- The address form has no server-side format/zip validation beyond
  "required fields present" — Square's hosted checkout still collects + validates
  the real shipping address at pay time (design decision, no standalone Square
  address-validation API).

---

## 12. Where credentials live

Phase 11 **sourced no new secrets and added zero env vars.** Locations unchanged
from Phase 10:
- **Local dev:** `.env.local` (gitignored). `scripts/deploy.sh` greps
  `COOLIFY_API_TOKEN_ANIMANIACS_TEAM` from it at runtime.
- **Deployed (dev):** Coolify app `h4400cg04wg8www84ggks4sg` runtime env.
- **Coolify API:** base `https://empower.relentnet.com`, app UUID
  `h4400cg04wg8www84ggks4sg`.
- **Leftover `GOAFFPRO_*` / `SQUARE_PROD_ACCESS_TOKEN`** in `.env.local` are
  expected + unused; goaffpro canary stays 0.

---

## 13. How to verify this hand-off

```sh
git fetch --tags
git rev-parse phase-11-accounts
git checkout main && git pull

corepack pnpm install
corepack pnpm content:build                      # gitignored manifest
corepack pnpm typecheck                          # clean
corepack pnpm test                               # 342 passed
grep -rn "goaffpro\|GoAffPro" src/ tests/        # 0

# Build proves the account/callback routes compile + no build-time DB read
DATABASE_URL=postgresql://x:x@unreachable-host:5432/db corepack pnpm exec next build
#   → "Compiled successfully", "Generating static pages (36/36)", 0 ENOTFOUND
#     (Linux exits 0; Windows stops at the standalone symlink step — EPERM)

# Operator-assisted (live, after deploy + Logto sign-up enabled) — §9:
#   sign in as non-admin → /account; sandbox checkout → Square Customer + orders row;
#   /account/orders + detail; save address → persists on the Square Customer.
```
