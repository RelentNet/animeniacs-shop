# Phase 8 — `/shop` listing page + two cleanups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public `/shop` listing page (every active Square product + public IP-nickname browse chips) and fold in two cleanups (admin mobile dark-mode fix, diagnostic env-logging removal).

**Architecture:** A new `force-dynamic` server route `/shop` reads every active item via a new bulk `getShopProducts()` Square helper and renders a Tailwind grid of a new shared `ProductCard`. Public IP-nickname chips at the top link to existing `/category/[slug]` pages. IP-leak safety is guaranteed by omission (no category labels, never calls `getCategoryNameMap()`), backed by a regression test. Two unrelated cleanups land as their own commits.

**Tech Stack:** Next.js App Router (server components), Square SDK v44, Tailwind v4 utilities, Drizzle/Postgres (read-only here), Vitest + Testing Library (`vi.hoisted()` mock pattern).

**Spec:** `docs/superpowers/specs/2026-06-08-phase-08-shop-listing-design.md`

**Baseline before starting:** tag `phase-7.5-first-deploy`. `pnpm lint` clean (178 files), `pnpm typecheck` clean, `pnpm test` 255 passing, `pnpm test:integration` 75 passing, `grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0.

**Hard constraints (NEVER violate — verify they stay true at the end):**
- `grep -rn "goaffpro\|GoAffPro" src/ tests/` stays 0.
- No new Postgres tables/columns; no schema changes; `SQUARE_ENV` stays `sandbox`.
- `/shop` must NEVER render a raw Square category name and must NEVER call `getCategoryNameMap()`.
- Existing IP-leak regression tests stay green: `tests/public/product-detail-page.test.tsx`, `tests/public/category-page.test.tsx`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/square/items.ts` | MODIFY — add `getShopProducts()` bulk read (reuses `ArtistProduct` + projection helpers) |
| `src/components/product/ProductCard.tsx` | NEW — shared product card (image/name/price → PDP link) |
| `src/app/shop/page.tsx` | NEW — listing page (server, `force-dynamic`): chips + grid + states |
| `src/app/shop/loading.tsx` | NEW — skeleton grid |
| `src/app/shop/error.tsx` | NEW — `'use client'` error boundary |
| `src/components/layout/Header.tsx` | MODIFY — drop `'/shop' as Route` cast |
| `tests/square/shop-items.test.ts` | NEW — `getShopProducts()` unit tests |
| `tests/public/shop-page.test.tsx` | NEW — page render + IP-leak regression guard |
| `src/app/(admin)/layout.tsx` | MODIFY — wrapper colors (dark-mode fix) |
| `src/lib/env.ts` | MODIFY — strip diagnostic block, keep validation |
| `src/instrumentation.ts` | DELETE — diagnostic-only file |

Work in task order. Groups A–C are the feature; Groups D–E are the cleanups (independent — can be done in any order relative to A–C, but commit separately).

---

## Group A — `getShopProducts()` bulk Square read

### Task A1: Add `getShopProducts()` to the Square items module

**Files:**
- Test: `tests/square/shop-items.test.ts` (create)
- Modify: `src/lib/square/items.ts`

The existing `getItemsByCategoryId` (in `src/lib/square/items.ts`) already does the archived-filter + image-batch + price/category projection against `client.catalog.searchItems({ categoryIds, limit })`. `getShopProducts()` is the same projection but (a) no `categoryIds` filter and (b) paginated via `cursor`.

- [ ] **Step 1: Write the failing unit test**

