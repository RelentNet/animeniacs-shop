# Phase 15 — Logto → better-auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`, TDD. Steps use checkbox (`- [ ]`). Write the failing test first where it applies, confirm fail, implement, confirm pass, commit per task. This is a large migration — go task-by-task and keep the suite green between tasks.

**Design spec:** `docs/superpowers/specs/2026-06-11-phase-15-better-auth-migration-design.md` (read first — §2 the `getCurrentUser` seam, §4 schema + §4.4 data reconciliation, §8 admin provisioning, §9 invariants are load-bearing).

**Goal:** Replace Logto with better-auth (email+password, Postgres); real `user` table + FK from orders/reviews/wishlists/abandoned-carts; `squareCustomerId`+`role` on the user (drop `customer_link`); saved-addresses; guest-order claiming. Keep `SQUARE_ENV=sandbox`.

**Stack:** Next.js 14 App Router, Drizzle/Postgres, **better-auth**, Square, Resend (password reset). Customer pages = Tailwind; admin = inline-style idiom.

---

## Baseline verification
- [ ] `git status` clean on `main`, HEAD `0e0e388` or later. `pnpm test` green; `pnpm typecheck` clean.
- [ ] `grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0.
- [ ] Confirm better-auth's current Next.js + drizzle(pg) setup from its docs before wiring (handler path, `nextCookies`/`toNextJsHandler`, `additionalFields`, CLI generate).

---

## Task 1: Install + scaffold better-auth (tables, config, API route, env)
**Files:** `package.json`, `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/app/api/auth/[...all]/route.ts`, `src/lib/db/schema.ts`, `src/lib/env.ts`, migration.
- [ ] `pnpm add better-auth`.
- [ ] `src/lib/auth.ts` — `betterAuth({...})` per spec §3 (drizzleAdapter pg, emailAndPassword enabled + `requireEmailVerification:false`, `user.additionalFields` `squareCustomerId`+`role`, `nextCookies()` plugin, `sendResetPassword` → `src/lib/notifications/email.ts`). `secret: env.BETTER_AUTH_SECRET`, `baseURL: env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_SITE_URL`.
- [ ] `src/lib/auth-client.ts` — `createAuthClient({ baseURL })`.
- [ ] `src/app/api/auth/[...all]/route.ts` — `export const { GET, POST } = toNextJsHandler(auth)`.
- [ ] Generate the better-auth drizzle schema (`npx @better-auth/cli generate`), reconcile the `user/session/account/verification` tables (incl. `squareCustomerId`+`role` columns) into `src/lib/db/schema.ts`. `pnpm db:generate`; review the migration; `pnpm db:push` (or note + CI).
- [ ] `src/lib/env.ts` — add `BETTER_AUTH_SECRET: z.string().min(1)` (required in prod) + `BETTER_AUTH_URL: z.preprocess(emptyToUndefined, z.string().url().optional())`. (Leave Logto vars for now; removed in Task 5.) Add the vars to `.env.local` (`BETTER_AUTH_SECRET=$(openssl rand -hex 32)`) so dev works.
- [ ] `pnpm typecheck`. Commit: `feat(auth): scaffold better-auth (config, client, api route, user/session tables)`.

---

## Task 2: Re-implement `getCurrentUser` on better-auth (the seam)
**Files:** `src/lib/auth/get-current-user.ts`, `tests/auth/get-current-user.test.ts`.
- [ ] **Test first:** mock `auth.api.getSession`. Authenticated session → `{ isAuthenticated:true, userId:user.id, email, name, roles: user.role==='admin'?['admin']:[] }`; no session/throw → ANONYMOUS. **Keep the `CurrentUser` interface identical.**
- [ ] Implement: `const session = await auth.api.getSession({ headers: await headers() })`; map fields; try/catch → ANONYMOUS. `import 'server-only'`.
- [ ] Tests pass; typecheck. Commit: `feat(auth): getCurrentUser backed by better-auth session (interface unchanged)`.

---

## Task 3: Re-key user-owned tables to FK `user.id` + drop `customer_link`
**Files:** `src/lib/db/schema.ts`, migration, delete `src/lib/db/queries/customer-link.ts` + its tests.
- [ ] Schema: `orders.userId`/`reviews.userId`/`abandonedCarts.buyerUserId` → `text(...).references(() => user.id, { onDelete: 'set null' })`; `wishlists.userId` → `references(() => user.id, { onDelete: 'cascade' })`. Remove the `customerLink` table + types.
- [ ] `pnpm db:generate`. **Hand-reconcile the migration (spec §4.4):** before adding FK constraints, `UPDATE orders SET user_id=NULL; UPDATE reviews SET user_id=NULL; UPDATE abandoned_carts SET buyer_user_id=NULL; DELETE FROM wishlists;` then add the FKs + `DROP TABLE customer_link`. This clears disposable sandbox data so the FKs apply cleanly. Document it in the migration.
- [ ] Delete `customer-link.ts` queries + tests. `pnpm db:push` (or note). `pnpm typecheck`.
- [ ] Commit: `feat(db): FK orders/reviews/wishlists/abandoned_carts → user.id; drop customer_link`.

---

## Task 4: Square customer mapping onto the user
**Files:** `src/lib/square/customers.ts`, `tests/square/customers.test.ts` (rewrite).
- [ ] **Test first:** `findOrCreateSquareCustomer({ userId, email, name })` — user already has `squareCustomerId` → returns it (no API); else Square search by email → use+persist onto `user.squareCustomerId`; else create → persist. Mock the Square client + a `users` query.
- [ ] Implement reading/writing `user.squareCustomerId` (a small `getUserSquareCustomerId`/`setUserSquareCustomerId` query, or inline drizzle on the user table). Remove all `customer_link` references.
- [ ] Tests pass; typecheck. Commit: `feat(square): store squareCustomerId on the user row (drop customer_link path)`.

---

## Task 5: Sign-in/up/out pages; delete Logto
**Files:** create `src/app/sign-in/page.tsx`, `src/app/sign-up/page.tsx`, a sign-out control; delete `src/app/callback/route.ts`, `src/app/sign-in/route.ts`, `src/app/sign-out/route.ts`, `src/lib/logto.ts`; `package.json`, `src/lib/env.ts`, `compose.yml`, `.env.example`; `tests/...`.
- [ ] `sign-in/page.tsx` + `sign-up/page.tsx` — `'use client'` Tailwind forms using `authClient.signIn.email` / `authClient.signUp.email`; on success, redirect (admin→`/admin`, else→`/account`) and call `claimGuestOrders` (Task 9). Show inline errors.
- [ ] Sign-out: a client control calling `authClient.signOut()` then `router.push('/')` — wire into the account nav + header where the old `/sign-out` link was.
- [ ] **Delete Logto:** remove `callback`/`sign-in`/`sign-out` route handlers, `src/lib/logto.ts`; `pnpm remove @logto/next`; remove `LOGTO_*` from `env.ts`, `compose.yml`, `.env.example`; add `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` to `compose.yml` + `.env.example`.
- [ ] `grep -rn "logto\|Logto" src/` → **0** (fix any stragglers). `pnpm typecheck`.
- [ ] Commit: `feat(auth): sign-in/up/out pages; remove Logto entirely`.

---

## Task 6: Auth gates + admin provisioning
**Files:** `src/app/(admin)/layout.tsx`, `src/app/(account)/layout.tsx`, `src/app/callback`-redirect logic now in sign-in, `scripts/auth/grant-admin.ts`, `package.json`, tests.
- [ ] `(admin)/layout.tsx` — replace the `getLogtoContext` + `isLogtoConfigured` block with `getCurrentUser()`: unauthenticated → `redirect('/sign-in')`; authenticated but `!roles.includes('admin')` → 403 message; if NO admin exists at all, show a "no admin provisioned yet — run `pnpm auth:grant-admin`" hint instead of a hard lock. Keep the admin-shell styling.
- [ ] `(account)/layout.tsx` — already uses `getCurrentUser()`; verify it redirects to `/sign-in`.
- [ ] `scripts/auth/grant-admin.ts` (`tsx --env-file=.env.local`) — sets `role='admin'` for an email arg. Add `"auth:grant-admin": "tsx --env-file=.env.local scripts/auth/grant-admin.ts"` to package.json.
- [ ] **Test first** (gate behavior): admin role renders children; non-admin → 403; unauthenticated → redirect. Update mocks to `getCurrentUser`.
- [ ] Tests pass; typecheck. Commit: `feat(auth): role-gated admin/account gates on better-auth + grant-admin script`.

---

## Task 7: Saved addresses (table already added in Task 3? — add here) + queries + account UI
**Files:** `src/lib/db/schema.ts` (saved_addresses if not yet), migration, `src/lib/db/queries/addresses.ts`, `src/app/(account)/account/_components/*` (replace AddressForm), `tests/...`.
- [ ] Add `saved_addresses` table (spec §4.2) + migration if not already present.
- [ ] **Test first:** `getAddresses(userId)`, `saveAddress(userId, {label,address,isDefault})` (setting default unsets others — one-default invariant, in a transaction), `deleteAddress(userId,id)` (scoped to owner), `getDefaultAddress(userId)`.
- [ ] Implement the queries. Replace Phase 11's `AddressForm` (single Square-customer address) with a saved-addresses UI on `/account`: list + add form + delete + set-default (Tailwind, `useFormState` ok). Remove the Square-customer address read/write from the account page.
- [ ] Tests pass; typecheck. Commit: `feat(account): saved-addresses table, queries, and account UI`.

---

## Task 8: Checkout uses the session + default-address prefill
**Files:** `src/app/api/checkout/route.ts`, `src/lib/checkout/*` if prefill surfaces there, `tests/api/checkout*.test.ts`.
- [ ] **Test first:** the route reads identity from the better-auth session (mock `getCurrentUser`/`getSession`): `buyerUserId = user.id`, email, name; best-effort `findOrCreateSquareCustomer`; guest (no session) → nulls, still returns a checkout URL.
- [ ] Replace the `getLogtoContext` block ([checkout/route.ts:54-70](../../../src/app/api/checkout/route.ts)) with `getCurrentUser()`. (Optional: surface `getDefaultAddress` for prefill if the checkout UI consumes it — otherwise leave for the checkout UI.)
- [ ] Tests pass; typecheck. Commit: `feat(checkout): identity from better-auth session`.

---

## Task 9: Guest-order claiming
**Files:** `src/lib/db/queries/orders.ts` (or a new `claim` action), `src/app/(account)/.../claim`, `tests/...`.
- [ ] **Test first:** `claimGuestOrders(userId, email)` → `update orders set userId=$userId where lower(buyerEmail)=lower($email) and userId is null`; never touches rows with a non-null userId; returns count.
- [ ] Implement + call it post-sign-in (from the sign-in success handler) and/or once on `/account` load (idempotent).
- [ ] Tests pass; typecheck. Commit: `feat(orders): claim guest orders by verified email on login`.

---

## Task 10: Sweep remaining Logto-mock tests + final verification + handoff + tag + deploy
- [ ] Update EVERY remaining test that mocked `@logto/next/server-actions` / imported `logtoConfig` to mock `getCurrentUser` (or `auth.api.getSession`). `grep -rn "logto\|Logto\|getLogtoContext" src/ tests/` → **0**.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` — all green; record counts.
- [ ] `grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0.
- [ ] Production-sim build: `DATABASE_URL=postgresql://x:x@unreachable-host/db pnpm build` → compiles + 0 `ENOTFOUND` (note the Windows EPERM-symlink exit-1 quirk; Linux deploy exits 0). Confirm `/api/auth/[...all]`, `/sign-in`, `/sign-up` compiled.
- [ ] Write `docs/superpowers/specs/reference/phase-15-handoff.md` (follow `phase-14-handoff.md`): file-by-file + commits; the `getCurrentUser` seam; schema (better-auth tables + FK re-key + dropped customer_link + saved_addresses) + the §4.4 sandbox data reconciliation; admin provisioning flow; **operator-pending (spec §10: add BETTER_AUTH_SECRET, remove LOGTO_* in Coolify, configure Resend for reset, grant-admin, decommission Logto)**; deferred to Phase 16 (caching pass) + later (social logins, MFA, Square prod).
- [ ] `git tag phase-15-better-auth && ./scripts/deploy.sh`. **⚠️ Coordinate with the operator: `BETTER_AUTH_SECRET` must be set in Coolify env BEFORE/with this deploy, and `LOGTO_*` removed — otherwise auth breaks on the live dev app.**

---

## Constraints (must hold throughout)
- `SQUARE_ENV=sandbox`; goaffpro canary **0**; deploy ONLY via `./scripts/deploy.sh`.
- Keep the `getCurrentUser` `CurrentUser` interface identical so consumers don't churn.
- `(admin)` gate stays `roles.includes('admin')`; `(account)` order-detail IDOR guard stays (404 non-owner) — keep its regression test green.
- better-auth owns password hashing/sessions; `BETTER_AUTH_SECRET` required; never log secrets.
- Guest-claiming only touches `user_id IS NULL` rows matched by verified email.
- Square customer mapping stays best-effort at checkout.
- Email verification OFF this phase; password reset via Resend (no-ops if unconfigured).
- Customer pages Tailwind; admin inline-style idiom.
- `grep -rn "logto\|Logto" src/` must be **0** at the end.
