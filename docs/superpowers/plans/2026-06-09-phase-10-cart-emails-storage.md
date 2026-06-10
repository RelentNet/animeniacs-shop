# Phase 10 — Cart Fix, Abandoned-Cart Emails, Durable Upload Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the cart-not-cleared-after-checkout bug, add abandoned-cart recovery emails via Resend (logged-in users only), and establish a named Docker volume as durable upload storage (fixing the live EACCES crash on artist-avatar create/edit).

**Architecture:** Three independent sub-tracks — (A) a client-side `CartClearer` component on the success page calls the existing `clear()` action on mount with an idempotency guard; (B) a secured cron route sweeps pending `abandoned_carts` rows with a non-null email and sends one Resend email per cart; (C) a named Docker volume `uploads-data` mounted at `/app/public/images/uploads` replaces direct writes to the container image's `public/images/artists` dir.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM, `resend` npm package (net-new), Docker named volumes, `@logto/next/server-actions`.

---

## Baseline verification

Before starting, confirm the repo is clean and tests are green.

- [ ] Run `git status` — confirm clean working tree on `main`, HEAD at `88c3133` or later.
- [ ] Run `pnpm test` — confirm 280 unit tests pass.
- [ ] Run `pnpm typecheck` — confirm clean.
- [ ] Run `grep -rn "goaffpro\|GoAffPro" src/ tests/` — confirm 0.

---

## Task 1: Cart-clear bug — add `CartClearer` component

**Files:**
- Create: `src/components/cart/CartClearer.tsx`
- Modify: `src/app/checkout/success/page.tsx`
- Modify: `src/lib/checkout/create-payment-link.ts` (append `?cartId=` to redirectUrl)
- Create: `tests/public/cart-clearer.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/public/cart-clearer.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockClear = vi.fn()

vi.mock('@/components/cart/useCart', () => ({
  useCart: () => ({ clear: mockClear })
}))

// Import AFTER mock is set up
const { CartClearer } = await import('@/components/cart/CartClearer')

describe('CartClearer', () => {
  beforeEach(() => {
    mockClear.mockReset()
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('calls clear() on mount with a cartId', () => {
    render(<CartClearer cartId="cart-abc-123" />)
    expect(mockClear).toHaveBeenCalledTimes(1)
  })

  it('does NOT call clear() again on re-render with the same cartId', () => {
    const { rerender } = render(<CartClearer cartId="cart-abc-123" />)
    rerender(<CartClearer cartId="cart-abc-123" />)
    expect(mockClear).toHaveBeenCalledTimes(1)
  })

  it('does NOT call clear() when cartId is absent', () => {
    render(<CartClearer cartId={undefined} />)
    expect(mockClear).not.toHaveBeenCalled()
  })

  it('calls clear() again for a new cartId (different checkout)', () => {
    render(<CartClearer cartId="cart-abc-123" />)
    sessionStorage.clear()
    render(<CartClearer cartId="cart-xyz-999" />)
    expect(mockClear).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```sh
pnpm vitest run tests/public/cart-clearer.test.tsx
```
Expected: FAIL — `CartClearer` does not exist yet.

- [ ] **Step 3: Create `CartClearer` component**

Create `src/components/cart/CartClearer.tsx`:

```tsx
'use client'

import { useCart } from '@/components/cart/useCart'
import { useEffect } from 'react'

const SESSION_KEY = 'clearedCartId'

interface CartClearerProps {
  cartId: string | undefined
}

/**
 * Invisible client component. On mount, clears the cart once for the
 * current cartId. Uses sessionStorage as an idempotency guard so a
 * buyer bookmarking the success URL and returning later with a new
 * cart does not accidentally wipe it.
 *
 * Renders null — no visible output.
 */
