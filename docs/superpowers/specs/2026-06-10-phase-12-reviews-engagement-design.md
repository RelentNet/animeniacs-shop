# Phase 12 — Reviews & Engagement — Design Spec

**Date:** 2026-06-10
**Status:** Designed. Awaiting plan execution.
**Predecessor:** Phase 11 (`phase-11-accounts`, HEAD `9e206c1`).

---

## 1. Goal

Activate two dormant tables (`reviews`, `wishlists`) into real customer features:

1. **Product reviews** — any signed-in user can rate (1–5) + title + body + photos a
   product. A **"Verified Purchase"** badge shows when the user's completed orders
   contain that product (powered by Phase 11's `orders.lineItems[].catalogObjectId`).
2. **Review moderation** — verified-purchase reviews **auto-publish**; everything
   else is **held for admin approval** in a new `/admin/reviews` page.
3. **Review photos** — buyers attach photos, stored on the Phase 10 durable
   uploads volume under `uploads/review-photos/` (the upload module is generalized).
4. **Wishlist** — add/remove products to a personal wishlist, with a
   `/account/wishlist` page.

Customer-facing pages use **Tailwind / storefront** conventions. The
`/admin/reviews` moderation page uses the **admin inline-style idiom** (matches
`(admin)/admin/artists`).

---

## 2. Locked decisions (brainstorm 2026-06-10)

1. **Eligibility → any signed-in user** may review any product (anonymous blocked).
   `isVerifiedPurchase` is computed at submit and drives the badge. One review per
   user per product (existing `unique(userId, productId)` constraint).
2. **Moderation → auto-publish verified, hold the rest.** `isPublished = isVerifiedPurchase`
   at submit. Non-verified reviews wait in `/admin/reviews` for an admin to publish.
   Admins can also delete any review.
3. **Photos → included this phase.** Generalize `saveAvatar` into a reusable image
   pipeline; review photos resize to fit within 1200px (preserve aspect, not the
   500×500 square avatar crop). Cap photos per review (4).

Out of scope (Phase 13+): per-product-card rating summary on `/shop` listing (needs
a batch summary query — detail page only this phase); review editing/replies; review
helpful-votes; wishlist sharing; email "review request" after purchase; profile edit.

---

## 3. Identity & verified-purchase model

- Reviews and wishlists are keyed by Logto `sub` (`userId`) via `getCurrentUser()`.
- **Verified purchase** = the user has at least one **completed** order whose
  `lineItems` contains an item with `catalogObjectId === productId`. Implemented as a
  jsonb-containment query (`orders.lineItems @> '[{"catalogObjectId":"…"}]'`), not a
  JS scan, scoped to `userId` + `status = 'completed'`.
- `reviews.orderId` (Square order id) is stamped with the first matching order for
  audit; null when not a verified purchase.
- Reviewer display name: capture `getCurrentUser().name` into a new
  `reviews.authorName` column at submit (denormalized for display; avoids a Logto
  lookup per render). Fallback render: "Anonymous".

---

## 4. Schema changes (Drizzle → `pnpm db:generate`)

Single additive change — low risk:
- **`reviews`**: add `authorName text` (nullable) — denormalized reviewer display
  name captured at submit. All other needed columns already exist (`rating` 1–5
  CHECK, `title`, `body`, `photoUrls text[]`, `isPublished`, `isVerifiedPurchase`,
  `orderId`, `unique(userId, productId)`).
- `wishlists` — **no change** (existing `userId`, `productId`, `addedAt`, composite PK).

---

## 5. Upload module generalization (`src/lib/images/upload.ts`)

Refactor without breaking the Phase 10 avatar path or its tests:
- Extract private internals: `validateImageFile(file)` (MIME + 2MB + non-empty) and
  `writeWebp(buffer, subdir, filename)` (the EACCES/EROFS/ENOENT → friendly-error
  write). Keep `AvatarValidationError` exported and thrown (Phase 10 tests assert
  `toBeInstanceOf(AvatarValidationError)` and the `/images/uploads/artists/` URL).
- `saveAvatar(file, slug)` — unchanged public behavior (500×500 cover crop →
  `uploads/artists/<slug>.webp`), now built on the shared internals.
- **NEW** `saveReviewPhoto(file, key)` — validate → `sharp().resize(1200, 1200, {
  fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 })` →
  `uploads/review-photos/<key>.webp` → returns `/images/uploads/review-photos/<key>.webp`.
  `key` is `<reviewId>-<index>` (caller supplies). Throws `AvatarValidationError`
  on bad input (shared error type; field message generic).
- Create the directory placeholder: `public/images/uploads/review-photos/.gitkeep`
  (mirrors the Phase 10 artists placeholder so the volume mount point exists in the
  image). The `uploads-data` volume already covers `uploads/` — **no compose/Dockerfile
  change needed** (the chown already targets `/app/public/images/uploads`).

---

## 6. New / changed files

**Reviews — libs**
- `src/lib/db/queries/orders.ts` — add `hasPurchasedProduct(userId, productId): Promise<boolean>`
  + `findPurchaseOrderId(userId, productId): Promise<string | null>` (jsonb containment).
- `src/lib/db/queries/reviews.ts` — NEW: `createReview(input)` (insert; unique-violation →
  `AlreadyReviewedError`), `getPublishedReviewsForProduct(productId)`,
  `getReviewSummary(productId)` → `{ count, average }`, `getUserReviewForProduct(userId, productId)`,
  `getPendingReviews()`, `publishReview(id)`, `deleteReview(id)`.

**Reviews — product page UI** (Tailwind)
- `src/components/product/StarRating.tsx` — presentational stars (read-only + input variants).
- `src/components/product/ProductReviews.tsx` — server component: summary (avg + count) +
  published review list (rating, title, body, verified badge, photo thumbnails, authorName,
  date). Slots into `product/[id]/page.tsx` after the Description `<section>` (line 71).
- `src/components/product/ReviewForm.tsx` — `'use client'`, `useFormState`; rating input,
  title, body, photo `<input type="file" multiple>`; shown only to signed-in users who
  haven't already reviewed; otherwise a "Sign in to review" / "You reviewed this" state.
- `src/app/product/[id]/reviews/actions.ts` — `submitReviewAction` (`'use server'`).

**Wishlist**
- `src/lib/db/queries/wishlists.ts` — NEW: `addToWishlist`, `removeFromWishlist`,
  `getWishlist(userId)`, `isInWishlist(userId, productId)`.
- `src/components/product/WishlistButton.tsx` — `'use client'`; toggle; anon click →
  `/sign-in`. Slots into the right-side panel on `product/[id]/page.tsx` (near PdpPurchasePanel).
- `src/app/product/[id]/wishlist-actions.ts` — `toggleWishlistAction(productId)`.
- `src/app/(account)/account/wishlist/page.tsx` — list wishlisted products (resolve each
  `productId` via `getProductById`), remove button. Add nav link to `(account)/layout.tsx`.

**Admin moderation** (inline-style admin idiom)
- `src/app/(admin)/admin/reviews/page.tsx` — list pending (unpublished) reviews; Publish +
  Delete actions (server actions via `useFormState`, mirroring existing admin forms).
- `src/app/(admin)/admin/reviews/actions.ts` — `publishReviewAction`, `deleteReviewAction`.
- `src/app/(admin)/admin/page.tsx` — add a "Reviews" entry to `SECTIONS`.

---

## 7. Submission flow (`submitReviewAction`)

1. `getCurrentUser()` → if `!isAuthenticated` return `{ error: 'auth' }` (form shows
   "Please sign in").
2. Parse + validate form: `rating` ∈ 1..5, `body` non-empty (title optional), photo files
   ≤ 4, each ≤ 2MB / allowed MIME.
3. `orderId = await findPurchaseOrderId(userId, productId)`;
   `isVerifiedPurchase = orderId !== null`; `isPublished = isVerifiedPurchase`.
4. Generate the review id up front (`randomUUID()`); upload each photo via
   `saveReviewPhoto(file, \`${reviewId}-${i}\`)` → `photoUrls[]`. An upload failure
   surfaces as a field error (no partial review written).
5. `createReview({ id, productId, userId, orderId, rating, title, body, photoUrls,
   authorName: name, isVerifiedPurchase, isPublished })`. On `AlreadyReviewedError`
   → `{ error: 'duplicate' }`.
6. `revalidatePath(\`/product/${productId}\`)`. Verified → review appears immediately;
   non-verified → "Thanks — your review is pending approval."

---

## 8. Security / correctness invariants

- **Auth required to write** reviews + wishlist (server-side `getCurrentUser()`; never
  trust a client flag). Anonymous read of *published* reviews is fine.
- **Only published reviews are publicly visible.** `getPublishedReviewsForProduct` and
  `getReviewSummary` filter `isPublished = true`. Unpublished reviews appear only in
  `/admin/reviews` (admin-gated) and to nobody else.
- **`isVerifiedPurchase` / `isPublished` are server-computed** from the orders table —
  never accepted from form input.
- **Admin moderation is `admin`-role gated** by the existing `(admin)` layout.
- **Photo uploads** reuse the Phase 10 hardened path (MIME/size validation, sharp
  re-encode strips metadata, EACCES → friendly error). Re-encoding via sharp also
  neutralizes malicious image payloads.
- **One review per (user, product)** enforced at the DB (unique constraint) and surfaced
  as a friendly duplicate error.
- `SQUARE_ENV=sandbox`; goaffpro canary **0**; deploy via `./scripts/deploy.sh` only;
  no new env vars/secrets. Product/account/admin pages are dynamic (root layout already
  `force-dynamic`).

---

## 9. Operator-pending (post-deploy)

- **No new env vars or secrets.** Review photos reuse the existing `uploads-data` volume
  — confirm it's mounted (the still-pending Phase 10 operator step). Without the volume,
  `saveReviewPhoto` degrades to a friendly form error (same as avatars), not a 500.
- **Sandbox verify:** as a signed-in non-purchaser, submit a review → it's held; check
  `/admin/reviews` → publish it → it appears on the product page. As a buyer of a sandbox
  order, submit → auto-published with the Verified badge. Add/remove a wishlist item →
  appears on `/account/wishlist`.

---

## 10. Test strategy (TDD)

Unit (vitest; mock `db`, Square, `getCurrentUser`, `sharp`/`writeFile`):
- `upload` — `saveReviewPhoto` returns the review-photos URL + validation; **existing
  avatar tests stay green**.
- `orders` — `hasPurchasedProduct` / `findPurchaseOrderId` true & false (jsonb match).
- `reviews` queries — create, duplicate→`AlreadyReviewedError`, published-only filters,
  summary avg/count, pending/publish/delete.
- `submitReviewAction` — auth required; verified→published; non-verified→pending;
  duplicate handled; photo upload wired.
- `ProductReviews` / `StarRating` — summary + list + verified badge + photos render;
  empty state.
- `wishlists` queries — add/remove/get/isInWishlist (add is idempotent).
- `toggleWishlistAction` — anon→needs-auth; auth→toggles.
- `/account/wishlist` — lists resolved products; empty state.
- admin `/admin/reviews` + actions — lists pending; publish flips `isPublished`; delete
  removes.

Gates (match Phase 11): `pnpm lint` clean · `pnpm typecheck` clean · `pnpm test`
(expect ~+35 unit) · `pnpm test:integration` (≥75; run against live DB or note unrun) ·
`grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0 ·
`DATABASE_URL=postgresql://x:x@unreachable-host/db pnpm build` → compiles + 0 `ENOTFOUND`.
