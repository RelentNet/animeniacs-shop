# Phase 12 → Phase 13 hand-off

**Status:** Phase 12 **code-complete**. Reviews & engagement shipped in 11 tasks:
product reviews (rating + title + body + photos) with a server-computed
**Verified Purchase** badge, **auto-publish-verified / hold-the-rest** moderation
via a new `/admin/reviews` page, review photos on the Phase 10 durable uploads
volume (the upload module was generalized), and a wishlist with a
`/account/wishlist` page. All automated **code** gates green (lint / typecheck /
unit / canary / unreachable-DB build). Tag `phase-12-reviews-engagement` applied
at the final commit. Deploy triggered via `./scripts/deploy.sh`.

**Date:** 2026-06-10

> **Read me first, master orchestrator:** the reviews + wishlist features are
> **live on deploy**, but operator steps gate real-world use (§9, do NOT block):
> (1) the **uploads volume** (still-pending Phase 10 item) must be mounted for
> review photos to persist — without it `saveReviewPhoto` degrades to a friendly
> form error, not a 500; (2) the **`0013` migration** (`reviews.author_name`)
> must apply on deploy / in CI (no local Postgres in the exec env); (3) the
> **sandbox verify checklist**. `SQUARE_ENV` stays `sandbox`; no prod cutover.
> goaffpro canary stays **0**. **No new env vars or secrets** were added this
> phase. Integration tests were **not run locally** (no Postgres/Docker) — but
> note **zero integration tests were added or modified**, so the suite is
> structurally unchanged at the Phase 11 baseline (75). Run them in CI / against
> a live DB before relying on them.

---

## 1. TL;DR

Phase 12 activated two dormant tables (`reviews`, `wishlists`) into real
features:

- **Product reviews** — any signed-in user can rate (1–5) + title + body +
  photos a product. **Verified Purchase** is computed at submit from the user's
  completed orders (`orders.lineItems[].catalogObjectId`, jsonb containment).
- **Moderation** — `isPublished = isVerifiedPurchase` at submit: verified
  reviews auto-publish; everything else is held in `/admin/reviews` for an admin
  to publish or delete. **Public reads return published reviews only.**
- **Review photos** — buyers attach ≤ 4 photos, re-encoded to webp (fit within
  1200px) and stored under `uploads/review-photos/` on the Phase 10
  `uploads-data` volume. The upload module was generalized (shared validate +
  write internals); **the avatar path + its tests are unchanged**.
- **Wishlist** — add/remove products, a product-page toggle button, and a
  `/account/wishlist` page.

**Schema:** 1 additive change (`reviews.author_name text` nullable) → migration
`0013_bouncy_wallow.sql`. **Env:** **no changes**. **Tests:** +56 unit (342 →
**398**). Integration **unchanged** (0 added/modified; not run locally).

---

## 2. Required reading order

1. **This doc** (`phase-12-handoff.md`).
2. **`phase-11-handoff.md`** — orders read model, Logto↔Square mapping, the
   `getCurrentUser()` helper, the `(account)` group, IDOR guard.
3. **`phase-10-handoff.md`** — durable uploads volume, `saveAvatar` hardening,
   `corepack pnpm` build note, the Windows EPERM standalone quirk.
4. **`phase-09-handoff.md`** — `scripts/deploy.sh` + the `force-dynamic`
   post-mortem (still in force).
5. **Phase 12 plan + spec:**
   `docs/superpowers/plans/2026-06-10-phase-12-reviews-engagement.md` +
   `docs/superpowers/specs/2026-06-10-phase-12-reviews-engagement-design.md`.

---

## 3. What Phase 12 shipped (file-by-file)