export function CartClearer({ cartId }: CartClearerProps): null {
  const { clear } = useCart()

  useEffect(() => {
    if (!cartId) return
    if (sessionStorage.getItem(SESSION_KEY) === cartId) return
    clear()
    sessionStorage.setItem(SESSION_KEY, cartId)
  }, [cartId, clear])

  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

```sh
pnpm vitest run tests/public/cart-clearer.test.tsx
```
Expected: 4 passed.

- [ ] **Step 5: Confirm `?cartId=` is appended to the Square redirect URL**

Read `src/lib/checkout/create-payment-link.ts`. The `redirectUrl` is passed in from the caller. Read `src/app/api/checkout/route.ts` line 59:

```ts
redirectUrl: `${siteUrl}/checkout/success`
```

This does NOT include `?cartId=`. Square redirects back with `?orderId=<square-order-id>` appended automatically but does NOT forward custom params. We need to append our own `cartId` to the redirect URL so the success page can read it.

Modify `src/app/api/checkout/route.ts` line 59 — change:
```ts
redirectUrl: `${siteUrl}/checkout/success`
```
to:
```ts
redirectUrl: `${siteUrl}/checkout/success?cartId=${cartId}`
```

Note: Square appends `orderId` as a separate param, so the final URL the buyer lands on will be `…/checkout/success?cartId=<uuid>&orderId=<square-id>`. Both params are present.

- [ ] **Step 6: Mount `CartClearer` on the success page**

Modify `src/app/checkout/success/page.tsx`. Add import and render the component. The page already reads `searchParams.orderId`; add `cartId` alongside it.

Change the `PageProps` interface and add the import + render:

```tsx
import { CartClearer } from '@/components/cart/CartClearer'

// ...

interface PageProps {
  searchParams: { orderId?: string; cartId?: string }
}

// Inside the returned JSX of CheckoutSuccessPage (the full-order branch),
// add <CartClearer> as a sibling inside the fragment:
export default async function CheckoutSuccessPage({
  searchParams
}: PageProps): Promise<JSX.Element> {
  const orderId = searchParams.orderId
  const cartId = searchParams.cartId
  // ... rest of function unchanged ...

  return (
    <>
      <CartClearer cartId={cartId} />
      <Script id="plausible-checkout-completed" strategy="afterInteractive">
        {/* existing script unchanged */}
      </Script>
      <main className="mx-auto max-w-2xl px-4 py-12">
        {/* existing content unchanged */}
      </main>
    </>
  )
}
```

Also add `<CartClearer cartId={cartId} />` inside the `<GenericThanks />` fallback cases — those should also clear the cart when `cartId` is present (buyer paid but order fetch failed). Change `GenericThanks` to accept and pass through cartId, or inline it. Simplest: render `<CartClearer>` before returning `<GenericThanks />` in both early-return branches:

```tsx
if (!orderId) {
  return (
    <>
      <CartClearer cartId={cartId} />
      <GenericThanks />
    </>
  )
}
const order = await fetchOrderSafely(orderId)
if (!order) {
  return (
    <>
      <CartClearer cartId={cartId} />
      <GenericThanks />
    </>
  )
}
```

- [ ] **Step 7: Run full test suite and typecheck**

```sh
pnpm typecheck && pnpm test
```
Expected: typecheck clean; 284 unit tests pass (280 + 4 new).

- [ ] **Step 8: Commit**

```sh
git add src/components/cart/CartClearer.tsx \
        src/app/checkout/success/page.tsx \
        src/app/api/checkout/route.ts \
        tests/public/cart-clearer.test.tsx
git commit -m "fix(cart): clear cart on checkout success via CartClearer component"
```

---

## Task 2: Durable upload storage — Docker volume + upload path fix

**Files:**
- Modify: `compose.yml`
- Modify: `Dockerfile`
- Modify: `src/lib/images/upload.ts`
- Modify: `public/images/uploads/artists/.gitkeep` (create directory placeholder)

- [ ] **Step 1: Write the failing test**

Check whether `tests/admin/artist-upload.test.ts` or similar exists:

```sh
ls tests/admin/
```

Create `tests/admin/avatar-upload.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

// Mock writeFile before importing the module under test
const mockWriteFile = vi.fn().mockResolvedValue(undefined)
vi.mock('node:fs/promises', () => ({
  writeFile: mockWriteFile
}))

// Re-import after mock (hoisted pattern not needed here since we use vi.mock at module level)
const { saveAvatar, AvatarValidationError } = await import('@/lib/images/upload')

function makeFile(name: string, type: string, sizeBytes: number): File {
  const buf = new Uint8Array(sizeBytes).fill(1)
  return new File([buf], name, { type })
}

describe('saveAvatar', () => {
  it('returns a URL under /images/uploads/artists/', async () => {
    const file = makeFile('test.webp', 'image/webp', 100)
    const url = await saveAvatar(file, 'test-artist')
    expect(url).toBe('/images/uploads/artists/test-artist.webp')
  })

  it('calls writeFile at the uploads/artists path', async () => {
    const file = makeFile('test.png', 'image/png', 100)
    await saveAvatar(file, 'slug-x')
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('public/images/uploads/artists/slug-x.webp'),
      expect.any(Buffer)
    )
  })

  it('throws AvatarValidationError for empty file', async () => {
    const file = makeFile('empty.png', 'image/png', 0)
    await expect(saveAvatar(file, 'slug')).rejects.toBeInstanceOf(AvatarValidationError)
  })

  it('throws AvatarValidationError on EACCES from writeFile', async () => {
    mockWriteFile.mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'EACCES' }))
    const file = makeFile('ok.webp', 'image/webp', 100)
    await expect(saveAvatar(file, 'slug')).rejects.toBeInstanceOf(AvatarValidationError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```sh
pnpm vitest run tests/admin/avatar-upload.test.ts
```
Expected: FAIL — URL returns `/images/artists/...` not `/images/uploads/artists/...`; EACCES test fails since the error propagates as-is.

- [ ] **Step 3: Update `src/lib/images/upload.ts`**

Replace the file:

```ts
import 'server-only'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

/**
 * Server-side avatar handling for the admin artist form.
 *
 * Pipeline:
 *   1. Validate MIME + byte-size (defense in depth on top of HTML
 *      `accept` attribute — clients lie).
 *   2. Resize to a square 500x500 webp via `sharp` (centered cover
 *      crop). webp is the smallest common-denominator format that
 *      supports both lossy and transparency.
 *   3. Write to public/images/uploads/artists/<slug>.webp — this path
 *      is backed by the `uploads-data` named Docker volume declared in
 *      compose.yml, mounted at /app/public/images/uploads in the runner
 *      container. Files written here persist across container rebuilds.
 *   4. Return the public URL path so the caller can store it on the
 *      `artists.avatar_url` column.
 *
 * Future upload types (IP cover images, review photos, event logos)
 * use the same volume at sibling subdirectories (ip-covers/, review-photos/,
 * event-logos/) — no new volume per feature needed.
 *
 * Previous behaviour (before Phase 10): wrote to public/images/artists/
 * which is part of the container image and is NOT writable at runtime
 * → EACCES in production. Locked Decision #3 from Phase 4 was incorrect
 * and is superseded by this implementation.
 */

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])
const AVATAR_DIR_REL = 'public/images/uploads/artists'
const AVATAR_OUTPUT_SIZE = 500

