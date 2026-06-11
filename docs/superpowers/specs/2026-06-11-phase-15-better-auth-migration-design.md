# Phase 15 — Auth Migration: Logto → better-auth (+ account-model upgrade) — Design Spec

**Date:** 2026-06-11
**Status:** Designed. Awaiting plan execution.
**Predecessor:** Phase 14 (`phase-14-shop-discovery`, HEAD `0e0e388` + the avatar/upload/tagging fixes).

---

## 1. Goal

Replace the external **Logto** OIDC service with **better-auth** (in-app, Postgres-backed),
and upgrade the account data model to a first-class user table with referential integrity —
adopting the better patterns from the sibling `addictivereefkeeping.com` build:

1. **better-auth** (email + password) running inside the Next.js app; sessions + users in
   our own Postgres. **Delete the Logto deployment dependency** and all its OIDC/callback/
   reverse-proxy complexity.
2. A real **`user` table** with **foreign keys** from orders/reviews/wishlists/abandoned-carts →
   `user.id`. `squareCustomerId` and `role` live on the user (drops the `customer_link` table).
3. **Saved addresses** (multiple, labeled, default, checkout prefill) replacing Phase 11's
   single address-on-the-Square-customer.
4. **Guest-order claiming** — orders placed as a guest attach to the account on login by
   verified email.