| Task | Commit | Files | Change |
|---|---|---|---|
| 1 — schema | `6323e2b` | `src/lib/db/schema.ts`, `drizzle/migrations/0013_bouncy_wallow.sql` (+ snapshot/journal) | Add `authorName text('author_name')` (nullable) to `reviews`. Single `ADD COLUMN`. `wishlists` untouched. |
| 2 — upload generalization | `3318784` | `src/lib/images/upload.ts`, `public/images/uploads/review-photos/.gitkeep`, `tests/images/review-photo.test.ts` (NEW) | Extracted private `validateImageFile(file)` + `writeWebp(buf, subdir, filename)`. `saveAvatar` (500×500 cover) public behavior + `AvatarValidationError` export unchanged. NEW `saveReviewPhoto(file, key)` → resize `inside` 1200×1200 `withoutEnlargement` → webp q82 → `uploads/review-photos/<key>.webp`. **Avatar tests stay green.** No compose/Dockerfile change (volume already covers `uploads/`). |
| 3 — verified-purchase queries | `5ae8554` | `src/lib/db/queries/orders.ts`, `tests/db/orders.test.ts` (extend) | `hasPurchasedProduct(userId, productId)` + `findPurchaseOrderId(userId, productId)` via jsonb containment (`lineItems @> '[{"catalogObjectId":…}]'::jsonb`) scoped to `userId` + `status='completed'`, `limit 1`. |
| 4 — reviews queries | `9563aa8` | `src/lib/db/queries/reviews.ts` (NEW), `tests/db/reviews.test.ts` (NEW) | `createReview` (insert→returning; `23505` → `AlreadyReviewedError`), `getPublishedReviewsForProduct` (published-only, `createdAt desc`), `getReviewSummary` → `{count, average}` (published, 0/0 when none), `getUserReviewForProduct`, `getPendingReviews` (unpublished), `publishReview`, `deleteReview`. `import 'server-only'`. |
| 5 — submit action + form | `a690ac0` | `src/app/product/[id]/reviews/actions.ts` (NEW), `src/components/product/ReviewForm.tsx` (NEW), `src/components/product/StarRating.tsx` (NEW), `tests/product/submit-review-action.test.ts` (NEW), `tests/product/review-form.test.tsx` (NEW) | `submitReviewAction` (`'use server'`): `getCurrentUser` gate → validate (rating 1–5, body, ≤4 photos) → `findPurchaseOrderId` → `randomUUID` → upload photos → `createReview`. `isVerifiedPurchase`/`isPublished`/`orderId`/`authorName` **server-computed**. Returns `{ok, pending}` / error shape. `StarRating` (display) + `StarRatingInput` (radios). `ReviewForm` Tailwind `useFormState`. |
| 6 — product-page reviews | `09f0e96` | `src/components/product/ProductReviews.tsx` (NEW), `src/app/product/[id]/page.tsx` (modify) | Server component: summary (avg stars + count), published list (rating, title, body, Verified badge, photo thumbnails, authorName/"Anonymous", date), empty state. Signed-in w/o review → `ReviewForm`; already reviewed → "You reviewed this"; anon → "Sign in to review". Slotted as a `<section>` after Description. |
| 7 — wishlist queries | `3293617` | `src/lib/db/queries/wishlists.ts` (NEW), `tests/db/wishlists.test.ts` (NEW) | `addToWishlist` (`onConflictDoNothing`, idempotent), `removeFromWishlist` (composite key), `getWishlist` (`addedAt desc`), `isInWishlist` → boolean. `import 'server-only'`. |
| 8 — wishlist toggle + button | `522262e` | `src/app/product/[id]/wishlist-actions.ts` (NEW), `src/components/product/WishlistButton.tsx` (NEW), `src/app/product/[id]/page.tsx` (modify), `tests/product/wishlist-toggle.test.ts` (NEW), `tests/product/wishlist-button.test.tsx` (NEW) | `toggleWishlistAction(productId)` (`'use server'`): anon → `{needsAuth:true}` (no write); else toggle + revalidate. `WishlistButton` `'use client'` `useTransition`, `aria-pressed`, anon → `/sign-in`. Rendered in the PDP right panel with server-computed `inWishlist`. |
| 9 — `/account/wishlist` | `65c4f79` | `src/app/(account)/account/wishlist/page.tsx` (NEW), `src/app/(account)/account/wishlist/actions.ts` (NEW), `src/app/(account)/layout.tsx` (modify), `tests/account/wishlist-page.test.tsx` (NEW) | Page: `getWishlist` → resolve each via `getProductById` (skip if gone) → card grid + Remove form. `removeWishlistItemAction(formData)` server action (auth-gated). Nav "Wishlist" link added after "Order history". |
| 10 — admin moderation | `d8f09b7` | `src/app/(admin)/admin/reviews/page.tsx` (NEW), `src/app/(admin)/admin/reviews/actions.ts` (NEW), `src/app/(admin)/admin/page.tsx` (modify), `tests/admin/reviews-moderation.test.tsx` (NEW) | Inline-style admin table of pending reviews (product, rating, title, body snippet, author, date) + Publish/Delete forms via `action.bind(null, id, productId)`. `publishReviewAction`/`deleteReviewAction` revalidate `/admin/reviews` + the product page. "Reviews" entry added to `SECTIONS`. |
| 11 — test adaptation | `b10f57d` | `tests/public/product-detail-page.test.tsx` | Mocked the new PDP deps (`ProductReviews`, `WishlistButton`, `getCurrentUser`, `isInWishlist`) so the pre-existing render test stays focused on layout. |
| cleanup | `c15b995` | 7 Phase-12 files | `biome check --write` scoped to changed files (line-wrapping only). No unrelated files touched (CRLF churn avoided). |