export interface AvatarUploadError {
  field: 'avatarFile'
  message: string
}

export class AvatarValidationError extends Error {
  readonly field = 'avatarFile' as const
  constructor(message: string) {
    super(message)
    this.name = 'AvatarValidationError'
  }
}

/**
 * Validate the file, resize to 500x500 webp, write to the uploads
 * volume, return the public URL.
 *
 * Throws `AvatarValidationError` for any user-input problem (size,
 * MIME, empty file) AND for EACCES (volume not mounted / misconfigured)
 * so a deployment issue degrades to a form error rather than a 500.
 * Lets other unexpected errors (sharp crashes, etc.) propagate — those
 * are server bugs, not user errors.
 */
export async function saveAvatar(file: File, slug: string): Promise<string> {
  if (file.size === 0) {
    throw new AvatarValidationError('Avatar file is empty.')
  }
  if (file.size > MAX_BYTES) {
    throw new AvatarValidationError(
      `Avatar file is ${(file.size / 1024 / 1024).toFixed(1)} MB; limit is 2 MB.`
    )
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw new AvatarValidationError(
      `Unsupported file type "${file.type}". Allowed: PNG, JPEG, WebP.`
    )
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer())

  const outputBuffer = await sharp(inputBuffer)
    .resize(AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE, { fit: 'cover', position: 'centre' })
    .webp({ quality: 88 })
    .toBuffer()

  const filename = `${slug}.webp`
  const absolutePath = path.resolve(AVATAR_DIR_REL, filename)
  try {
    await writeFile(absolutePath, outputBuffer)
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EACCES' || code === 'EROFS' || code === 'ENOENT') {
      throw new AvatarValidationError(
        'Upload directory not writable — check that the uploads volume is mounted correctly.'
      )
    }
    throw err
  }

  // Public URL relative to the app root — Next.js serves `public/`
  // contents at the root path.
  return `/images/uploads/artists/${filename}`
}
```

- [ ] **Step 4: Run test to verify it passes**

```sh
pnpm vitest run tests/admin/avatar-upload.test.ts
```
Expected: 4 passed.

- [ ] **Step 5: Create the uploads directory placeholder**

```sh
mkdir -p public/images/uploads/artists
touch public/images/uploads/artists/.gitkeep
```

This ensures the directory exists in the image so Docker can chown it before the volume mounts.

- [ ] **Step 6: Update `Dockerfile` — chown uploads dir before USER switch**

In the `runner` stage, after the three `COPY` lines (lines 30–32) and before `USER nextjs` (line 34), add:

```dockerfile
# Ensure the uploads mount point is owned by the app user so the
# named Docker volume (uploads-data) is writable on first container start.
RUN chown -R nextjs:nodejs /app/public/images/uploads
```

The full runner stage should look like:

```dockerfile
# --- Stage 3: runtime ---
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache wget
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Ensure the uploads mount point is owned by the app user so the
# named Docker volume (uploads-data) is writable on first container start.
RUN chown -R nextjs:nodejs /app/public/images/uploads

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
```

- [ ] **Step 7: Update `compose.yml` — declare volume and mount**

Add the volume mount to the `app` service and declare the `uploads-data` named volume:

```yaml
services:
  app:
    # ... existing fields unchanged ...
    volumes:
      - uploads-data:/app/public/images/uploads

volumes:
  postgres-data:
  uploads-data:
```

The `volumes:` key under `app:` is new (the service had no volumes before). The top-level `volumes:` block already has `postgres-data:` — add `uploads-data:` as a sibling.

- [ ] **Step 8: Note the stale sandbox avatar URLs**

The existing `artists.avatar_url` values in the sandbox DB may point to `/images/artists/...`. After this change those files no longer exist at that path (they were never durable anyway). Run this in the sandbox DB to clear stale values:

```sql
UPDATE artists SET avatar_url = NULL WHERE avatar_url LIKE '/images/artists/%';
```

The execution agent should run this against the sandbox DB via:

```sh
# Read DATABASE_URL from .env.local safely
db=$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-)
psql "$db" -c "UPDATE artists SET avatar_url = NULL WHERE avatar_url LIKE '/images/artists/%';"
```

This is sandbox-only (no production data exists yet).

- [ ] **Step 9: Run full tests and typecheck**

```sh
pnpm typecheck && pnpm test
```
Expected: typecheck clean; ≥ 284 unit tests pass (previous + 4 new avatar-upload tests).

- [ ] **Step 10: Commit**

```sh
git add src/lib/images/upload.ts \
        Dockerfile \
        compose.yml \
        public/images/uploads/artists/.gitkeep \
        tests/admin/avatar-upload.test.ts