Create `tests/square/shop-items.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { mockSearchItems, mockBatchGet } = vi.hoisted(() => ({
  mockSearchItems: vi.fn(),
  mockBatchGet: vi.fn()
}))

vi.mock('@/lib/square/client', () => ({
  getSquareClient: () => ({
    catalog: { searchItems: mockSearchItems, batchGet: mockBatchGet }
  })
}))
// unstable_cache wraps the fn but must still invoke it in tests.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn
}))

import { getShopProducts } from '@/lib/square/items'

function item(id: string, name: string, opts: Record<string, unknown> = {}) {
  return {
    id,
    itemData: {
      name,
      isArchived: opts.archived === true,
      imageIds: opts.imageIds ?? [],
      variations: opts.variations ?? [
        { itemVariationData: { pricingType: 'FIXED_PRICING', priceMoney: { amount: 2500n } } }
      ],
      categories: opts.categories ?? []
    }
  }
}

describe('getShopProducts', () => {
  beforeEach(() => {
    mockSearchItems.mockReset()
    mockBatchGet.mockReset()
    mockBatchGet.mockResolvedValue({ objects: [] })
  })

  it('returns all active items projected to ArtistProduct, sorted by name', async () => {
    mockSearchItems.mockResolvedValueOnce({
      items: [item('B', 'Banana'), item('A', 'Apple')],
      cursor: undefined
    })
    const out = await getShopProducts()
    expect(out.map((p) => p.id)).toEqual(['A', 'B'])
    expect(out[0]).toMatchObject({ id: 'A', name: 'Apple', priceCents: 2500 })
  })

  it('filters out archived items', async () => {
    mockSearchItems.mockResolvedValueOnce({
      items: [item('A', 'Apple'), item('Z', 'Zed', { archived: true })],
      cursor: undefined
    })
    const out = await getShopProducts()
    expect(out.map((p) => p.id)).toEqual(['A'])
  })

  it('paginates via cursor and dedupes by id', async () => {
    mockSearchItems
      .mockResolvedValueOnce({ items: [item('A', 'Apple')], cursor: 'c1' })
      .mockResolvedValueOnce({ items: [item('A', 'Apple'), item('B', 'Banana')], cursor: undefined })
    const out = await getShopProducts()
    expect(out.map((p) => p.id)).toEqual(['A', 'B'])
    expect(mockSearchItems).toHaveBeenCalledTimes(2)
    // second call must pass the cursor from the first response
    expect(mockSearchItems.mock.calls[1][0]).toMatchObject({ cursor: 'c1' })
  })

  it('returns empty array when Square has no items', async () => {
    mockSearchItems.mockResolvedValueOnce({ items: [], cursor: undefined })
    expect(await getShopProducts()).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/square/shop-items.test.ts`
Expected: FAIL — `getShopProducts is not a function` / import error.

- [ ] **Step 3: Implement `getShopProducts()`**

In `src/lib/square/items.ts`, append after the existing `getItemsByCategoryId` export (end of file). This mirrors the existing projection logic but paginates with no category filter:

```ts
/**
 * Returns ALL active (non-archived) catalog items, projected to the
 * public ArtistProduct shape. Used by the /shop listing page (Phase 8).
 *
 * Unlike getItemsByCategoryId this passes NO categoryIds, so it returns
 * the entire active catalog. Paginates via the response cursor. Image
 * URLs are batch-resolved per page. Cached 60s like the by-category path.
 *
 * IMPORTANT (IP-never-public): the returned categoryIds are carried for
 * parity with getItemsByCategoryId but MUST NOT be used to render any
 * category name on the public /shop page.
 */
export const getShopProducts = cache(
  async (): Promise<ArtistProduct[]> => {
    const client = getSquareClient()

    // biome-ignore lint/suspicious/noExplicitAny: SDK union is awkward
    const active: any[] = []
    let cursor: string | undefined
    do {
      const search = await client.catalog.searchItems({
        limit: 100,
        ...(cursor ? { cursor } : {})
      })
      // biome-ignore lint/suspicious/noExplicitAny: SDK union is awkward
      const items: any[] = (search as any).items ?? []
      for (const it of items) {
        if (it.itemData?.isArchived !== true) active.push(it)
      }
      cursor = (search as any).cursor ?? undefined
    } while (cursor)

    if (active.length === 0) return []

    // Collect all unique image IDs referenced by these items.
    const allImageIds = new Set<string>()
    for (const it of active) {
      const ids: string[] = it.itemData?.imageIds ?? []
      for (const id of ids) allImageIds.add(id)
    }

    const imageUrlById = new Map<string, string>()
    if (allImageIds.size > 0) {
      const imageBatch = await client.catalog.batchGet({
        objectIds: Array.from(allImageIds),
        includeRelatedObjects: false
      })
      // biome-ignore lint/suspicious/noExplicitAny: same as above
      const imgObjects: any[] = (imageBatch as any).objects ?? []
      for (const img of imgObjects) {
        if (img.type === 'IMAGE' && typeof img.imageData?.url === 'string') {
          imageUrlById.set(img.id, img.imageData.url)
        }
      }
    }

    const byId = new Map<string, ArtistProduct>()
    for (const it of active) {
      if (byId.has(it.id)) continue
      const itemData = it.itemData ?? {}
      const firstImageId: string | undefined = itemData.imageIds?.[0]
      const variations: Array<Record<string, unknown>> = itemData.variations ?? []

      let priceCents: number | null = null
      for (const v of variations) {
        // biome-ignore lint/suspicious/noExplicitAny: SDK
        const vd: any = (v as any).itemVariationData
        if (!vd || vd.pricingType !== 'FIXED_PRICING') continue
        const amount = vd.priceMoney?.amount
        if (typeof amount === 'bigint' || typeof amount === 'number') {
          const cents = Number(amount)
          if (priceCents === null || cents < priceCents) priceCents = cents
        }
      }

      const categoryIds: string[] = (itemData.categories ?? [])
        // biome-ignore lint/suspicious/noExplicitAny: SDK
        .map((c: any) => c.id)
        .filter((id: unknown): id is string => typeof id === 'string')

      byId.set(it.id, {
        id: it.id,
        name: itemData.name ?? '(unnamed)',
        imageUrl: firstImageId ? (imageUrlById.get(firstImageId) ?? null) : null,
        priceCents,
        categoryIds
      })
    }

    const out = Array.from(byId.values())
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  },
  ['square-shop-items'],
  { revalidate: 60 }
)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/square/shop-items.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: both clean. (If biome reflows formatting, accept its fixes.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/square/items.ts tests/square/shop-items.test.ts
git commit -m "feat(shop): add getShopProducts bulk catalog read"
```

