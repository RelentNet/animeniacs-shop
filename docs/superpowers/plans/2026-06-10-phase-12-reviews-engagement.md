# Phase 12 — Reviews & Engagement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task, TDD. Steps use checkbox (`- [ ]`). Write the failing test first, confirm it fails, implement, confirm it passes, commit per task.

**Design spec:** `docs/superpowers/specs/2026-06-10-phase-12-reviews-engagement-design.md` (read first — §3 verified-purchase model, §5 upload generalization, §7 submission flow, §8 invariants are load-bearing).

**Goal:** Product reviews (rating + title + body + photos) with a verified-purchase badge, auto-publish-verified / hold-the-rest moderation via a new `/admin/reviews` page, review photos on the Phase 10 uploads volume, and a wishlist with a `/account/wishlist` page.

**Stack:** Next.js 14 App Router, Drizzle/Postgres, Square, Logto, sharp. Customer pages = Tailwind; `/admin/reviews` = admin inline-style idiom.

---

## Baseline verification

- [ ] `git status` clean on `main`, HEAD `9e206c1` or later.
- [ ] `pnpm test` → 342 unit pass; `pnpm typecheck` clean.
- [ ] `grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0.

---

## Task 1: Schema — add `reviews.authorName`

**Files:** `src/lib/db/schema.ts`, generated migration.

- [ ] **Step 1:** Add `authorName: text('author_name')` (nullable) to the `reviews` table (after `body` or near `title`). No other column changes; `wishlists` untouched.
- [ ] **Step 2:** `pnpm db:generate`; review the `.sql` (single `ADD COLUMN author_name`). Apply with `pnpm db:push` if Postgres is available; else note + rely on CI.
- [ ] **Step 3:** `pnpm typecheck`. Commit: `feat(db): add reviews.author_name for denormalized reviewer display name`.

---

## Task 2: Generalize the upload module — `saveReviewPhoto`

**Files:** `src/lib/images/upload.ts`, `public/images/uploads/review-photos/.gitkeep`, `tests/admin/avatar-upload.test.ts` (must stay green), `tests/images/review-photo.test.ts` (new).

- [ ] **Step 1 (test first):** new test — `saveReviewPhoto(file, 'rev-0')` returns `/images/uploads/review-photos/rev-0.webp`, calls `writeFile` with a path containing `public/images/uploads/review-photos/rev-0.webp`, validates MIME/size/empty (throws `AvatarValidationError`), and surfaces EACCES as `AvatarValidationError`. Keep mocking `node:fs/promises` + `sharp` per the existing avatar test.
- [ ] **Step 2:** Refactor internals into private `validateImageFile(file)` and `writeWebp(buffer, subdir, filename)`; keep `saveAvatar` (500×500 cover) public behavior + `AvatarValidationError` export unchanged. Add `saveReviewPhoto(file, key)` → `sharp().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 })` → `writeWebp(buf, 'review-photos', \`${key}.webp\`)` → return the public URL.
- [ ] **Step 3:** `touch public/images/uploads/review-photos/.gitkeep`. (No compose/Dockerfile change — the `uploads-data` volume + chown already cover `/app/public/images/uploads`.)
- [ ] **Step 4:** Run BOTH `tests/admin/avatar-upload.test.ts` and the new test → green. `pnpm typecheck`. Commit: `feat(images): saveReviewPhoto reusing the durable uploads volume`.

---

## Task 3: Verified-purchase queries on `orders`

**Files:** `src/lib/db/queries/orders.ts`, `tests/db/orders.test.ts` (extend).

- [ ] **Step 1 (test first):** mock `db`. `hasPurchasedProduct('u1','ITEM_A')` → true when a completed order's `lineItems` contains `{ catalogObjectId: 'ITEM_A' }`, false otherwise. `findPurchaseOrderId` returns the matching `squareOrderId` or null.
- [ ] **Step 2:** Implement using jsonb containment scoped to user + completed status:
  ```ts
  .where(and(
    eq(orders.userId, userId),
    eq(orders.status, 'completed'),
    sql`${orders.lineItems} @> ${JSON.stringify([{ catalogObjectId: productId }])}::jsonb`
  ))
  ```
  `hasPurchasedProduct` → boolean (limit 1); `findPurchaseOrderId` → that order's `squareOrderId` or null.
- [ ] **Step 3:** Tests pass; typecheck. Commit: `feat(orders): verified-purchase lookups (hasPurchasedProduct, findPurchaseOrderId)`.

---

## Task 4: Reviews queries

**Files:** create `src/lib/db/queries/reviews.ts`, `tests/db/reviews.test.ts`.

- [ ] **Step 1 (test first):** mock `db`. Cover: `createReview` inserts and returns the row; unique-violation (Postgres code `23505`) → throws `AlreadyReviewedError`; `getPublishedReviewsForProduct` filters `isPublished = true` ordered `createdAt desc`; `getReviewSummary` returns `{ count, average }` over published; `getUserReviewForProduct` returns the user's row or undefined; `getPendingReviews` returns `isPublished = false`; `publishReview(id)` sets `isPublished = true` + `updatedAt`; `deleteReview(id)` deletes.
- [ ] **Step 2:** Implement. Export `class AlreadyReviewedError extends Error`. `createReview` accepts the full input incl. `id`, `authorName`, `isVerifiedPurchase`, `isPublished`, `photoUrls`, `orderId`; catch unique violation → `AlreadyReviewedError`. `getReviewSummary` via `sql` `count(*)` + `avg(rating)` (coerce to number; `{ count: 0, average: 0 }` when none). `import 'server-only'`.
- [ ] **Step 3:** Tests pass; typecheck. Commit: `feat(reviews): query layer (create, published list, summary, pending, publish, delete)`.

---

## Task 5: Review submission action + form

**Files:** create `src/app/product/[id]/reviews/actions.ts`, `src/components/product/ReviewForm.tsx`, `src/components/product/StarRating.tsx`, `tests/product/submit-review-action.test.ts`, `tests/product/review-form.test.tsx`.

- [ ] **Step 1 (action test first):** mock `getCurrentUser`, `findPurchaseOrderId`, `createReview`, `saveReviewPhoto`. Assert: anon → `{ error: 'auth' }`, no write; verified buyer → `createReview` called with `isVerifiedPurchase: true, isPublished: true, orderId` set; non-buyer → `isVerifiedPurchase: false, isPublished: false, orderId: null`; photos → `saveReviewPhoto` called per file, `photoUrls` populated; duplicate (`AlreadyReviewedError`) → `{ error: 'duplicate' }`; rating out of 1..5 or empty body → field error.
- [ ] **Step 2:** Implement `submitReviewAction(prevState, formData)` per spec §7 (`'use server'`): auth → parse/validate (≤4 photos) → `findPurchaseOrderId` → generate `reviewId` → upload photos → `createReview` → `revalidatePath('/product/' + productId)`. Return `{ ok: true, pending: !isVerifiedPurchase }` or an error shape.
- [ ] **Step 3:** `StarRating.tsx` — read-only display + an input mode (radio-based, accessible). `ReviewForm.tsx` — `'use client'`, `useFormState`, Tailwind; rating input, title, body, `<input type="file" multiple accept="image/*">`; success/pending/duplicate banners.
- [ ] **Step 4 (form test):** renders inputs; shows pending message on `{ pending: true }`.
- [ ] **Step 5:** Tests pass; typecheck. Commit: `feat(reviews): submit action + review form with verified-purchase + photo upload`.

---

## Task 6: Review display on the product page

**Files:** create `src/components/product/ProductReviews.tsx`, modify `src/app/product/[id]/page.tsx`, `tests/product/product-reviews.test.tsx`.

- [ ] **Step 1 (test first):** `ProductReviews` renders the summary (avg stars + count), each published review (rating, title, body, authorName or "Anonymous", date, Verified badge when `isVerifiedPurchase`, photo thumbnails), and an empty state ("No reviews yet"). For a signed-in user without an existing review it renders `ReviewForm`; for one who already reviewed, a "You reviewed this" note.
- [ ] **Step 2:** Implement `ProductReviews({ productId })` (server component): `getReviewSummary`, `getPublishedReviewsForProduct`, `getCurrentUser`, and (if signed in) `getUserReviewForProduct` to decide the form vs already-reviewed state.
- [ ] **Step 3:** Slot `<ProductReviews productId={product.id} />` into `product/[id]/page.tsx` as a new `<section className="mt-12 …">` **after** the Description section (after line 71) and before the related carousel.
- [ ] **Step 4:** Tests pass; typecheck. Commit: `feat(reviews): product-page reviews section (summary, list, badge, photos)`.

---

## Task 7: Wishlist queries

**Files:** create `src/lib/db/queries/wishlists.ts`, `tests/db/wishlists.test.ts`.

- [ ] **Step 1 (test first):** mock `db`. `addToWishlist(u,p)` → insert `onConflictDoNothing` (idempotent); `removeFromWishlist(u,p)` → delete on composite key; `getWishlist(u)` → rows ordered `addedAt desc`; `isInWishlist(u,p)` → boolean.
- [ ] **Step 2:** Implement. `import 'server-only'`.
- [ ] **Step 3:** Tests pass; typecheck. Commit: `feat(wishlist): query layer (add, remove, get, isInWishlist)`.

---

## Task 8: Wishlist toggle action + button on product page

**Files:** create `src/app/product/[id]/wishlist-actions.ts`, `src/components/product/WishlistButton.tsx`, modify `src/app/product/[id]/page.tsx`, `tests/product/wishlist-toggle.test.ts`, `tests/product/wishlist-button.test.tsx`.

- [ ] **Step 1 (action test first):** mock `getCurrentUser`, wishlist queries. Anon → `{ needsAuth: true }` (no write); signed in + not in list → `addToWishlist` + `{ inWishlist: true }`; signed in + already in list → `removeFromWishlist` + `{ inWishlist: false }`; `revalidatePath` called.
- [ ] **Step 2:** Implement `toggleWishlistAction(productId)` (`'use server'`).
- [ ] **Step 3:** `WishlistButton.tsx` — `'use client'`; initial `inWishlist` prop; on click calls the action (or routes anon users to `/sign-in`). Tailwind heart/toggle, `aria-pressed`.
- [ ] **Step 4:** Render `<WishlistButton productId={product.id} inWishlist={…} />` in the right-side panel of `product/[id]/page.tsx` (compute `inWishlist` server-side via `getCurrentUser` + `isInWishlist`).
- [ ] **Step 5:** Tests pass; typecheck. Commit: `feat(wishlist): toggle action + product-page button`.

---

## Task 9: `/account/wishlist` page

**Files:** create `src/app/(account)/account/wishlist/page.tsx`, modify `src/app/(account)/layout.tsx`, `tests/account/wishlist-page.test.tsx`.

- [ ] **Step 1 (test first):** mock `getCurrentUser`, `getWishlist`, `getProductById`. Renders a card per wishlisted product (image, name, link to `/product/[id]`, remove button); empty state ("Your wishlist is empty").
- [ ] **Step 2:** Implement the page: `getWishlist(userId)` → resolve each `productId` via `getProductById` (skip/placeholder if a product is gone). Reuse `removeFromWishlist` via a small server action or the existing toggle action.
- [ ] **Step 3:** Add a "Wishlist" `<li>` to the `(account)/layout.tsx` nav (after "Order history").
- [ ] **Step 4:** Tests pass; typecheck. Commit: `feat(account): wishlist page + nav link`.

---

## Task 10: Admin review moderation — `/admin/reviews`

**Files:** create `src/app/(admin)/admin/reviews/page.tsx`, `src/app/(admin)/admin/reviews/actions.ts`, modify `src/app/(admin)/admin/page.tsx`, `tests/admin/reviews-moderation.test.tsx`.

- [ ] **Step 1 (test first):** mock `getPendingReviews`, `publishReview`, `deleteReview`. The page lists each pending review (product id, rating, title, body snippet, authorName, createdAt) with Publish + Delete buttons; `publishReviewAction(id)` calls `publishReview` + `revalidatePath('/admin/reviews')` + the product page; `deleteReviewAction(id)` calls `deleteReview`.
- [ ] **Step 2:** Implement the page in the **admin inline-style idiom** (mirror `(admin)/admin/artists/page.tsx`): a table of pending reviews; each row has Publish/Delete forms using `useFormState` like the other admin forms. `actions.ts` = `'use server'` `publishReviewAction` / `deleteReviewAction`.
- [ ] **Step 3:** Add a `Reviews` entry → `/admin/reviews` to the `SECTIONS` array in `(admin)/admin/page.tsx`.
- [ ] **Step 4:** Tests pass; typecheck. Commit: `feat(admin): review moderation page (publish, delete) + hub link`.

---

## Task 11: Final verification + handoff + tag + deploy

- [ ] **Step 1:** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration`. Expect lint/typecheck clean; unit ≈ 342 + ~35 new; integration ≥ 75 (run against live Postgres if Docker available; otherwise note unrun — do NOT claim green).
- [ ] **Step 2:** `grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0.
- [ ] **Step 3:** Production-sim build: `DATABASE_URL=postgresql://x:x@unreachable-host/db pnpm build` → compiles + 0 `ENOTFOUND`. (Windows post-compile EPERM-symlink exit 1 is the known quirk; Linux deploy exits 0 — record which you saw.)
- [ ] **Step 4:** Write `docs/superpowers/specs/reference/phase-12-handoff.md` (follow `phase-11-handoff.md` format): file-by-file table + commits; the `authorName` migration; upload generalization; verified-purchase mechanism; moderation model (auto-publish verified / hold rest); the published-only public-visibility invariant; operator-pending (uploads volume mount confirmation, sandbox verify checklist from spec §9); deferred items (per-card rating on `/shop`, review edit/replies, helpful-votes, review-request emails).
- [ ] **Step 5:** `git tag phase-12-reviews-engagement && ./scripts/deploy.sh`.

---

## Constraints (must hold throughout)
- `SQUARE_ENV=sandbox`; goaffpro canary **0**; deploy ONLY via `./scripts/deploy.sh`.
- Customer pages (product, account, wishlist, review form) = **Tailwind**; `/admin/reviews` = **admin inline-style idiom**.
- Reviews/wishlist writes REQUIRE auth server-side (`getCurrentUser()`); never trust client flags.
- `isVerifiedPurchase` / `isPublished` are **server-computed** from `orders` — never from form input.
- Public reads return **published reviews only**; unpublished are admin-only.
- Review photos reuse the Phase 10 hardened upload path (validation + sharp re-encode); no compose/Dockerfile change.
- One review per (user, product) — DB unique constraint + friendly duplicate error.
- No new env vars/secrets; no new auth vendor.