---

## 4. Verified-purchase mechanism

"Did this user buy this product?" = at least one **completed** order for the
user whose `lineItems` jsonb **contains** `{catalogObjectId: productId}`.
Implemented in `orders.ts` as a Postgres `@>` containment predicate (engine-side,
no JS scan), scoped to `userId` + `status='completed'`, `limit 1`:

- `hasPurchasedProduct` → boolean (badge / gating).
- `findPurchaseOrderId` → the matching `squareOrderId` or null (stamped on the
  review as `orderId` for audit).

At submit, `isVerifiedPurchase = orderId !== null` and `isPublished =
isVerifiedPurchase`. The reviewer's display name is captured into
`reviews.author_name` (denormalized; avoids a Logto lookup per render; "Anonymous"
fallback).

---

## 5. Moderation model + published-only invariant

- **Auto-publish verified, hold the rest.** Verified-purchase reviews are
  written `isPublished=true` and appear immediately. Non-verified reviews are
  `isPublished=false` and wait in `/admin/reviews`.
- **Public visibility = published only.** `getPublishedReviewsForProduct` and
  `getReviewSummary` both filter `isPublished=true`. Unpublished reviews are
  returned ONLY by `getPendingReviews` (used solely by the admin-gated
  `/admin/reviews`). No public surface reads unpublished reviews.
- **Admins** can publish or delete any held review; `/admin/reviews` is gated by
  the existing `(admin)` role layout.

---

## 6. Security / correctness invariants (verified)

- **Auth required to write** reviews + wishlist — every write path calls
  `getCurrentUser()` server-side and bails (`{error:'auth'}` /
  `{needsAuth:true}` / silent no-op) when not authenticated. Client flags are
  never trusted. Anonymous read of *published* reviews is fine.
- **`isVerifiedPurchase` / `isPublished` / `orderId` / `authorName` are
  server-computed** in `submitReviewAction` — never read from the form. Covered
  by `tests/product/submit-review-action.test.ts` (verified→published,
  non-verified→pending, orderId stamping).
- **Published-only public visibility** (see §5) — covered by the reviews query
  tests + the `ProductReviews` render test.
- **One review per (user, product)** — DB `reviews_user_product_unique` + a
  friendly `AlreadyReviewedError` → `{error:'duplicate'}`.
- **Photo uploads reuse the Phase 10 hardened path** — MIME/size validation +
  sharp re-encode (strips metadata, neutralizes malicious payloads); EACCES →
  friendly field error, not a 500. **Avatar upload tests still pass** after the
  refactor (`tests/admin/avatar-upload.test.ts`, 4/4 green).
- `SQUARE_ENV=sandbox`; goaffpro canary **0**; deploy via `./scripts/deploy.sh`
  only; no new env vars/secrets. PDP/account/admin pages are dynamic (root
  layout `force-dynamic`).

---

## 7. Schema change + migration

Migration `drizzle/migrations/0013_bouncy_wallow.sql`:

```sql
ALTER TABLE "reviews" ADD COLUMN "author_name" text;
```

Single additive, nullable column — low risk, no data backfill needed.
**Not applied locally** (no Postgres on `:5433` / no Docker in the exec env, same
as Phase 10/11). The migration + drizzle snapshot/journal were generated and the
SQL verified. **Apply on deploy / in CI.**

---

## 8. Verification state at handoff

**Automated code gate (local, via `corepack pnpm`):**
- **Lint:** repo-wide `pnpm lint` is red on pre-existing CRLF files locally
  (Phase 10 deviation 9). The **29 Phase-12 changed files pass `biome check`
  cleanly** (verified by scoping the check to the changed set after the
  formatting commit; committed blobs are LF; CI Linux lint passes).
- **Typecheck:** `pnpm typecheck` (tsc --noEmit) → **clean (exit 0)**.
- **Unit tests:** `pnpm test` → **398 passed** (75 files) — up from 342 (+56:
  6 review-photo + 4 orders + 11 reviews-queries + 8 submit-action + 4
  review-form + 5 product-reviews + 5 wishlist-queries + 3 wishlist-toggle +
  3 wishlist-button + 3 wishlist-page + 4 reviews-moderation). One pre-existing
  checkout test is timeout-flaky under full-suite load (passes in isolation at
  ~5s; unrelated to Phase 12).
- **Integration tests:** **NOT run** (no Postgres/Docker locally;
  `ECONNREFUSED :5433`). **Zero integration tests added or modified** this phase,
  so the suite is structurally unchanged at the Phase 11 baseline (**75**).
  **Do not claim integration green until run** against a live DB / in CI.
- **Canary:** `grep -rni "goaffpro" src/ tests/` → **0**.
- **Production build, unreachable DB:**
  `DATABASE_URL=postgresql://x:x@unreachable-host:5432/db corepack pnpm exec next build`
  → **✓ Compiled successfully**, **✓ Generating static pages (38/38)** (was 36;
  +2 for `/admin/reviews` + `/account/wishlist`), **0 `ENOTFOUND`/`ECONNREFUSED`**.
  Exits 1 **only** on the Windows-specific `EPERM: symlink` in the
  `output: standalone` copy step (Phase 10 quirk) — **after** a successful
  compile + page generation. **On the Linux Docker builder Coolify uses, this
  exits 0.**

**Deploy:** `./scripts/deploy.sh` run at close of phase (push `main` + forced
Coolify deploy of the tagged commit `phase-12-reviews-engagement`).

---

## 9. Operator-pending items (DO NOT BLOCK — documented for follow-up)

1. **Mount the `uploads-data` volume** (still-pending Phase 10 item — now also
   gates review-photo durability). Coolify → `animeniacs-shop-dev` → Storages →
   Named Volume `uploads-data`, mount `/app/public/images/uploads`. Without it,
   `saveReviewPhoto` (and `saveAvatar`) degrade to a friendly form error, not a
   500; uploads are non-durable across rebuilds.
2. **Apply migration `0013` + run the integration suite against a live DB.**
   `docker compose --profile local up -d postgres` → `corepack pnpm db:push` (or
   migrate) → `corepack pnpm test:integration` (confirm the Phase 11 baseline of
   75 still passes; no Phase 12 integration tests were added).
3. **Sandbox verify (spec §9):** as a signed-in **non-purchaser**, submit a
   review → it's held; open `/admin/reviews` → publish it → it appears on the
   product page. As a **buyer** of a sandbox order, submit → auto-published with
   the Verified badge. Add/remove a wishlist item → appears on
   `/account/wishlist`.
4. **No new env vars or secrets** — nothing to add in Coolify for this phase.
5. **Carried from Phase 11 (still pending):** enable Logto self-registration;
   set Resend env + wire the abandoned-cart cron (Phase 10); clear stale sandbox
   avatar URLs. **Carried from Phase 9:** Coolify Auto-Deploy; `/api/health` 200
   check; admin mobile dark-mode visual check.

---

## 10. Plan deviations