git commit -m "fix(uploads): durable storage via Docker named volume, fix EACCES crash on avatar upload"
```

---

## Task 3: Abandoned-cart emails — install Resend + email sender

**Files:**
- Modify: `package.json` (install `resend`)
- Create: `src/lib/notifications/email.ts`
- Create: `tests/notifications/email.test.ts`

- [ ] **Step 1: Install Resend**

```sh
pnpm add resend
```

Verify it appears in `package.json` dependencies.

- [ ] **Step 2: Write the failing test**

Create `tests/notifications/email.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockSend = vi.fn()

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: mockSend } }))
}))

describe('sendAbandonedCartEmail', () => {
  beforeEach(() => {
    mockSend.mockReset()
    mockSend.mockResolvedValue({ data: { id: 'email-id-123' }, error: null })
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@animeniacs.shop')
  })

  it('calls Resend with correct to, subject, and shop link', async () => {
    const { sendAbandonedCartEmail } = await import('@/lib/notifications/email')
    await sendAbandonedCartEmail({
      to: 'buyer@example.com',
      cartSnapshot: { items: [{ catalogItemId: 'ITEM_1', quantity: 2 }] },
      shopUrl: 'https://dev.animeniacs.shop'
    })
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'buyer@example.com',
        subject: expect.stringContaining('left'),
        text: expect.stringContaining('https://dev.animeniacs.shop/shop')
      })
    )
  })

  it('silently no-ops when RESEND_API_KEY is absent', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const { sendAbandonedCartEmail } = await import('@/lib/notifications/email')
    await expect(
      sendAbandonedCartEmail({
        to: 'buyer@example.com',
        cartSnapshot: { items: [] },
        shopUrl: 'https://dev.animeniacs.shop'
      })
    ).resolves.toBeUndefined()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('silently no-ops when RESEND_FROM_EMAIL is absent', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', '')
    const { sendAbandonedCartEmail } = await import('@/lib/notifications/email')
    await expect(
      sendAbandonedCartEmail({
        to: 'buyer@example.com',
        cartSnapshot: { items: [] },
        shopUrl: 'https://dev.animeniacs.shop'
      })
    ).resolves.toBeUndefined()
    expect(mockSend).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```sh
pnpm vitest run tests/notifications/email.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 4: Create `src/lib/notifications/email.ts`**

```ts
import 'server-only'
import { Resend } from 'resend'

export interface CartSnapshot {
  items: Array<{ catalogItemId: string; quantity: number }>
}

/**
 * Sends a single abandoned-cart recovery email via Resend.
 *
 * Silently no-ops if RESEND_API_KEY or RESEND_FROM_EMAIL is not set —
 * missing env is treated as "email not configured" rather than a crash.
 * This lets the cron route run safely in environments that haven't set
 * up Resend yet.
 *
 * One email per cart ever — idempotency is enforced upstream by the
 * cron route checking reminder_sent_at IS NULL before calling this.
 */
export async function sendAbandonedCartEmail(opts: {
  to: string
  cartSnapshot: CartSnapshot
  shopUrl: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL

  if (!apiKey || !from) {
    console.warn('[email] sendAbandonedCartEmail: RESEND_API_KEY or RESEND_FROM_EMAIL not set — skipping')
    return
  }

  const resend = new Resend(apiKey)

  const itemLines = opts.cartSnapshot.items
    .map((item) => `  • ${item.quantity}× ${item.catalogItemId}`)
    .join('\n')

  const text = [
    'Hi,',
    '',
    "You left some items in your cart at Animeniacs. Come back and complete your order:",
    '',
    itemLines || '  (your cart items)',
    '',
    `Shop now: ${opts.shopUrl}/shop`,
    '',
    '— The Animeniacs Team'
  ].join('\n')

  await resend.emails.send({
    from,
    to: opts.to,
    subject: "You left something in your cart",
    text
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

```sh
pnpm vitest run tests/notifications/email.test.ts
```
Expected: 3 passed.

- [ ] **Step 6: Run full tests and typecheck**

```sh
pnpm typecheck && pnpm test
```
Expected: clean + ≥ 287 passing.

- [ ] **Step 7: Commit**

```sh
git add src/lib/notifications/email.ts tests/notifications/email.test.ts package.json pnpm-lock.yaml
git commit -m "feat(email): add sendAbandonedCartEmail via Resend"
```

---

## Task 4: Abandoned-cart emails — new query functions

**Files:**
- Modify: `src/lib/db/queries/abandoned-carts.ts`
- Modify: `tests/db/abandoned-carts.test.ts` (extend existing)

- [ ] **Step 1: Check existing test file**

```sh
ls tests/db/
```

Find the abandoned-carts test file. Read it to understand the existing test structure and mock pattern before extending.

- [ ] **Step 2: Write failing tests (add to existing file)**

Open the existing `tests/db/abandoned-carts.test.ts` and add at the end:

```ts
describe('getCartsForReminder', () => {
  it('returns only pending carts with non-null email, past threshold, unsent reminder', async () => {
    // Arrange: mock db to return one matching row
    const row = {
      cartId: 'cart-1',
      buyerEmail: 'buyer@example.com',
      cartSnapshot: { items: [{ catalogItemId: 'ITEM_A', quantity: 1 }] },
      status: 'pending',
      reminderSentAt: null,
      createdAt: new Date(Date.now() - 90 * 60 * 1000) // 90 min ago
    }
    mockDb.select.mockReturnThis()
    mockDb.from.mockReturnThis()
    mockDb.where.mockResolvedValue([row])

    const { getCartsForReminder } = await import('@/lib/db/queries/abandoned-carts')
    const results = await getCartsForReminder(60)

    expect(results).toHaveLength(1)
    expect(results[0].cartId).toBe('cart-1')
    expect(results[0].buyerEmail).toBe('buyer@example.com')
  })
})

describe('markReminderSent', () => {
  it('updates reminderSentAt and status to abandoned', async () => {
    mockDb.update.mockReturnThis()
    mockDb.set.mockReturnThis()
    mockDb.where.mockResolvedValue([])

    const { markReminderSent } = await import('@/lib/db/queries/abandoned-carts')
    await expect(markReminderSent('cart-1')).resolves.toBeUndefined()
    expect(mockDb.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'abandoned', reminderSentAt: expect.any(Date) })
    )
  })
})
```

Note: the mock pattern (`mockDb`) must match what the existing test file uses. Read the existing file first and adapt these tests to use the same mock setup.

- [ ] **Step 3: Run tests to verify they fail**

```sh
pnpm vitest run tests/db/abandoned-carts.test.ts
```
Expected: new describe blocks FAIL — functions not implemented.

- [ ] **Step 4: Add `getCartsForReminder` and `markReminderSent` to the query file**

Add to `src/lib/db/queries/abandoned-carts.ts` (after the existing functions):

```ts
import { and, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm'

export interface CartForReminder {
  cartId: string
  buyerEmail: string
  cartSnapshot: unknown
}

/**
 * Returns pending carts eligible for an abandonment reminder:
 *   - status = 'pending' (not completed, not already abandoned)
 *   - buyer_email IS NOT NULL (logged-in checkout only)
 *   - created_at < NOW() - thresholdMinutes
 *   - reminder_sent_at IS NULL (not already sent)
 */
export async function getCartsForReminder(
  thresholdMinutes: number
): Promise<CartForReminder[]> {
  const rows = await db
    .select({
      cartId: abandonedCarts.cartId,
      buyerEmail: abandonedCarts.buyerEmail,
      cartSnapshot: abandonedCarts.cartSnapshot
    })
    .from(abandonedCarts)
    .where(
      and(
        ne(abandonedCarts.status, 'completed'),
        ne(abandonedCarts.status, 'abandoned'),
        isNotNull(abandonedCarts.buyerEmail),
        isNull(abandonedCarts.reminderSentAt),
        lt(
          abandonedCarts.createdAt,
          sql`NOW() - (${thresholdMinutes} * INTERVAL '1 minute')`
        )
      )
    )
  // buyerEmail is guaranteed non-null by the isNotNull filter above
  return rows.map((r) => ({
    cartId: r.cartId,
    buyerEmail: r.buyerEmail as string,
    cartSnapshot: r.cartSnapshot
  }))
}

/**
 * Stamps reminder_sent_at = NOW() and sets status = 'abandoned'
 * for a cart that has been sent a recovery email.
 */
export async function markReminderSent(cartId: string): Promise<void> {
  await db
    .update(abandonedCarts)
    .set({ status: 'abandoned', reminderSentAt: new Date(), updatedAt: new Date() })
    .where(eq(abandonedCarts.cartId, cartId))
}
```

Add `and`, `isNotNull`, `isNull`, `lt`, `ne`, `sql` to the existing `drizzle-orm` import at the top of the file.

- [ ] **Step 5: Run tests to verify they pass**

```sh
pnpm vitest run tests/db/abandoned-carts.test.ts
```
Expected: all pass.

- [ ] **Step 6: Run full tests and typecheck**

```sh
pnpm typecheck && pnpm test
```
Expected: clean.

- [ ] **Step 7: Commit**

```sh
git add src/lib/db/queries/abandoned-carts.ts tests/db/abandoned-carts.test.ts
git commit -m "feat(abandoned-carts): add getCartsForReminder and markReminderSent query functions"
```

---

## Task 5: Abandoned-cart emails — capture buyer email at checkout

**Files:**
- Modify: `src/app/api/checkout/route.ts`

- [ ] **Step 1: Write the failing test**

The existing checkout route test (if any) or a new one at `tests/api/checkout.test.ts`. Check:

```sh
ls tests/api/
```

If a test for `/api/checkout` exists, read it and add a case. If not, create `tests/api/checkout-buyer-email.test.ts`:

```ts
import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

const mockGetLogtoContext = vi.fn()
const mockCreatePendingCart = vi.fn().mockResolvedValue({})
const mockCreatePaymentLink = vi.fn().mockResolvedValue({
  checkoutUrl: 'https://squareup.com/pay/abc',
  orderId: 'sq-order-1'
})
const mockValidateCart = vi.fn().mockResolvedValue({ ok: true, lines: [] })

vi.mock('@logto/next/server-actions', () => ({ getLogtoContext: mockGetLogtoContext }))
vi.mock('@/lib/db/queries/abandoned-carts', () => ({ createPendingCart: mockCreatePendingCart }))
vi.mock('@/lib/checkout/create-payment-link', () => ({ createPaymentLink: mockCreatePaymentLink }))
vi.mock('@/lib/checkout/validate-cart', () => ({ validateCart: mockValidateCart }))
vi.mock('@/lib/logto', () => ({ logtoConfig: {} }))

const validBody = {
  items: [{ catalogItemId: 'CAT_1', variationId: 'VAR_1', quantity: 1, expectedUnitPriceCents: 1000 }]
}

describe('POST /api/checkout — buyer email capture', () => {
  it('writes buyer email when user is signed in', async () => {
    mockGetLogtoContext.mockResolvedValue({ claims: { email: 'buyer@example.com' } })
    vi.stubEnv('SQUARE_LOCATION_ID', 'LOC_1')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://dev.animeniacs.shop')

    const { POST } = await import('@/app/api/checkout/route')
    const req = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify(validBody)
    })
    await POST(req)

    expect(mockCreatePendingCart).toHaveBeenCalledWith(
      expect.objectContaining({ buyerEmail: 'buyer@example.com' })
    )
  })

  it('writes null email when user is not signed in', async () => {
    mockGetLogtoContext.mockResolvedValue({ claims: null })
    vi.stubEnv('SQUARE_LOCATION_ID', 'LOC_1')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://dev.animeniacs.shop')

    const { POST } = await import('@/app/api/checkout/route')
    const req = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify(validBody)
    })
    await POST(req)

    expect(mockCreatePendingCart).toHaveBeenCalledWith(
      expect.objectContaining({ buyerEmail: null })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```sh
pnpm vitest run tests/api/checkout-buyer-email.test.ts
```
Expected: FAIL — `buyerEmail` is always `null`.

- [ ] **Step 3: Modify `src/app/api/checkout/route.ts`**

Add `getLogtoContext` import and capture the email. The full updated file:

```ts
import { randomUUID } from 'node:crypto'
import { createPaymentLink } from '@/lib/checkout/create-payment-link'
import { validateCart } from '@/lib/checkout/validate-cart'
import { createPendingCart } from '@/lib/db/queries/abandoned-carts'
import { logtoConfig } from '@/lib/logto'
import { getLogtoContext } from '@logto/next/server-actions'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const RequestSchema = z.object({
  items: z
    .array(
      z.object({
        catalogItemId: z.string().min(1),
        variationId: z.string().min(1),
        quantity: z.number().int().positive(),
        expectedUnitPriceCents: z.number().int().nonnegative()
      })
    )
    .min(1)
    .max(50)
})

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const locationId = process.env.SQUARE_LOCATION_ID
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!locationId || !siteUrl) {
    console.error('[checkout] missing SQUARE_LOCATION_ID or NEXT_PUBLIC_SITE_URL')
    return NextResponse.json(
      { error: 'Could not start checkout. Please try again.' },
      { status: 500 }
    )
  }

  // Capture buyer email for logged-in users (used for abandoned-cart recovery).
  // Falls back to null for anonymous/guest checkout — those carts are silently
  // skipped by the abandonment sweep.
  let buyerEmail: string | null = null
  try {
    const ctx = await getLogtoContext(logtoConfig)
    const email = ctx?.claims?.email
    if (typeof email === 'string' && email.length > 0) {
      buyerEmail = email
    }
  } catch {
    // Not signed in or Logto unavailable — continue with null email
  }

  try {
    const validation = await validateCart(parsed.data.items)
    if (!validation.ok) {
      return NextResponse.json(
        { error: 'price_changed', mismatches: validation.mismatches },
        { status: 409 }
      )
    }

    const cartId = randomUUID()
    const { checkoutUrl, orderId } = await createPaymentLink({
      lines: validation.lines,
      cartId,
      locationId,
      redirectUrl: `${siteUrl}/checkout/success?cartId=${cartId}`
    })

    await createPendingCart({
      cartId,
      squareOrderId: orderId,
      cartSnapshot: { items: parsed.data.items },
      buyerEmail
    })

    return NextResponse.json({ checkoutUrl, cartId })
  } catch (err) {
    console.error('[checkout] failure:', err)
    return NextResponse.json(
      { error: 'Could not start checkout. Please try again.' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```sh
pnpm vitest run tests/api/checkout-buyer-email.test.ts
```
Expected: 2 passed.

- [ ] **Step 5: Run full tests and typecheck**

```sh
pnpm typecheck && pnpm test
```
Expected: clean.

- [ ] **Step 6: Commit**

```sh
git add src/app/api/checkout/route.ts tests/api/checkout-buyer-email.test.ts
git commit -m "feat(checkout): capture Logto buyer email onto pending abandoned_cart row"
```

---

## Task 6: Abandoned-cart emails — cron route

**Files:**
- Create: `src/app/api/cron/abandoned-carts/route.ts`
- Create: `tests/api/cron-abandoned-carts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/cron-abandoned-carts.test.ts`:

```ts
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetCartsForReminder = vi.fn()
const mockMarkReminderSent = vi.fn().mockResolvedValue(undefined)
const mockSendAbandonedCartEmail = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/db/queries/abandoned-carts', () => ({
  getCartsForReminder: mockGetCartsForReminder
}))
vi.mock('@/lib/notifications/email', () => ({
  sendAbandonedCartEmail: mockSendAbandonedCartEmail
}))

// markReminderSent is in the same module — re-mock fully
vi.mock('@/lib/db/queries/abandoned-carts', () => ({
  getCartsForReminder: mockGetCartsForReminder,
  markReminderSent: mockMarkReminderSent
}))

const CRON_SECRET = 'test-secret-value'

describe('POST /api/cron/abandoned-carts', () => {
  beforeEach(() => {
    mockGetCartsForReminder.mockReset()
    mockMarkReminderSent.mockReset().mockResolvedValue(undefined)
    mockSendAbandonedCartEmail.mockReset().mockResolvedValue(undefined)
    vi.stubEnv('CRON_SECRET', CRON_SECRET)
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://dev.animeniacs.shop')
    vi.stubEnv('ABANDONED_CART_THRESHOLD_MINUTES', '60')
  })

  it('returns 401 without the correct secret', async () => {
    const { POST } = await import('@/app/api/cron/abandoned-carts/route')
    const req = new NextRequest('http://localhost/api/cron/abandoned-carts', {
      method: 'POST',
      headers: { 'x-cron-secret': 'wrong' }
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 with no secret header', async () => {
    const { POST } = await import('@/app/api/cron/abandoned-carts/route')
    const req = new NextRequest('http://localhost/api/cron/abandoned-carts', { method: 'POST' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('processes eligible carts and returns processed count', async () => {
    mockGetCartsForReminder.mockResolvedValue([
      { cartId: 'cart-1', buyerEmail: 'a@b.com', cartSnapshot: { items: [] } },
      { cartId: 'cart-2', buyerEmail: 'c@d.com', cartSnapshot: { items: [] } }
    ])
    const { POST } = await import('@/app/api/cron/abandoned-carts/route')
    const req = new NextRequest('http://localhost/api/cron/abandoned-carts', {
      method: 'POST',
      headers: { 'x-cron-secret': CRON_SECRET }
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.processed).toBe(2)
    expect(mockSendAbandonedCartEmail).toHaveBeenCalledTimes(2)
    expect(mockMarkReminderSent).toHaveBeenCalledTimes(2)
  })

  it('returns processed:0 when no eligible carts', async () => {
    mockGetCartsForReminder.mockResolvedValue([])
    const { POST } = await import('@/app/api/cron/abandoned-carts/route')
    const req = new NextRequest('http://localhost/api/cron/abandoned-carts', {
      method: 'POST',
      headers: { 'x-cron-secret': CRON_SECRET }
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.processed).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```sh
pnpm vitest run tests/api/cron-abandoned-carts.test.ts
```
Expected: FAIL — route does not exist.

- [ ] **Step 3: Create `src/app/api/cron/abandoned-carts/route.ts`**

```ts
import {
  getCartsForReminder,
  markReminderSent
} from '@/lib/db/queries/abandoned-carts'
import { sendAbandonedCartEmail } from '@/lib/notifications/email'
import type { CartSnapshot } from '@/lib/notifications/email'
import { NextResponse } from 'next/server'

/**
 * POST /api/cron/abandoned-carts
 *
 * Secured by the x-cron-secret header. Finds pending abandoned_carts
 * rows with a non-null buyer_email, older than ABANDONED_CART_THRESHOLD_MINUTES
 * (default 60), with no reminder sent yet. Sends one Resend recovery
 * email per cart, then stamps reminder_sent_at and sets status='abandoned'.
 *
 * Idempotent: reminder_sent_at IS NULL guards against double-sends.
 * One email per cart ever.
 *
 * Trigger: wire an external cron (Coolify scheduled task, GitHub Actions
 * schedule, or any cron service) to POST to this URL with the x-cron-secret
 * header. Recommended frequency: every 15 minutes.
 *
 * Returns: { processed: N } on success, { processed: N, errors: M } if
 * some carts failed (those are logged + skipped, not aborted).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET
  const incoming = request.headers.get('x-cron-secret')

  if (!cronSecret || incoming !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const thresholdMinutes = Number(process.env.ABANDONED_CART_THRESHOLD_MINUTES ?? '60')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''

  const carts = await getCartsForReminder(thresholdMinutes)

  let processed = 0
  let errors = 0

  for (const cart of carts) {
    try {
      await sendAbandonedCartEmail({
        to: cart.buyerEmail,
        cartSnapshot: cart.cartSnapshot as CartSnapshot,
        shopUrl: siteUrl
      })
      await markReminderSent(cart.cartId)
      processed++
    } catch (err) {
      console.error(`[cron/abandoned-carts] failed for cart ${cart.cartId}:`, err)
      errors++
    }
  }

  const body: Record<string, number> = { processed }
  if (errors > 0) body.errors = errors

  return NextResponse.json(body)
}
```

- [ ] **Step 4: Run test to verify it passes**

```sh
pnpm vitest run tests/api/cron-abandoned-carts.test.ts
```
Expected: 4 passed.

- [ ] **Step 5: Run full tests and typecheck**

```sh
pnpm typecheck && pnpm test
```
Expected: clean; total unit test count up by ~9+ from baseline 280.

- [ ] **Step 6: Commit**

```sh
git add src/app/api/cron/abandoned-carts/route.ts \
        tests/api/cron-abandoned-carts.test.ts
git commit -m "feat(cron): POST /api/cron/abandoned-carts — abandoned-cart recovery email sweep"
```

---

## Task 7: Env vars — wire new vars into compose.yml and .env.example

**Files:**
- Modify: `compose.yml`
- Modify: `.env.example`

- [ ] **Step 1: Add new env vars to `compose.yml` app service**

Under the `app:` service `environment:` block, add at the end:

```yaml
      RESEND_API_KEY: ${RESEND_API_KEY:-}
      RESEND_FROM_EMAIL: ${RESEND_FROM_EMAIL:-}
      CRON_SECRET: ${CRON_SECRET:-}
      ABANDONED_CART_THRESHOLD_MINUTES: ${ABANDONED_CART_THRESHOLD_MINUTES:-60}
```

- [ ] **Step 2: Document in `.env.example`**

Read `.env.example` first, then add a new section for Phase 10 vars:

```sh
# Phase 10 — abandoned-cart recovery emails + cron
# RESEND_API_KEY=re_...
# RESEND_FROM_EMAIL=orders@animeniacs.shop
# CRON_SECRET=<random-secret-min-32-chars>
# ABANDONED_CART_THRESHOLD_MINUTES=60
```

- [ ] **Step 3: Run typecheck (compose changes don't need tests)**

```sh
pnpm typecheck && pnpm test
```
Expected: clean.

- [ ] **Step 4: Commit**

```sh
git add compose.yml .env.example
git commit -m "chore(env): add Phase 10 env vars to compose.yml and .env.example"
```

---

## Task 8: Final verification + tag

- [ ] **Step 1: Full test suite**

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration
```
Expected: lint clean, typecheck clean, unit tests ≥ 293 (280 baseline + ~13 new), integration 75 unchanged.

- [ ] **Step 2: goaffpro canary**

```sh
grep -rn "goaffpro\|GoAffPro" src/ tests/
```
Expected: 0 matches.

- [ ] **Step 3: Build check with unreachable DB (production-sim)**

```sh
DATABASE_URL=postgresql://x:x@unreachable-host/db pnpm build
```
Expected: exit 0, no `ENOTFOUND` errors in output. Root layout has `force-dynamic`, so no build-time DB reads.

- [ ] **Step 4: Write the handoff doc**

Create `docs/superpowers/specs/reference/phase-10-handoff.md` following the format of `phase-09-handoff.md`. Include:
- What shipped (file-by-file table with commits)
- The `?cartId=` redirect URL change and its effect
- Volume mount operator steps (see §5 below)
- New env vars (RESEND_*, CRON_SECRET, ABANDONED_CART_THRESHOLD_MINUTES)
- Operator-pending items (set up Resend account, add env vars to Coolify, wire cron trigger, run stale-avatar SQL, mount the volume in Coolify)
- Deferred items (IP cover upload UI, review photos, event logos, order history)

- [ ] **Step 5: Tag and deploy**

```sh
git tag phase-10-cart-emails-storage
./scripts/deploy.sh
```

---

## §5 Operator steps after deploy (document in handoff)

These are not code — they are manual setup steps the operator must complete:

1. **Coolify: add `uploads-data` volume mount**
   In Coolify dashboard → `animeniacs-shop-dev` app → Storages → Add volume:
   - Volume name: `uploads-data`
   - Mount path in container: `/app/public/images/uploads`
   - Type: Named Volume (persists across rebuilds)

2. **Clear stale sandbox avatar URLs** (one-time):
   ```sh
   db=$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-)
   psql "$db" -c "UPDATE artists SET avatar_url = NULL WHERE avatar_url LIKE '/images/artists/%';"
   ```

3. **Add new env vars to Coolify** (`animeniacs-shop-dev` → Environment Variables):
   - `RESEND_API_KEY` — from your Resend dashboard
   - `RESEND_FROM_EMAIL` — e.g. `orders@animeniacs.shop` (must be a verified sender in Resend)
   - `CRON_SECRET` — generate: `openssl rand -hex 32`
   - `ABANDONED_CART_THRESHOLD_MINUTES` — `60` (or your preference)

4. **Wire the cron trigger** (after env vars are live):
   Any cron service (Coolify scheduled task, GitHub Actions, cron-job.org) POST to:
   ```
   POST https://dev.animeniacs.shop/api/cron/abandoned-carts
   Header: x-cron-secret: <value of CRON_SECRET>
   ```
   Recommended frequency: every 15 minutes. Test manually first:
   ```sh
   base=$(grep '^NEXT_PUBLIC_SITE_URL=' .env.local | cut -d= -f2-)
   secret=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)
   curl -s -X POST "$base/api/cron/abandoned-carts" \
     -H "x-cron-secret: $secret" | jq
   # Expected: {"processed":0} (no eligible carts yet)
   ```

5. **Redeploy after env vars are set** to pick up new vars:
   ```sh
   ./scripts/deploy.sh
   ```
