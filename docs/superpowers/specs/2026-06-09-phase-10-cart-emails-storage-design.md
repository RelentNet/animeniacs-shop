# Phase 10 — Cart Fix, Abandoned-Cart Emails, Durable Upload Storage

**Date:** 2026-06-09

---

## 1. Overview

Phase 10 ships three items that all relate to the cart/checkout lifecycle and runtime storage:

1. **Cart-clear-on-checkout bug fix** — the cart is never cleared after a successful Square checkout; items reappear on return. A small `'use client'` component on the success page calls the existing `clear()` action on mount.
2. **Abandoned-cart recovery emails via Resend** — for logged-in buyers only. Email is captured at checkout creation (from Logto claims), and a secured cron route sweeps pending carts older than a configurable threshold and sends one Resend email per cart.
3. **Durable upload storage** — a named Docker volume (`uploads-data`) mounted into the app container at `/app/public/images/uploads/`. Fixes the live `EACCES` crash on artist-avatar create/edit, and establishes the pattern all future upload features (IP cover images, review photos, event logos) will use.

**Not in scope:** IP cover image upload UI, review photo uploads, event logo uploads — those features use this volume in future phases. Order history and account UI are Phase 11.

---

## 2. Section A — Cart-clear bug

### Root cause

`CartProvider` (`src/components/cart/CartProvider.tsx`) persists cart state in `localStorage` under the key `animeniacs_cart_v1` and re-hydrates it on every mount. The `CLEAR` reducer case (sets `items: []`) and the `clear()` context method exist but are **never called anywhere**. After Square redirects the buyer back to `/checkout/success`, the `CartProvider` remounts, `readPersistedCart()` reads the still-present key, and the cart reappears intact.

The success page (`src/app/checkout/success/page.tsx`) is a server component — it cannot call `clear()` or touch `localStorage` directly.

### Fix

Add a single `'use client'` component, `CartClearer`, rendered inside the success page. It:

1. Reads `cartId` from the `?cartId=` URL search param (already passed via Square's `redirectUrl`).
2. On mount (`useEffect`), checks `sessionStorage` for `clearedCartId`. If it matches the current `cartId`, it has already run and does nothing (idempotency guard).
3. Otherwise calls `useCart().clear()` (clears `localStorage` + in-memory state) and writes `clearedCartId = cartId` to `sessionStorage`.

This means a buyer bookmarking the success URL and returning later with a new cart does not wipe it. The `cartId` check is the guard.

**Files:**
- Create: `src/components/cart/CartClearer.tsx` — the `'use client'` component
- Modify: `src/app/checkout/success/page.tsx` — import and render `<CartClearer cartId={searchParams.cartId} />`

**Note:** the `redirectUrl` passed to Square's payment-link creation (`src/lib/checkout/create-payment-link.ts`) must include `?cartId=${cartId}`. Check whether this is already the case; add it if not.

### Tests
- `tests/public/cart-clearer.test.tsx`: assert `clear()` is called on mount; assert it is NOT called again on re-render with the same `cartId` (sessionStorage guard); assert it is NOT called when `cartId` is absent.

---

## 3. Section B — Abandoned-cart recovery emails

### Constraints
- **Logged-in users only.** Anonymous/guest carts have `buyer_email = null` and are silently skipped by the sweep — no UI change to checkout.
- **One email per cart ever.** `reminder_sent_at IS NULL` guards against re-sends. Sending more than once per cart is never attempted.
- **Resend** is the email provider. `resend` npm package is net-new. `RESEND_API_KEY` is already in `.env.example` (env var pre-provisioned but no code exists yet). `RESEND_FROM_EMAIL` is new.
- **`CRON_SECRET`** — new env var, a shared secret the cron trigger must supply in an `x-cron-secret` header. Without it the route returns 401.
- **`ABANDONED_CART_THRESHOLD_MINUTES`** — new env var, default `60`. The cron sweep only picks up carts older than this many minutes.

### A. Email capture at checkout

**File:** `src/app/api/checkout/route.ts`

The route currently hardcodes `buyerEmail: null` in the `createPendingCart` call. Change: call `getLogtoContext(logtoConfig)` (already imported in admin areas — same pattern). If the context returns a signed-in user with a non-empty `claims.email`, write it onto the row. If not signed in or email is absent, keep `null`.

`getLogtoContext` requires the Logto cookie, which is present on browser requests. This is a server-side route handler, so it works correctly.

```ts
// Inside POST handler, before createPendingCart:
import { getLogtoContext } from '@logto/next/server-actions'
import { logtoConfig } from '@/lib/logto'

const ctx = await getLogtoContext(logtoConfig).catch(() => null)
const buyerEmail = ctx?.claims?.email ?? null
```

No schema change — `buyer_email` column already exists and is nullable.

### B. New query functions

**File:** `src/lib/db/queries/abandoned-carts.ts` (modify existing)

Add two functions:

```ts
/**
 * Returns carts eligible for an abandonment reminder:
 *   - status = 'pending'
 *   - buyer_email IS NOT NULL
 *   - created_at < NOW() - thresholdMinutes
 *   - reminder_sent_at IS NULL
 */
export async function getCartsForReminder(
  thresholdMinutes: number
): Promise<{ cartId: string; buyerEmail: string; cartSnapshot: unknown }[]>

/**
 * Stamps reminder_sent_at = NOW() and sets status = 'abandoned'.
 */
export async function markReminderSent(cartId: string): Promise<void>
```

`markCartAbandoned` already exists (`src/lib/db/queries/abandoned-carts.ts`) but is never called. `markReminderSent` sets both `reminder_sent_at` and calls the status update in one query (or two — the execution agent may choose; both are correct).

### C. Resend email sender

**File:** `src/lib/notifications/email.ts` (new file)

Install `resend` package. Create a single exported function:

```ts
export async function sendAbandonedCartEmail(opts: {
  to: string
  cartSnapshot: { items: Array<{ catalogItemId: string; quantity: number }> }
  shopUrl: string
}): Promise<void>
```

Subject: `"You left something in your cart"`. Body: plain-text list of items from `cartSnapshot.items` (quantity × item id — no product name lookup, keep it simple; the buyer knows what they added), plus a link to `${shopUrl}/shop`. No HTML template library.

Reads `RESEND_API_KEY` and `RESEND_FROM_EMAIL` from `process.env` (not from the `env` module — Resend is optional/degradable). If either is absent, logs a warning and returns without throwing (so a misconfigured env doesn't crash the cron route).

### D. Cron route

**File:** `src/app/api/cron/abandoned-carts/route.ts` (new file)

```
POST /api/cron/abandoned-carts
Headers: x-cron-secret: <CRON_SECRET>
```

Flow:
1. Check `request.headers.get('x-cron-secret') === process.env.CRON_SECRET`. If missing or mismatch → `401`.
2. Read `ABANDONED_CART_THRESHOLD_MINUTES` (default `60`).
3. Call `getCartsForReminder(threshold)`.
4. For each result: call `sendAbandonedCartEmail(...)`, then `markReminderSent(cartId)`.
5. Return `{ processed: N }` with status `200`.

Error handling: wrap the whole sweep in try/catch; a failure on one cart is logged and skipped, not thrown (so one bad row doesn't abort the batch). Return `{ processed: N, errors: M }` if any skipped.

**`compose.yml` env addition:** `CRON_SECRET: ${CRON_SECRET:-}`, `RESEND_API_KEY: ${RESEND_API_KEY:-}`, `RESEND_FROM_EMAIL: ${RESEND_FROM_EMAIL:-}`, `ABANDONED_CART_THRESHOLD_MINUTES: ${ABANDONED_CART_THRESHOLD_MINUTES:-60}`.

### E. Triggering the cron (operator step, not code)

The cron route is a plain HTTP endpoint. The operator wires an external trigger — Coolify scheduled task, GitHub Actions schedule, or any cron service — to:

```
POST https://dev.animeniacs.shop/api/cron/abandoned-carts
Header: x-cron-secret: <value of CRON_SECRET>
```

Recommended frequency: every 15 minutes (sweep runs fast, idempotency guards prevent double-sends).

This is documented in the spec as an operator step. The code is complete and testable without it.

### Tests
- `tests/db/abandoned-carts.test.ts` (extend existing): `getCartsForReminder` returns only eligible rows (filters by null email, threshold, status, reminder_sent_at); `markReminderSent` stamps both fields.
- `tests/notifications/email.test.ts` (new): `sendAbandonedCartEmail` calls Resend with correct params; silently no-ops when `RESEND_API_KEY` absent.
- `tests/api/cron-abandoned-carts.test.ts` (new): 401 without correct secret; calls `getCartsForReminder` + `sendAbandonedCartEmail` + `markReminderSent` for each result; returns `{ processed }`.

---

## 4. Section C — Durable upload storage

### Problem

`saveAvatar()` (`src/lib/images/upload.ts`) writes to `public/images/artists/<slug>.webp` via Node `writeFile`. The Dockerfile's `runner` stage copies `public/` into the image but the `nextjs` user (uid 1001) cannot write to it at runtime → `EACCES`. Even if writable, files written at runtime vanish on every container rebuild/redeploy.

The comment in `upload.ts` (lines 19–21) asserting "Coolify preserves writes under public/ at runtime" is false and must be corrected. This is "Locked Decision #3" from the Phase 4 plan — that decision was wrong; this phase supersedes it.

### Solution: named Docker volume

A named volume (`uploads-data`) is declared in `compose.yml` and mounted into the app container at `/app/public/images/uploads`. Named Docker volumes:

- Persist across container rebuilds and restarts
- Travel with the compose stack — portable to any Docker host
- Are backed up/migrated with standard Docker volume tooling (`docker volume export/import`, or a tarball of `/var/lib/docker/volumes/animeniacs_uploads-data/_data/`)

All future upload types use subdirectories of this same mount: `artists/`, `ip-covers/`, `review-photos/`, `event-logos/` — no new volume per feature.

### Changes

**`compose.yml`:**
```yaml
services:
  app:
    volumes:
      - uploads-data:/app/public/images/uploads

volumes:
  postgres-data:
  uploads-data:      # ← new
```

**`Dockerfile` (runner stage, before `USER nextjs`):**
```dockerfile
# Ensure the uploads mount point exists and is owned by the app user
# so the named volume mounts with correct permissions on first start.
RUN mkdir -p /app/public/images/uploads && \
    chown -R nextjs:nodejs /app/public/images/uploads
```

This must appear **after** the `COPY --from=builder /app/public ./public` line and **before** `USER nextjs`.

**`src/lib/images/upload.ts`:**
- Change `AVATAR_DIR_REL` from `'public/images/artists'` to `'public/images/uploads/artists'`
- Change the returned URL from `/images/artists/${filename}` to `/images/uploads/artists/${filename}`
- Fix the false comment (lines 19–21) — replace with accurate description of the volume-backed path
- Add a graceful `EACCES` catch around `writeFile`: if the mount is missing or misconfigured, throw an `AvatarValidationError` with a clear message ("Upload directory not writable — check volume mount") rather than letting the raw `EACCES` propagate as a 500. This ensures a misconfigured deployment degrades to a form error, not a crash.

**`next.config.mjs`:** no change. `/images/uploads/...` is same-origin, served from `public/` by Next.js's static file handler; no `remotePatterns` needed.

### URL migration note

Existing `artists.avatar_url` values in the sandbox DB point to `/images/artists/...`. After the rename they become stale (the files no longer exist at that path anyway — they were lost on every rebuild). The execution agent should include a one-liner Drizzle migration or raw SQL to null out or update these stale URLs:

```sql
UPDATE artists SET avatar_url = NULL WHERE avatar_url LIKE '/images/artists/%';
```

This is sandbox data only — no production records exist yet.

### Tests

Extend `tests/admin/artist-upload.test.ts` (or create if absent): assert `saveAvatar` returns a URL under `/images/uploads/artists/`; assert `writeFile` is called at the correct path; assert an `EACCES` from `writeFile` is caught and re-thrown as `AvatarValidationError`.

---

## 5. New env vars summary

| Var | Required | Default | Used by |
|---|---|---|---|
| `RESEND_API_KEY` | For email | — | `src/lib/notifications/email.ts` |
| `RESEND_FROM_EMAIL` | For email | — | `src/lib/notifications/email.ts` |
| `CRON_SECRET` | For cron route | — | `POST /api/cron/abandoned-carts` |
| `ABANDONED_CART_THRESHOLD_MINUTES` | No | `60` | Cron sweep query |

All four must be added to `compose.yml` (env passthrough), `.env.example` (documented), and Coolify's runtime env for the `animeniacs-shop-dev` app (`h4400cg04wg8www84ggks4sg`).

---

## 6. Files created or modified

| File | Change |
|---|---|
| `src/components/cart/CartClearer.tsx` | NEW — `'use client'` mount-and-clear component |
| `src/app/checkout/success/page.tsx` | MODIFY — render `<CartClearer>`, ensure `?cartId=` in redirectUrl |
| `src/lib/checkout/create-payment-link.ts` | MODIFY if needed — append `?cartId=${cartId}` to `redirectUrl` |
| `src/app/api/checkout/route.ts` | MODIFY — capture Logto email into `buyerEmail` |
| `src/lib/db/queries/abandoned-carts.ts` | MODIFY — add `getCartsForReminder`, `markReminderSent` |
| `src/lib/notifications/email.ts` | NEW — `sendAbandonedCartEmail` via Resend |
| `src/app/api/cron/abandoned-carts/route.ts` | NEW — secured cron endpoint |
| `src/lib/images/upload.ts` | MODIFY — new path, graceful EACCES, fix comment |
| `compose.yml` | MODIFY — `uploads-data` volume + new env vars |
| `Dockerfile` | MODIFY — `mkdir + chown` for uploads mount point |
| `.env.example` | MODIFY — document 4 new vars |
| `tests/public/cart-clearer.test.tsx` | NEW |
| `tests/db/abandoned-carts.test.ts` | MODIFY — extend with new query tests |
| `tests/notifications/email.test.ts` | NEW |
| `tests/api/cron-abandoned-carts.test.ts` | NEW |

---

## 7. Deferred (Phase 11+)

- **Order history / account UI** — separate "accounts" phase. Requires Logto↔Square customer mapping, order-data model decisions, and account page UI. Not touched here.
- **IP cover image upload UI** — `ip_nicknames.cover_image_url` column exists; upload UI and volume subdir `ip-covers/` deferred to the phase that builds the category-page cover-image feature.
- **Review photo uploads** — `reviews.photo_urls` column exists; upload handler and volume subdir `review-photos/` deferred to the reviews phase.
- **Event logo uploads** — `event_logos.image_url` column exists; admin UI and volume subdir `event-logos/` deferred to the events phase.
- **Resend newsletter / marketing list** — `RESEND_AUDIENCE_ID` is in `.env.example`; audience/newsletter management is not in scope here.
- **Multi-step abandonment sequence** — explicitly rejected/YAGNI. One email per cart, one send, done.

---

## 8. Constraints carried forward (always in force)

- `grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0
- `SQUARE_ENV=sandbox` until deliberate prod cutover phase
- No new auth vendors; reuse Logto + `(admin)` group
- Admin pages: inline styles, `useFormState` from `react-dom` (NOT `useActionState`)
- Build must pass with an unreachable `DATABASE_URL` (root layout is `force-dynamic`; no build-time DB reads)
- `scripts/deploy.sh` is the canonical deploy path post-Phase-9
