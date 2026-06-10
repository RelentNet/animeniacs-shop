# Phase 10 → Phase 11 hand-off

**Status:** Phase 10 **code-complete**. Three independent tracks shipped: the
cart-clear-on-checkout bug fix (`CartClearer`), durable upload storage (a named
Docker volume that fixes the live EACCES avatar crash), and abandoned-cart
recovery emails via Resend (email sender + queries + buyer-email capture +
secured cron route + env wiring). All automated **code** gates green
(lint / typecheck / unit / canary). Tag `phase-10-cart-emails-storage` applied
at the final commit. Deploy triggered via `./scripts/deploy.sh`.

**Date:** 2026-06-10

> **Read me first, master orchestrator:** none of the three tracks is live until
> an operator completes the §7 manual steps. The cart-clear fix and the
> upload-path code are fully active on deploy, BUT durable uploads require the
> operator to **add the `uploads-data` volume in the Coolify dashboard**
> (without it, the Dockerfile still creates + chowns the dir, so avatar upload
> stops crashing with EACCES — it just won't persist across rebuilds). The
> abandoned-cart emails are **inert** until the operator (a) sets `RESEND_API_KEY`,
> `RESEND_FROM_EMAIL`, `CRON_SECRET` in Coolify and (b) wires an external cron to
> POST `/api/cron/abandoned-carts` with the `x-cron-secret` header. The sender
> **silently no-ops** when Resend env is unset, so the cron route is safe to
> trigger before Resend is configured. `SQUARE_ENV` stays `sandbox`; no prod
> cutover. goaffpro canary stays 0. Operator-pending items are in §7 — **do not
> block on them.**

---

## 1. TL;DR

Phase 10 added:

- **`CartClearer`** (`src/components/cart/CartClearer.tsx`) — an invisible
  `'use client'` component rendered on `/checkout/success`. On mount it calls the
  existing `useCart().clear()` once per `cartId`, guarded by `sessionStorage`
  (`clearedCartId`) so a bookmarked success URL with a new cart isn't wiped. The
  checkout route now appends `?cartId=${cartId}` to Square's `redirectUrl` so the
  success page can read it.
- **Durable upload storage** — `saveAvatar` now writes to
  `public/images/uploads/artists/<slug>.webp` (was `public/images/artists/`),
  backed by the new `uploads-data` named Docker volume mounted at
  `/app/public/images/uploads`. Writes now degrade to an `AvatarValidationError`
  (form error) on `EACCES`/`EROFS`/`ENOENT` instead of a 500. The false
  "Coolify preserves writes under public/" comment + "Locked Decision #3" are
  corrected.
- **Abandoned-cart recovery emails** — `resend` npm package (net-new);
  `sendAbandonedCartEmail` (`src/lib/notifications/email.ts`); two new query
  functions (`getCartsForReminder`, `markReminderSent`); buyer-email capture
  from Logto claims at checkout; and a secured `POST /api/cron/abandoned-carts`
  sweep that sends one email per eligible cart and stamps it abandoned.

**Schema:** no changes — `abandoned_carts.buyer_email` and `reminder_sent_at`
already existed. **Env:** +3 new vars (`RESEND_FROM_EMAIL`, `CRON_SECRET`,
`ABANDONED_CART_THRESHOLD_MINUTES`); `RESEND_API_KEY` already existed in
`.env.example`. **Tests:** +19 unit (280 → **299**): 4 cart-clearer + 4
avatar-upload + 3 email + 2 query + 2 buyer-email + 4 cron. Integration
**unchanged at 75** (no integration tests added/modified).

---

## 2. Required reading order

1. **This doc** (`phase-10-handoff.md`).
2. **`phase-09-handoff.md`** — promo bar + `/admin/settings` + `scripts/deploy.sh`,
   and the **`force-dynamic` post-mortem** (§11 there) — still in force.
3. **`phase-08-handoff.md`** — `/shop` listing, IP-leak invariant.
4. **`docs/operations/coolify-setup.md`** — deploy runbook.
5. **Phase 10 plan + spec**:
   `docs/superpowers/plans/2026-06-09-phase-10-cart-emails-storage.md` +
   `docs/superpowers/specs/2026-06-09-phase-10-cart-emails-storage-design.md`.

---

## 3. What Phase 10 shipped (file-by-file)

**Track A — cart-clear bug (Task 1, commit `5742299`):**

| File | Change |
|---|---|
| `src/components/cart/CartClearer.tsx` | NEW — `'use client'`; on mount clears the cart once per `cartId` (sessionStorage `clearedCartId` guard); renders `null`. |
| `src/app/api/checkout/route.ts` | MODIFIED — `redirectUrl` now `…/checkout/success?cartId=${cartId}`. (Also Task 5; see below.) |
| `src/app/checkout/success/page.tsx` | MODIFIED — `PageProps.searchParams` gains `cartId`; `<CartClearer cartId={cartId} />` rendered in all three return branches (no-orderId, no-order, full-order). |
| `tests/public/cart-clearer.test.tsx` | NEW — 4 unit tests (clears on mount; idempotent on re-render; no-op when cartId absent; re-clears for a new cartId). |
| `tests/public/checkout-success-page.test.tsx` | MODIFIED (test-only) — stubs `CartClearer` to `null` (it needs a `CartProvider`); covered by its own unit test. |

**Track C — durable upload storage (Task 2, commit `ed952a8`):**

| File | Change |
|---|---|
| `src/lib/images/upload.ts` | MODIFIED — `AVATAR_DIR_REL` → `public/images/uploads/artists`; returns `/images/uploads/artists/<slug>.webp`; `try/catch` around `writeFile` re-throwing `EACCES`/`EROFS`/`ENOENT` as `AvatarValidationError`; corrected the false header comment + Decision #3. |
| `Dockerfile` | MODIFIED — runner stage: `RUN mkdir -p /app/public/images/uploads && chown -R nextjs:nodejs …` before `USER nextjs`. |
| `compose.yml` | MODIFIED — `app.volumes: [uploads-data:/app/public/images/uploads]` + top-level `volumes: uploads-data:`. (Also env vars; see Task 7.) |
| `public/images/uploads/artists/.gitkeep` | NEW — keeps the mount point in the image. |
| `tests/admin/avatar-upload.test.ts` | NEW — 4 unit tests (URL under `/images/uploads/artists/`; writeFile path; empty-file → `AvatarValidationError`; EACCES → `AvatarValidationError`). Mocks `node:fs/promises` (partial) + `sharp`. |

**Track B — abandoned-cart emails (Tasks 3–7):**

| File | Change | Commit |
|---|---|---|
| `package.json` / `pnpm-lock.yaml` | `resend@6.12.4` added to dependencies. | `d655f0a` |
| `src/lib/notifications/email.ts` | NEW — `sendAbandonedCartEmail({to, cartSnapshot, shopUrl})` + `CartSnapshot` type. Reads `RESEND_API_KEY`/`RESEND_FROM_EMAIL` from `process.env`; **silently no-ops** (warns + returns) when either is unset. Plain-text body, subject "You left something in your cart", link to `${shopUrl}/shop`. | `d655f0a` |
| `tests/notifications/email.test.ts` | NEW — 3 unit tests (Resend called with correct to/subject/link; no-op when API key absent; no-op when from absent). | `d655f0a` |
| `src/lib/db/queries/abandoned-carts.ts` | MODIFIED — `getCartsForReminder(thresholdMinutes)` (status≠completed/abandoned, `buyer_email` not null, older than threshold, `reminder_sent_at` null) + `markReminderSent(cartId)` (sets `status='abandoned'`, `reminder_sent_at=now`, `updated_at=now`). | `cf89f78` |
| `tests/db/abandoned-carts.test.ts` | NEW — 2 unit tests (mocked db client). | `cf89f78` |
| `src/app/api/checkout/route.ts` | MODIFIED — captures `getLogtoContext(logtoConfig).claims.email` into `buyerEmail` (try/catch → `null` for guests). | `9bf347a` |
| `tests/api/checkout-buyer-email.test.ts` | NEW — 2 unit tests (signed-in → email; anon → null). | `9bf347a` |
| `tests/api/checkout.test.ts` | MODIFIED (test-only) — mocks `@logto/next/server-actions` as "no session" so the new import resolves and `buyerEmail` stays null. | `9bf347a` |
| `src/app/api/cron/abandoned-carts/route.ts` | NEW — `POST`; 401 unless `x-cron-secret === CRON_SECRET`; sweeps `getCartsForReminder` → per cart `sendAbandonedCartEmail` then `markReminderSent`; per-cart failures logged + skipped; returns `{processed}` (+ `errors` when any). | `21a9225` |
| `tests/api/cron-abandoned-carts.test.ts` | NEW — 4 unit tests (401 wrong secret; 401 no header; processes 2 carts; processed:0). | `21a9225` |
| `compose.yml` / `.env.example` | MODIFIED — `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CRON_SECRET`, `ABANDONED_CART_THRESHOLD_MINUTES` passthrough + docs. | `c654c8c` |

**Cleanup:** `style(phase-10): apply biome formatting to Phase 10 files`
(`82f9941`) — line-wrapping fixes + restored `package.json`'s single-line
`onlyBuiltDependencies` array (`pnpm add` had expanded it).

---

## 4. The `?cartId=` redirect change

Square appends its own `?orderId=<square-id>` to the redirect URL but does **not**
forward custom params, so the checkout route now builds
`…/checkout/success?cartId=${cartId}`. The buyer lands on
`…/checkout/success?cartId=<uuid>&orderId=<square-id>` — both params present.
`CheckoutSuccessPage` reads `searchParams.cartId` and passes it to `CartClearer`,
which clears the cart exactly once per `cartId`.

---

## 5. Plan deviations

1. **Build tooling: `corepack pnpm` (pnpm not on PATH).** This machine has no
   global `pnpm`; corepack 0.35.0 provides it. All gates were run via
   `corepack pnpm …`. The repo's `prebuild` lifecycle (`pnpm content:build`)
   calls bare `pnpm`, so the unreachable-DB build was run as
   `corepack pnpm content:build` then `corepack pnpm exec next build` to bypass
   the nested lifecycle. No code change.

2. **Fresh-clone codegen + sharp build.** A fresh `node_modules` needed
   `corepack pnpm content:build` (generates the gitignored
   `src/lib/generated/content-manifest.json`) before unit tests pass; without it
   `tests/content.test.ts` + `tests/pages/static-pages.test.ts` fail to resolve
   the manifest (baseline then = 280). Standard, not a regression.

3. **Task 4 test location.** The plan said "extend
   `tests/db/abandoned-carts.test.ts`", but only
   `tests/integration/abandoned-carts.integration.test.ts` existed. Created a NEW
   unit file `tests/db/abandoned-carts.test.ts` with a mocked db client (matches
   the plan's `mockDb` intent and keeps the new functions in the unit suite).

4. **Avatar-upload test harness adaptations (test-only).** The plan's
   `tests/admin/avatar-upload.test.ts` feeds synthetic bytes that real `sharp`
   can't transcode and uses a `File` whose `arrayBuffer()` is missing in the test
   env. Added a `sharp` mock (resize→webp→toBuffer chain), made the
   `node:fs/promises` mock partial (other consumers import its default export),
   stubbed `makeFile` to expose `size`/`type`/`arrayBuffer`, and asserted the
   write path with `path.sep` (Windows backslashes). The deliverable is unchanged.

5. **`checkout.test.ts` getLogtoContext mock (test-only).** The route's new
   `@logto/next/server-actions` import pulls `next/navigation`, which is
   unresolvable under vitest unless mocked (same pattern the admin-layout test
   uses). Added a "no session" mock so the pre-existing tests keep
   `buyerEmail: null`. Signed-in capture is covered in
   `checkout-buyer-email.test.ts`.

6. **`success` page test stub (test-only).** `CartClearer` calls `useCart()` and
   needs a `CartProvider`; the existing `checkout-success-page.test.tsx` renders
   the page without one, so `CartClearer` is stubbed to `null` there (same idea
   as its existing `next/script` stub). Cart-clear behavior is covered by
   `cart-clearer.test.tsx`.

7. **Dockerfile used `mkdir -p` + `chown` (spec §4 form), not the plan's
   `chown`-only (Task 2 step 6).** The `mkdir -p` guarantees the mount point
   exists before chown even if the COPY layout changes — strictly safer and
   matches design §4. Equivalent outcome.

8. **`getCartsForReminder` status filter.** Implemented per the plan's code as
   `status ≠ 'completed' AND ≠ 'abandoned'` (so `pending` and `in_checkout` are
   both eligible), rather than the spec prose's `status = 'pending'`. The plan's
   explicit query is the authoritative artifact; the practical effect is
   identical for normal flows (carts are `pending` until completed/abandoned).

9. **Lint required LF normalization on this Windows tree.** `core.autocrlf=true`
   with no `.gitattributes` checks files out as CRLF, which biome's
   `lineEnding: lf` formatter flags on every file. Committed blobs are LF and CI
   (Linux) lint passes; locally, `biome lint` (linter only) is exit 0 with zero
   violations. `biome check --write` was used to confirm true-green format; the
   only real content fixes were the 5 Phase 10 files in commit `82f9941`
   (line-wrapping + the `package.json` array). The incidental CRLF→LF working-tree
   churn on ~189 unrelated files was discarded (`git diff` showed them empty);
   **no out-of-scope file was committed.**

---

## 6. New env vars

| Var | Required for | Default | Used by |
|---|---|---|---|
| `RESEND_API_KEY` | email send | — (already in `.env.example`) | `src/lib/notifications/email.ts` |
| `RESEND_FROM_EMAIL` | email send | — | `src/lib/notifications/email.ts` |
| `CRON_SECRET` | cron auth | — | `POST /api/cron/abandoned-carts` |
| `ABANDONED_CART_THRESHOLD_MINUTES` | sweep window | `60` | cron sweep query |

All four are wired into `compose.yml` passthrough (`${VAR:-}` /
`${…:-60}`) and documented in `.env.example`. They must also be set in
Coolify's runtime env for app `h4400cg04wg8www84ggks4sg` (see §7).

---

## 7. Operator-pending items (DO NOT BLOCK — documented for follow-up)

1. **Coolify: add the `uploads-data` volume.** Dashboard →
   `animeniacs-shop-dev` → **Storages** → Add → Named Volume; name
   `uploads-data`, mount path `/app/public/images/uploads`. Without it, avatar
   upload no longer crashes (the dir is created + chowned in the image and is
   writable), but uploads are **not durable** across rebuilds until the volume
   is attached.

2. **Clear stale sandbox avatar URLs** (one-time, sandbox-only — NOT run by the
   execution agent; it is an operator DB mutation):
   ```sh
   db=$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-)
   psql "$db" -c "UPDATE artists SET avatar_url = NULL WHERE avatar_url LIKE '/images/artists/%';"
   ```

3. **Set up Resend + add env vars to Coolify** (`animeniacs-shop-dev` →
   Environment Variables):
   - `RESEND_API_KEY` — from the Resend dashboard.
   - `RESEND_FROM_EMAIL` — a **verified** Resend sender, e.g. `orders@animeniacs.shop`.
   - `CRON_SECRET` — `openssl rand -hex 32`.
   - `ABANDONED_CART_THRESHOLD_MINUTES` — `60` (or preference).
   Then **redeploy** (`./scripts/deploy.sh`) so the app picks them up.

4. **Wire the cron trigger** (after env vars are live). Any cron service
   (Coolify scheduled task, GitHub Actions, cron-job.org) POSTs:
   ```
   POST https://dev.animeniacs.shop/api/cron/abandoned-carts
   Header: x-cron-secret: <value of CRON_SECRET>
   ```
   Recommended every 15 minutes. Smoke test:
   ```sh
   base=$(grep '^NEXT_PUBLIC_SITE_URL=' .env.local | cut -d= -f2-)
   secret=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)
   curl -s -X POST "$base/api/cron/abandoned-carts" -H "x-cron-secret: $secret"
   # Expected: {"processed":0} (no eligible carts yet; safe even before Resend is set)
   ```

5. **Run the integration suite against a live DB.** Not runnable in the
   execution environment (no local Postgres on `:5433`, no Docker CLI). Bring up
   the local stack and confirm 75 pass:
   ```sh
   docker compose --profile local up -d postgres
   corepack pnpm test:integration   # expect 75 passed
   ```
   No integration tests were added or modified this phase, so the suite is
   structurally unchanged.

6. **Carried from Phase 9 (still pending):** enable Coolify Auto-Deploy;
   confirm `/api/health` → 200 post-deploy; admin mobile dark-mode visual check.

---

## 8. Verification state at handoff

**Automated code gate (local, via `corepack pnpm`):**
- **Lint:** `pnpm lint` (biome) → **clean, 199 files** (after LF normalization —
  see deviation 9; `biome lint` linter-only is exit 0 with zero violations).
- **Typecheck:** `pnpm typecheck` (tsc --noEmit) → **clean (exit 0)**.
- **Unit tests:** `pnpm test` → **299 passed** (51 files) — up from 280 (+19).
- **Integration tests:** **not runnable locally** (no Postgres on `:5433`, no
  Docker CLI). Suite unchanged at **75**; 0 integration tests added/modified.
- **Canary:** `grep -rn "goaffpro\|GoAffPro" src/ tests/` → **0**.
- **Production build, unreachable DB:**
  `DATABASE_URL=postgresql://x:x@unreachable-host:5432/db` →
  **Compiled successfully**, types valid, **Generating static pages (34/34)**,
  **0 `ENOTFOUND`/`ECONNREFUSED`/prerender errors** → the `force-dynamic` root
  layout reads no DB at build time (constraint satisfied). The command exits 1
  **only** on a Windows-specific `EPERM: symlink` in the `output: standalone`
  copy step (symlinks need admin/Developer Mode on Windows); this step succeeds
  on the Linux Docker builder Coolify uses (Phase 9 deployed from the same
  config). On Linux the build exits 0.

**Deploy:** `./scripts/deploy.sh` run at close of phase (push `main` + forced
Coolify deploy of the tagged commit).

---

## 9. What's deferred / Phase 11+ candidates

**Introduced/again-deferred by Phase 10:**
- **IP cover image upload UI** (`ip_nicknames.cover_image_url`) → volume subdir
  `ip-covers/` — deferred to the category-cover feature.
- **Review photo uploads** (`reviews.photo_urls`) → `review-photos/` — reviews phase.
- **Event logo uploads** (`event_logos.image_url`) → `event-logos/` — events phase.
- **Resend newsletter / marketing list** (`RESEND_AUDIENCE_ID` in `.env.example`)
  — out of scope.
- **Multi-step abandonment sequence** — explicitly YAGNI; one email per cart.
- **Order history / account UI** — Phase 11 (Logto↔Square customer mapping).

**Carried forward (unchanged):**
- **Refund notifications** — webhook already subscribes to `refund.created`; wire
  the handler to fan out Discord/SMS.
- **Production Square cutover** — `SQUARE_ENV=production` + prod token, prod
  domain, Postgres, Logto callback, webhook sub.
- **Monitoring / alerting, CI/CD, automated DB backups** — none yet; all manual.
- **`/shop` pagination / search / filtering**, the `batchGet` 1000-object image
  cap, shared `ProductCard` for category/artist grids.

**Resolved this phase:** the Phase 9 **artist-avatar EACCES crash (digest
`2137462940`)** — `saveAvatar` no longer writes to the read-only image dir; the
upload path is now the volume-backed `public/images/uploads/artists/` and EACCES
degrades to a form error. (Becomes durable once the operator attaches the volume
— §7 item 1.) Edit-artist avatar upload shares `saveAvatar`, so it's fixed too.

---

## 10. Where credentials live

Phase 10 **sourced no new secrets locally and rotated nothing.** It introduces
3 new env vars (`RESEND_FROM_EMAIL`, `CRON_SECRET`,
`ABANDONED_CART_THRESHOLD_MINUTES`) that the **operator** must set in Coolify
(§7). Locations otherwise unchanged from Phase 9:
- **Local dev:** `.env.local` (gitignored) — never committed. `scripts/deploy.sh`
  greps `COOLIFY_API_TOKEN_ANIMANIACS_TEAM` from here at runtime.
- **Deployed (dev):** Coolify app `h4400cg04wg8www84ggks4sg` runtime env.
- **Coolify API:** base `https://empower.relentnet.com`, app UUID
  `h4400cg04wg8www84ggks4sg`. Read with `grep '^KEY=' .env.local | cut -d= -f2-`.
- **Leftover `GOAFFPRO_*` / `SQUARE_PROD_ACCESS_TOKEN`** in `.env.local` are
  expected and unused; goaffpro runtime canary stays 0.

---

## 11. How to verify this hand-off

```sh
git fetch --tags
git rev-parse phase-10-cart-emails-storage
git checkout main && git pull

corepack pnpm install
corepack pnpm content:build                     # generate the gitignored manifest
corepack pnpm lint                              # clean (199 files)
corepack pnpm typecheck                         # clean
corepack pnpm test                              # 299 passed
grep -rn "goaffpro\|GoAffPro" src/ tests/       # 0

# Build proves the new cron route compiles + no build-time DB read
DATABASE_URL=postgresql://x:x@unreachable-host:5432/db corepack pnpm exec next build
#   → "Compiled successfully", "Generating static pages (34/34)", 0 ENOTFOUND
#     (on Linux this exits 0; on Windows it stops at the standalone symlink step)

# Live (after deploy + operator env) — operator-assisted (§7)
curl -s -X POST https://dev.animeniacs.shop/api/cron/abandoned-carts \
  -H "x-cron-secret: $CRON_SECRET"              # {"processed":0}
```