---

## Group B — Shared ProductCard + `/shop` page

### Task B1: Extract a shared `ProductCard` component

**Files:**
- Create: `src/components/product/ProductCard.tsx`
- Test: `tests/public/product-card.test.tsx` (create)

Card markup is copied from `src/app/category/[slug]/page.tsx` lines 55–79 (the `<Link>` block), generalized to take an `ArtistProduct`.

- [ ] **Step 1: Write the failing test**

Create `tests/public/product-card.test.tsx`:

```tsx
import { ProductCard } from '@/components/product/ProductCard'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href as string}>{children}</a>
  )
}))

const base = { id: 'P1', name: 'Print A', imageUrl: 'https://x/a.jpg', priceCents: 2500, categoryIds: [] }

describe('ProductCard', () => {
  it('links to the PDP and renders name + formatted price', () => {
    render(<ProductCard product={base} />)
    const link = screen.getByRole('link', { name: /print a/i })
    expect(link).toHaveAttribute('href', '/product/P1')
    expect(screen.getByText('$25.00')).toBeInTheDocument()
  })

  it('renders the No image placeholder when imageUrl is null', () => {
    render(<ProductCard product={{ ...base, imageUrl: null }} />)
    expect(screen.getByText(/no image/i)).toBeInTheDocument()
  })

  it('renders an em dash when priceCents is null', () => {
    render(<ProductCard product={{ ...base, priceCents: null }} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/public/product-card.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ProductCard`**

Create `src/components/product/ProductCard.tsx`:

```tsx
import type { ArtistProduct } from '@/lib/square/items'
import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'

/**
 * Shared public product card: image (or placeholder), name, price,
 * linking to the PDP. Used by /shop (Phase 8). Renders NO category
 * information — the IP-never-public constraint is satisfied by omission.
 */
export function ProductCard({ product }: { product: ArtistProduct }): JSX.Element {
  return (
    <Link
      href={`/product/${product.id}` as Route}
      className="block rounded-lg transition hover:opacity-90"
    >
      {product.imageUrl ? (
        <Image
          src={product.imageUrl}
          alt={product.name}
          width={600}
          height={900}
          className="aspect-[2/3] w-full rounded-md object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex aspect-[2/3] w-full items-center justify-center rounded-md bg-gray-200 text-sm text-gray-500"
        >
          No image
        </div>
      )}
      <div className="mt-2 text-sm font-medium">{product.name}</div>
      <div className="text-sm text-gray-600">
        {product.priceCents !== null ? `$${(product.priceCents / 100).toFixed(2)}` : '—'}
      </div>
    </Link>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/public/product-card.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/product/ProductCard.tsx tests/public/product-card.test.tsx
git commit -m "feat(shop): add shared ProductCard component"
```