**Decisions (brainstorm 2026-06-11):** split from the caching pass (that's **Phase 16**);
**email + password only** (social later); **adopt saved-addresses**. Defaults: admin gating =
a `role` field + check; guest-claiming = adopt; **email verification OFF** initially (signup
isn't blocked on email infra); **password reset via Resend** (operator must configure Resend).
`squareCustomerId` moves onto the user row.

Out of scope: social/OAuth logins, MFA, the rendering/caching pass (Phase 16), Square
production cutover. **`SQUARE_ENV=sandbox` stays.**

---

## 2. Migration strategy — minimize blast radius via the `getCurrentUser` seam

18 files touch auth, but ~13 are **consumers** that call `getCurrentUser()`
([get-current-user.ts](../../../src/lib/auth/get-current-user.ts)). **Keep that function's
`CurrentUser` interface byte-identical** and only swap its internals (Logto `getLogtoContext`
→ better-auth `auth.api.getSession`). Then reviews/wishlist/account-pages/checkout barely change.

`CurrentUser` stays `{ isAuthenticated, userId, email, name, roles }` where:
- `userId` = better-auth `user.id` (was the Logto `sub`).
- `roles` = `user.role === 'admin' ? ['admin'] : []` — so the `(admin)` gate's
  `roles.includes('admin')` works unchanged.

---

## 3. Auth wiring (better-auth + Next.js App Router + Postgres)

- `src/lib/auth.ts` — `betterAuth({ database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: { enabled: true, requireEmailVerification: false, sendResetPassword },
  user: { additionalFields: { squareCustomerId: {type:'string',required:false,input:false},
  role: {type:'string',required:false,input:false,defaultValue:'user'} } },
  plugins: [nextCookies()] })`. `baseURL` from `BETTER_AUTH_URL ?? NEXT_PUBLIC_SITE_URL`,
  `secret` from `BETTER_AUTH_SECRET`. `sendResetPassword` → reuse `src/lib/notifications/email.ts`
  (Resend; no-ops if unconfigured).
- `src/lib/auth-client.ts` — `createAuthClient({ baseURL })` for client components.
- `src/app/api/auth/[...all]/route.ts` — `toNextJsHandler(auth)` (GET+POST).
- `getCurrentUser()` — re-implemented on `auth.api.getSession({ headers: await headers() })`.
- **Routes replaced:** delete `src/app/callback/route.ts`, `src/app/sign-in/route.ts`,
  `src/app/sign-out/route.ts`; add `src/app/sign-in/page.tsx` + `src/app/sign-up/page.tsx`
  (client forms via `authClient.signIn.email` / `signUp.email`), and a sign-out control
  (`authClient.signOut()`).
- **Delete Logto:** `src/lib/logto.ts`, the `@logto/next` dependency, `LOGTO_*` from
  `env.ts` / `compose.yml` / `.env.example`. Add `BETTER_AUTH_SECRET` (required) +
  `BETTER_AUTH_URL` (optional) to `env.ts` / `compose.yml` / `.env.example`.

---

## 4. Schema changes (Drizzle → `pnpm db:generate`)

### 4.1 better-auth tables (generate via `npx @better-auth/cli generate`, then reconcile into `schema.ts`)
- `user` (id text pk, name, email unique, emailVerified bool, image, createdAt, updatedAt)
  **+ additionalFields columns:** `squareCustomerId text`, `role text default 'user'`.
- `session` (id, userId → user.id, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt).
- `account` (id, userId → user.id, accountId, providerId, password hash, …).
- `verification` (id, identifier, value, expiresAt, …).

### 4.2 NEW `saved_addresses`
`id` (uuid pk) · `userId` → `user.id` (cascade) · `label text` · `address jsonb`
(`{firstName,lastName,line1,line2?,city,state,zip,phone?}`) · `isDefault bool default false` ·
`createdAt`. Index on `userId`.

### 4.3 Re-key existing user-owned tables to FK `user.id`
- `orders.userId` → FK `user.id` (`on delete set null`); nullable (guests).
- `reviews.userId` → FK `user.id` (`on delete set null`); nullable.
- `abandoned_carts.buyerUserId` → FK `user.id` (`on delete set null`); nullable.
- `wishlists.userId` → FK `user.id` (`on delete cascade`) — part of the composite PK.
- **Drop `customer_link`** (squareCustomerId now lives on `user`). Remove its queries.

### 4.4 Data reconciliation (sandbox — no real users)
Existing user-keyed rows hold **Logto `sub` strings** that won't match new `user.id`s. Before
adding the FK constraints: set the nullable FKs (`orders.userId`, `reviews.userId`,
`abandoned_carts.buyerUserId`) to **NULL**, and **DELETE** existing `wishlists` rows (userId is
in the PK, can't null). This is **sandbox test data — disposable**; document it. New rows get
proper FKs going forward.

---

## 5. Square customer mapping (now on the user)

`src/lib/square/customers.ts` — `findOrCreateSquareCustomer({ userId, email, name })` reads/writes
`user.squareCustomerId` (instead of `customer_link`): if the user already has a `squareCustomerId`
return it; else search Square by email → create → persist onto the user row. Delete
`src/lib/db/queries/customer-link.ts`. The checkout route passes `user.id`.

---

## 6. Account UI changes

- `getCurrentUser()` swap means account/order/review/wishlist pages keep working (same interface).
- **Sign-out** control: replace the `/sign-out` route link with a button calling
  `authClient.signOut()` then redirecting home.
- **Saved addresses:** replace Phase 11's `AddressForm` (single address on Square customer) with
  a saved-addresses UI on `/account` — list + add + delete + set-default — backed by new queries
  (`getAddresses`, `saveAddress`, `deleteAddress`, `getDefaultAddress`). Checkout reads the default
  for prefill.
- **Callback redirect** behavior (admin→/admin, others→/account) is now handled at sign-in: the
  sign-in page redirects based on `getCurrentUser().roles`.

---

## 7. Guest-order claiming

On successful sign-in, claim guest orders: `update orders set userId = <user.id> where
lower(buyerEmail) = lower(<user.email>) and userId is null`. Implement as a server action
(`claimGuestOrders`) invoked post-sign-in (from the sign-in success handler or the `/account`
loader), mirroring the sibling build's `$afterLogin`. Idempotent (only claims null-userId rows).

---

## 8. Admin provisioning (must not lock out the operator)

There is **one** admin today (Logto user `phoenix`). better-auth has no admin until one is created.
Provide `scripts/auth/grant-admin.ts` (`tsx --env-file=.env.local`) that sets `role='admin'` for a
given email. **Operator flow:** sign up via `/sign-up` with the admin email → run
`pnpm auth:grant-admin <email>` → `/admin` unlocks. Document clearly; the `(admin)` gate must show a
helpful "no admin yet" message rather than a hard lock if no admin exists.

---

## 9. Security / correctness invariants

- **better-auth owns password hashing + sessions** (httpOnly secure cookies). Never store plaintext.
- **The `(admin)` gate stays role-gated** via `getCurrentUser().roles.includes('admin')` — unchanged
  contract, new source.
- **The `(account)` IDOR + ownership guards stay** (e.g. `/account/orders/[id]` 404 for non-owner) —
  they key off `getCurrentUser().userId`, which is now `user.id`.
- **`BETTER_AUTH_SECRET` is required** and must be a strong random value (`openssl rand -hex 32`);
  the app must fail fast (env schema) if missing in production.
- **Guest-claiming matches on verified email + null userId only** — never reassigns an already-owned
  order.
- Square customer mapping stays **best-effort** at checkout (never blocks payment).
- `SQUARE_ENV=sandbox`; goaffpro canary **0**; deploy via `./scripts/deploy.sh` only.

---

## 10. Operator-pending (post-deploy)

1. **Add Coolify env:** `BETTER_AUTH_SECRET` (generate `openssl rand -hex 32`), optionally
   `BETTER_AUTH_URL` (= the site URL). **Remove** the `LOGTO_*` vars. Redeploy.
2. **Configure Resend** (`RESEND_API_KEY` + `RESEND_FROM_EMAIL`, verified sender) so password-reset
   emails send (still the carried-over Phase 10 item; signup/login work without it since email
   verification is off).
3. **Re-provision admin:** sign up with the admin email → `pnpm auth:grant-admin <email>`.
4. **Decommission Logto** once verified (the `auth.animeniacs.shop` deployment is no longer used by
   this app).
5. **Sandbox verify:** sign up → land on `/account`; sign out/in; place a guest order then sign up
   with that email → order appears; add/default/delete saved addresses; checkout prefills the default;
   `/admin` gated to the admin only.

---

## 11. Test strategy (TDD)

Replace Logto mocks with better-auth/`getCurrentUser` mocks throughout. Cover:
- `getCurrentUser` — authenticated (maps id/email/name/role→roles) vs anonymous vs no-session.
- `auth.ts` config smoke (additionalFields present; adapter wired).
- `(admin)` gate — admin role passes, non-admin 403, unauthenticated → `/sign-in`.
- `(account)` gate — unauthenticated → `/sign-in`; the order-detail IDOR regression stays green.
- saved-addresses queries — get/save/delete/default (one-default invariant).
- guest-claiming — claims matching null-userId orders by email; never touches owned orders.
- square customers — `findOrCreateSquareCustomer` reads/writes `user.squareCustomerId` (cached vs
  search vs create).
- checkout route — captures `user.id`/email/name from the session; best-effort customer mapping.
- Update every existing test that mocked `getLogtoContext` / imported `logtoConfig`.

Gates (match prior phases): `pnpm lint` clean · `pnpm typecheck` clean · `pnpm test`
(Logto tests replaced; expect net new auth/address/claiming tests) · `pnpm test:integration`
(≥ baseline; new FK/user tables) · `grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0 ·
`grep -rn "logto\|Logto" src/` → **0** (Logto fully removed) ·
`DATABASE_URL=postgresql://x:x@unreachable-host/db pnpm build` → compiles + 0 `ENOTFOUND`.