1. **Migration named `0013_bouncy_wallow.sql`** (the plan/spec didn't pin a
   number). It is the single expected `ADD COLUMN author_name`. No hand-editing
   needed (contrast Phase 11's `0012`).
2. **Admin Publish/Delete use bound server actions, not `useFormState`.** The
   plan's Task 10 step 2 suggested `useFormState` "like the other admin forms,"
   but the actual codebase idiom for fieldless action buttons is
   `action.bind(null, …)` (see `sms-recipients` delete). Publish/Delete have no
   form fields, so the bound-action form is the correct, simpler match — both
   actions also take `productId` (bound from the row) to revalidate the product
   page. No `useFormState` value to add here.
3. **Test-only adaptation to `product-detail-page.test.tsx` (commit `b10f57d`).**
   The PDP gained a reviews section + wishlist button (new request-time reads:
   `getCurrentUser`, `isInWishlist`, and the `ProductReviews`/`WishlistButton`
   components). The pre-existing render test mocked none of them, so they were
   stubbed (same pattern as Phase 11's account-page mock additions). Production
   contract unchanged.
4. **`react-dom`/`useFormState` test mock** for `ReviewForm` (and the
   `WishlistButton` `useRouter` mock) — same jsdom/SSR adaptation as the Phase 9
   settings + Phase 11 account-page tests. Test-only.
5. **Lint via scoped `biome check`** rather than repo-wide `pnpm lint` (red on
   pre-existing CRLF files locally — Phase 10/11 deviation). Phase 12 changed set
   verified clean; committed blobs are LF; CI passes.
6. **Build run as `corepack pnpm exec next build`** (after
   `corepack pnpm content:build`) to bypass the `prebuild` bare-`pnpm` call —
   same as Phase 10/11. No code change.

---

## 11. What's deferred / Phase 13+ candidates

**Explicitly out of scope this phase (from the spec):**
- **Per-product-card rating summary on `/shop`** — needs a batch summary query;
  detail page only this phase.
- **Review editing / replies / admin responses.**
- **Review helpful-votes.**
- **Wishlist sharing.**
- **"Review request" email after purchase** (would extend the Phase 10 Resend
  sender + a post-fulfillment trigger).
- **Profile name/email editing** (Logto-owned; still deferred).

**New notes introduced by Phase 12:**
- `reviews.author_name` is captured at submit and never refreshed — if a user
  later changes their Logto display name, old reviews keep the old name (by
  design; denormalized for render performance).
- Review photos share the `uploads-data` volume with avatars under sibling
  subdirs (`artists/`, `review-photos/`). The next upload feature (IP covers,
  event logos) can reuse `writeWebp(buf, subdir, filename)` directly.
- `getReviewSummary` runs a per-product `count`/`avg` aggregate on each PDP
  render — fine at current scale; revisit with a cached/materialized summary if
  the `/shop` per-card rating lands (it would need a batch variant anyway).

**Carried forward (unchanged):** refund status reflection on orders (enum exists,
no writer); guest order lookup by email; Square production cutover; monitoring /
alerting, CI/CD, automated DB backups; `/shop` pagination/search/filtering; the
`batchGet` 1000-object image cap; shared `ProductCard` for grids; the Phase 10
operator items (uploads volume, Resend cron).

---

## 12. Where credentials live

Phase 12 **sourced no new secrets and added zero env vars.** Locations unchanged
from Phase 11:
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
git rev-parse phase-12-reviews-engagement
git checkout main && git pull

corepack pnpm install
corepack pnpm content:build                      # gitignored manifest
corepack pnpm typecheck                          # clean
corepack pnpm test                               # 398 passed
grep -rni "goaffpro" src/ tests/                 # 0

# Build proves the new routes compile + no build-time DB read
DATABASE_URL=postgresql://x:x@unreachable-host:5432/db corepack pnpm exec next build
#   → "Compiled successfully", "Generating static pages (38/38)", 0 ENOTFOUND
#     (Linux exits 0; Windows stops at the standalone symlink step — EPERM)

# Operator-assisted (live, after deploy + uploads volume) — §9:
#   non-purchaser review → held → /admin/reviews publish → shows on PDP;
#   buyer review → auto-published + Verified badge; wishlist add/remove → /account/wishlist.
```