### Task B2: Build the `/shop` page (chips + grid + states)

**Files:**
- Create: `src/app/shop/page.tsx`
- Test: `tests/public/shop-page.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/public/shop-page.test.tsx`:

```tsx
import ShopPage from '@/app/shop/page'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

const { mockGetShopProducts, mockGetPublicIpNicknames } = vi.hoisted(() => ({
  mockGetShopProducts: vi.fn(),
  mockGetPublicIpNicknames: vi.fn()
}))

vi.mock('@/lib/square/items', () => ({ getShopProducts: mockGetShopProducts }))
vi.mock('@/lib/db/queries/ip-nicknames', () => ({
  getPublicIpNicknames: mockGetPublicIpNicknames
}))
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href as string}>{children}</a>
  )
}))

function product(id: string, name: string, categoryIds: string[] = []) {
  return { id, name, imageUrl: null, priceCents: 2500, categoryIds }
}
function nick(slug: string, nickname: string) {
  return {
    id: `N-${slug}`,
    slug,
    nickname,
    squareCategoryId: 'CAT_X',
    description: null,
    coverImageUrl: null,
    isPublic: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
}

describe('ShopPage', () => {
  it('renders a grid of PDP links for returned products', async () => {
    mockGetShopProducts.mockResolvedValueOnce([product('P1', 'Print A'), product('P2', 'Print B')])
    mockGetPublicIpNicknames.mockResolvedValueOnce([])
    render(await ShopPage())
    expect(screen.getByRole('link', { name: /print a/i })).toHaveAttribute('href', '/product/P1')
    expect(screen.getByRole('link', { name: /print b/i })).toHaveAttribute('href', '/product/P2')
  })

  it('renders IP-nickname chips linking to /category/<slug>', async () => {
    mockGetShopProducts.mockResolvedValueOnce([product('P1', 'Print A')])
    mockGetPublicIpNicknames.mockResolvedValueOnce([nick('ramen-shop', 'Ramen Shop')])
    render(await ShopPage())
    const chip = screen.getByRole('link', { name: 'Ramen Shop' })
    expect(chip).toHaveAttribute('href', '/category/ramen-shop')
  })

  it('omits the chip row when there are no public nicknames', async () => {
    mockGetShopProducts.mockResolvedValueOnce([product('P1', 'Print A')])
    mockGetPublicIpNicknames.mockResolvedValueOnce([])
    const { container } = render(await ShopPage())
    expect(container.querySelector('[data-testid="ip-chips"]')).toBeNull()
  })

  it('shows the empty state when no products', async () => {
    mockGetShopProducts.mockResolvedValueOnce([])
    mockGetPublicIpNicknames.mockResolvedValueOnce([])
    render(await ShopPage())
    expect(screen.getByText(/no products available yet/i)).toBeInTheDocument()
  })

  it('REGRESSION GUARD: never renders a raw Square category name', async () => {
    // products carry IP category IDs; the page must not surface any name.
    mockGetShopProducts.mockResolvedValueOnce([product('P1', 'Print A', ['CAT_NARUTO'])])
    mockGetPublicIpNicknames.mockResolvedValueOnce([nick('ramen-shop', 'Ramen Shop')])
    const { container } = render(await ShopPage())
    expect(container.textContent).not.toMatch(/Anime/i)
    expect(container.textContent).not.toMatch(/Naruto/i)
    expect(container.textContent).not.toMatch(/CAT_/i)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/public/shop-page.test.tsx`
Expected: FAIL — `@/app/shop/page` not found.

- [ ] **Step 3: Implement the page**

Create `src/app/shop/page.tsx`:

```tsx
import { ProductCard } from '@/components/product/ProductCard'
import { getPublicIpNicknames } from '@/lib/db/queries/ip-nicknames'
import { getShopProducts } from '@/lib/square/items'
import type { Route } from 'next'
import Link from 'next/link'

// Reads the live Square catalog + public IP nicknames at request time.
// Forcing dynamic stops Next.js from attempting build-time prerender,
// which would try to reach Square / the Postgres host during build.
// Phase 7.5/B.6 fix.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Shop | Animeniacs',
  description: 'Browse every Animeniacs drop.'
}

export default async function ShopPage(): Promise<JSX.Element> {
  const [products, nicknames] = await Promise.all([getShopProducts(), getPublicIpNicknames()])

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Shop</h1>
        <p className="mt-2 text-gray-700">Browse every Animeniacs drop.</p>
      </header>

      {nicknames.length > 0 && (
        <nav data-testid="ip-chips" aria-label="Browse by series" className="mb-8">
          <ul className="flex flex-wrap gap-2">
            {nicknames.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/category/${n.slug}` as Route}
                  className="inline-block rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-800 transition hover:bg-gray-200"
                >
                  {n.nickname}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {products.length === 0 ? (
        <section className="rounded-lg bg-gray-50 p-8 text-center">
          <p>No products available yet — check back soon.</p>
        </section>
      ) : (
        <section>
          <h2 className="sr-only">Products</h2>
          <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <li key={p.id}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/public/shop-page.test.tsx`
Expected: PASS (5 tests, including the regression guard).

- [ ] **Step 5: Commit**

```bash
git add src/app/shop/page.tsx tests/public/shop-page.test.tsx
git commit -m "feat(shop): add /shop listing page with IP-nickname chips"
```

### Task B3: Add `/shop` loading + error siblings

**Files:**
- Create: `src/app/shop/loading.tsx`
- Create: `src/app/shop/error.tsx`

These mirror the existing `category/[slug]` siblings (with the 4-col grid `/shop` uses). No test (Next.js convention files; covered by build).

- [ ] **Step 1: Create `loading.tsx`**

Create `src/app/shop/loading.tsx`:

```tsx
export default function Loading(): JSX.Element {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 h-8 w-32 animate-pulse rounded bg-gray-200" />
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="aspect-[2/3] w-full animate-pulse rounded bg-gray-200" />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `error.tsx`**

Create `src/app/shop/error.tsx`:

```tsx
'use client'

export default function ShopError({
  error,
  reset
}: {
  error: Error
  reset: () => void
}): JSX.Element {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-3 text-2xl font-semibold">Couldn't load the shop.</h1>
      <p className="mb-4 text-gray-600">Something went wrong. Try again, or come back later.</p>
      <button type="button" onClick={reset} className="rounded bg-gray-900 px-4 py-2 text-white">
        Try again
      </button>
      <details className="mt-6 text-xs text-gray-400">
        <summary>Technical details</summary>
        <code>{error.message}</code>
      </details>
    </div>
  )
}
```

- [ ] **Step 3: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/shop/loading.tsx src/app/shop/error.tsx
git commit -m "feat(shop): add /shop loading and error states"
```

### Task B4: Wire the header link (drop the `as Route` cast)

**Files:**
- Modify: `src/components/layout/Header.tsx:20`

Now that `/shop` exists, `experimental.typedRoutes` recognizes it; the cast is no longer needed.

- [ ] **Step 1: Edit the header**

In `src/components/layout/Header.tsx`, change line 20 from:

```tsx
              <Link href={'/shop' as Route} className="hover:text-gray-900">
```

to:

```tsx
              <Link href="/shop" className="hover:text-gray-900">
```

(Leave the other `as Route` casts — `/artist`, `/custom/*`, `/account` — unchanged; those routes' typed-route status is out of scope. `Route` is still imported and used by them, so keep the import.)

- [ ] **Step 2: Typecheck (this is the real assertion)**

Run: `pnpm typecheck`
Expected: clean — `href="/shop"` typechecks against the now-real route. If it errors that `/shop` is not a known route, the dev server's typed-routes manifest is stale; run `pnpm build` once to regenerate `.next/types`, then re-run typecheck.

- [ ] **Step 3: Run the existing header test + lint**

Run: `pnpm vitest run tests/header.test.tsx && pnpm lint`
Expected: header tests pass, lint clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Header.tsx
git commit -m "feat(shop): point header Shop link at the real /shop route"
```

---

## Group C — Feature gate verification

### Task C1: Full feature gate

- [ ] **Step 1: Run the full automated gate**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration`
Expected: lint clean, typecheck clean, unit tests = 255 + 12 new = **267 passing** (4 shop-items + 3 product-card + 5 shop-page), integration **75 passing** (unchanged).

- [ ] **Step 2: Confirm hard-constraint canary + IP-leak regressions**

Run:
```bash
grep -rn "goaffpro\|GoAffPro" src/ tests/
pnpm vitest run tests/public/product-detail-page.test.tsx tests/public/category-page.test.tsx tests/public/shop-page.test.tsx
```
Expected: grep prints nothing; all three public-page test files green (the two existing IP-leak guards + the new `/shop` guard).

- [ ] **Step 3: Production build (proves `/shop` route + force-dynamic)**

Run: `pnpm build`
Expected: build succeeds; route list now includes `ƒ /shop` (dynamic). 37 routes total (was 36).

---

## Group D — Cleanup: admin mobile dark-mode fix

### Task D1: Set explicit colors on the admin layout wrapper

**Files:**
- Modify: `src/app/(admin)/layout.tsx:60`

The bare `<div>{children}</div>` wraps every admin page; mobile OS dark mode renders dark-on-dark → blank. Fixing here fixes `/admin/{artists,ip-nicknames,sms-recipients}` and the setup/403 screens at once.

- [ ] **Step 1: Edit the wrapper**

In `src/app/(admin)/layout.tsx`, change line 60 from:

```tsx
  return <div>{children}</div>
```

to:

```tsx
  return (
    <div
      style={{
        colorScheme: 'light',
        color: '#111',
        background: '#fff',
        minHeight: '100vh'
      }}
    >
      {children}
    </div>
  )
}
```

(Keep everything above unchanged. The setup-required and 403 branches already render their own `<div>`s; they're fine — but if you want them dark-mode-safe too, you may add the same `color: '#111', background: '#fff'` to their inline styles. Optional.)

- [ ] **Step 2: Lint + typecheck + existing admin tests**

Run: `pnpm lint && pnpm typecheck && pnpm vitest run tests/admin/`
Expected: clean; existing admin tests still pass.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(admin)/layout.tsx"
git commit -m "fix(admin): set explicit light colors on admin layout for mobile dark mode"
```

---

## Group E — Cleanup: remove diagnostic env-logging

### Task E1: Strip the diagnostic block from `env.ts`

**Files:**
- Modify: `src/lib/env.ts:42-71`

Remove the Phase 7.5 presence/length diagnostic; keep schema + `safeParse` + throw.

- [ ] **Step 1: Replace the `parseEnv` failure branch**

In `src/lib/env.ts`, replace the entire `if (!result.success) { ... }` block (lines 42–71, the `diagKeys` array + the `console.error` presence loop + the zod-field-errors log + the throw) with:

```ts
  if (!result.success) {
    console.error('[env] Invalid environment configuration:', result.error.flatten().fieldErrors)
    throw new Error('Invalid environment configuration')
  }
```

Resulting `parseEnv` body:

```ts
function parseEnv(): Env {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('[env] Invalid environment configuration:', result.error.flatten().fieldErrors)
    throw new Error('Invalid environment configuration')
  }
  return result.data
}
```

(The single retained `console.error` logs only zod field error *names*, not env-var presence/length — the leak-prone diagnostic loop is gone.)

- [ ] **Step 2: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/env.ts
git commit -m "chore(env): remove Phase 7.5 env presence diagnostic from env.ts"
```

### Task E2: Delete the instrumentation diagnostic file

**Files:**
- Delete: `src/instrumentation.ts`

The whole file exists only for the startup env diagnostic.

- [ ] **Step 1: Delete the file**

Run: `git rm src/instrumentation.ts`

- [ ] **Step 2: Verify the app still typechecks + builds without it**

Run: `pnpm typecheck && pnpm build`
Expected: clean. Next.js does not require `instrumentation.ts`; its absence is fine. (If — and only if — the build errors that the file is referenced/required, instead restore it and reduce `register()` to `export async function register() {}`.)

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove Phase 7.5 startup env diagnostic instrumentation"
```

---

## Group F — Final verification, deploy smoke, handoff doc

### Task F1: Final automated gate

- [ ] **Step 1: Full gate**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build`
Expected: lint clean, typecheck clean, **267 unit passing**, **75 integration passing**, build clean with `ƒ /shop` present.

- [ ] **Step 2: Canary**

Run: `grep -rn "goaffpro\|GoAffPro" src/ tests/`
Expected: nothing.

### Task F2: Deploy + live smoke

> The live deploy auto-deploys from `main` on push (Coolify). Push all commits, wait for the deploy, then smoke. If the deploy ships stale code, use Coolify's **"Force rebuild without cache."**

- [ ] **Step 1: Push**

Run: `git push origin main`

- [ ] **Step 2: After deploy completes, smoke the live site**

Run:
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://dev.animeniacs.shop/shop          # expect 200
curl -s https://dev.animeniacs.shop/shop | grep -o '/product/[A-Z0-9]*' | head -1  # expect a PDP link
curl -s https://dev.animeniacs.shop/shop | grep -iE 'Naruto|Anime' || echo "no raw IP name (good)"
curl -s https://dev.animeniacs.shop/api/health                                      # expect 200 ok:true (env cleanup didn't break boot)
```
Expected: `/shop` → 200; at least one `/product/<id>` link present; no raw IP category name; health 200.

- [ ] **Step 3: Manual visual check (operator-assisted if needed)**

On a phone or mobile-emulated browser in OS **dark mode**, open `https://dev.animeniacs.shop/admin/artists`, `/admin/ip-nicknames`, `/admin/sms-recipients` (sign in via Logto). Confirm text is legible (dark text on white), not blank. Also open `/shop` and tap an IP chip → lands on a working `/category/<slug>` page; tap a product → working PDP.

### Task F3: Tag + write the handoff doc

- [ ] **Step 1: Tag the phase**

Run:
```bash
git tag phase-8-shop-listing
git push origin phase-8-shop-listing
```

- [ ] **Step 2: Write `docs/superpowers/specs/reference/phase-08-handoff.md`**

Create the Phase 8 → Phase 9 handoff doc following the structure of `docs/superpowers/specs/reference/phase-07.5-handoff.md`. It MUST include:
- **Status / TL;DR:** what shipped (`/shop` + chips + ProductCard + 2 cleanups), tag `phase-8-shop-listing`, last code SHA.
- **Required reading order** for the next agent.
- **What shipped** (file-by-file table) including the two cleanups.
- **Plan deviations** (anything that differed from this plan — e.g. if the bulk read needed a different SDK primitive, if `instrumentation.ts` had to be neutered instead of deleted, final test count if it differs from 267).
- **Hard constraints** restated (verbatim from this plan's header).
- **Verification state at handoff:** lint/typecheck/test counts, build route count, goaffpro canary 0, deploy smoke results (the §F2 curls + the manual dark-mode check).
- **What's deferred / Phase 9 candidates:** promo bar + `/admin/settings`, abandoned-cart emails (Resend), refund notifications, production cutover; plus any new deferrals (e.g. `/shop` pagination/search, refactoring the two existing grids onto `ProductCard`, footer Browse column).
- **How to verify this handoff is correct:** the baseline command block the next agent runs.

- [ ] **Step 3: Commit the handoff doc**

```bash
git add docs/superpowers/specs/reference/phase-08-handoff.md
git commit -m "docs(phase-8): Phase 8 -> Phase 9 handoff"
git push origin main
```

---

## Self-review notes (for the executor)

- **Test count math:** baseline 255 unit → +4 (`shop-items`) +3 (`product-card`) +5 (`shop-page`) = **267**. Integration unchanged at 75. If your counts differ, reconcile before tagging and note it in the handoff's deviations.
- **`unstable_cache` in tests:** the `shop-items` test mocks `next/cache` so the cached fn actually runs. If you add more `items.ts` tests, keep that mock.
- **Do NOT** import or call `getCategoryNameMap` anywhere in `/shop` code — the regression guard (B2 step 1) will catch it, but don't write it in the first place.
- **`force-dynamic` is mandatory** on `/shop` (Phase 7.5 deviation 6). Without it the Coolify build crashes.
- **Cleanups are independent** of the feature; if a cleanup step fails, it doesn't block the `/shop` commits already made.
```