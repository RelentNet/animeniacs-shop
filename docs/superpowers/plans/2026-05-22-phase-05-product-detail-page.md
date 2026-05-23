# Phase 5 — Product Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public PDP at `/product/[id]`, the public IP browse page at `/category/[slug]`, the `/admin/ip-nicknames` admin area, the supporting read-through product cache, and the related-products resolver — all matching the approved Phase 5 spec.

**Architecture:** Server-component routes (`/product/[id]`, `/category/[slug]`) hydrate from a new read-through cache (`getProductById`) backed by the existing Postgres `product_cache` table with a 1-hour TTL. Variant selection and gallery interactivity live in three small client components (`<MockupGallery>`, `<VariantPicker>`, `<PdpPurchasePanel>`). A new `ip_nicknames` table + admin CRUD lets the operator map Square IP categories to public-safe nicknames, gated by the existing Logto-backed `(admin)` layout. Implementation is split into five task groups (A–E) per Decision 13; A/B/C are independent and can run in parallel, D depends on A+B+C, E depends on A+B.

**Tech Stack:** Next.js 14 (App Router, server components), TypeScript, Drizzle ORM + postgres-js, Square SDK v44, vitest + RTL, isomorphic-dompurify, sharp (existing dep, not used by Phase 5), Logto (auth gate inherited from Phase 4).

**Predecessor:** `docs/superpowers/specs/reference/phase-04-handoff.md` (tag `phase-4-artist-system`).
**Spec:** `docs/superpowers/specs/2026-05-22-phase-05-product-detail-page-design.md` (commit `8faa0fe`).
**Resumption record (decisions, never re-litigate):** `docs/superpowers/specs/reference/phase-05-brainstorm-resumption.md`.

---

## Baseline (run BEFORE starting any task)

```sh
cd ~/code/animeniacs-shop
git describe --tags --abbrev=0   # → phase-4-artist-system
git rev-parse --short HEAD       # → 8faa0fe or descendant (the spec commit)
pnpm lint && pnpm typecheck
pnpm test                        # baseline: 63/63 passing
pnpm test:integration            # baseline: 40/40 passing
docker exec animeniacs-postgres psql -U animeniacs -d animeniacs -c "SELECT count(*) FROM artists WHERE status='active';"
# → 15
```

If any of those fail, **STOP** and investigate before touching Phase 5 code. The baseline is part of the contract.

---

## Hard constraints (still in force from Phase 4)

These are inherited and non-negotiable for every task below:

1. **No GoAffPro at runtime.** `grep -rn "goaffpro\|GoAffPro" src/ tests/` must return zero hits at the end.
2. **No `artist` Square custom attribute definition.**
3. **No new auth vendors.** New admin routes inherit `src/app/(admin)/layout.tsx`.
4. **No commission engine.**
5. **No additional Postgres tables for affiliate / commission tracking.** Phase 5 adds exactly ONE new table: `ip_nicknames`.
6. **Sandbox-first for any production write.** Phase 5 does no Square writes.
7. **IP categories never public via their literal Square name.** Test enforced.

---

## File structure overview

| Group | New / Edit | File | Lines (approx) |
|---|---|---|---|
| A | Edit | `src/lib/square/types.ts` | +12 |
| A | New | `src/lib/products/cache.ts` | ~120 |
| A | New | `tests/products/cache.test.ts` | ~120 |
| A | New | `tests/integration/product-cache-readthrough.integration.test.ts` | ~140 |
| B | Edit | `src/lib/db/schema.ts` (append ipNicknames table) | +30 |
| B | New | `drizzle/migrations/0010_*_ip_nicknames.sql` | auto-generated |
| B | New | `src/lib/db/queries/ip-nicknames.ts` | ~150 |
| B | New | `tests/integration/ip-nicknames.integration.test.ts` | ~180 |
| B | Edit | `src/lib/square/categories.ts` (append getNonArtistCategories + buildHierarchicalLabel) | +60 |
| B | New | `tests/square/non-artist-categories.test.ts` | ~80 |
| B | New | `src/app/(admin)/admin/ip-nicknames/page.tsx` | ~85 |
| B | New | `src/app/(admin)/admin/ip-nicknames/new/page.tsx` | ~20 |
| B | New | `src/app/(admin)/admin/ip-nicknames/new/actions.ts` | ~60 |
| B | New | `src/app/(admin)/admin/ip-nicknames/[id]/page.tsx` | ~40 |
| B | New | `src/app/(admin)/admin/ip-nicknames/[id]/actions.ts` | ~70 |
| B | New | `src/app/(admin)/admin/ip-nicknames/_components/IpNicknameForm.tsx` | ~180 |
| B | New | `src/app/(admin)/admin/ip-nicknames/_components/SquareIpCategoryPicker.tsx` | ~30 |
| B | New | `src/app/(admin)/admin/ip-nicknames/_components/formData.ts` | ~45 |
| B | New | `src/app/(admin)/admin/ip-nicknames/_components/validation.ts` | ~55 |
| B | New | `tests/admin/ip-nicknames-actions.test.ts` | ~160 |
| C | New | `public/images/mockup-scenes/style1.webp` | binary |
| C | New | `public/images/mockup-scenes/style2.webp` | binary |
| C | New | `public/images/mockup-scenes/style3.webp` | binary |
| C | New | `public/images/mockup-scenes/style4.webp` | binary |
| C | New | `src/lib/mockup-scenes.ts` | ~70 |
| C | New | `src/components/product/MockupGallery.tsx` | ~140 |
| C | New | `src/components/product/MockupGallery.module.css` | ~80 |
| C | New | `tests/public/mockup-gallery.test.tsx` | ~140 |
| C | New | `src/components/product/VariantPicker.tsx` | ~110 |
| C | New | `tests/public/variant-picker.test.tsx` | ~140 |
| D | New | `src/lib/site-copy.ts` | ~10 |
| D | New | `src/lib/sanitize-html.ts` | ~50 |
| D | New | `tests/public/sanitize-html.test.ts` | ~100 |
| D | New | `src/lib/categories/related.ts` | ~70 |
| D | New | `tests/categories/related.test.ts` | ~120 |
| D | New | `src/components/product/PdpPurchasePanel.tsx` | ~110 |
| D | New | `tests/public/pdp-purchase-panel.test.tsx` | ~120 |
| D | Edit | `next.config.mjs` (add S3 hostnames) | +6 |
| D | Edit | `src/app/product/[id]/page.tsx` (replace stub) | ~110 |
| D | New | `src/app/product/[id]/loading.tsx` | ~25 |
| D | New | `src/app/product/[id]/error.tsx` | ~25 |
| D | New | `tests/public/product-detail-page.test.tsx` | ~150 |
| E | New | `src/lib/categories/index.ts` | ~15 |
| E | New | `src/app/category/[slug]/page.tsx` | ~90 |
| E | New | `src/app/category/[slug]/loading.tsx` | ~20 |
| E | New | `src/app/category/[slug]/error.tsx` | ~25 |
| E | New | `tests/public/category-page.test.tsx` | ~150 |

---

## Execution order

```
A ──┐
B ──┼─► D ─► (final gate + tag)
C ──┘   │
        │
B ──┐   │
A ──┴─► E ─► (covered by same final gate)
```

A, B, C can be worked in parallel by different sub-agents (or sequentially in any order) because they have no shared files. **D requires A+B+C all merged.** **E requires A+B merged** (E doesn't depend on C).

The plan presents the groups in order A → B → C → D → E. Subagent-driven execution can parallelize per the dependency graph above; inline execution should follow the document order.

---

## Task Group A — Catalog read layer

Ships `getProductById()` + read-through cache + `denormalize()` + the type extensions to `CachedProduct` / `CachedVariation`. No UI work. After Group A merges, plans C and D can consume the new types.

**Files:**
- Modify: `src/lib/square/types.ts`
- Create: `src/lib/products/cache.ts`
- Create: `tests/products/cache.test.ts`
- Create: `tests/integration/product-cache-readthrough.integration.test.ts`

### Task A.1: Extend CachedProduct + CachedVariation types

- [ ] **Step 1: Edit `src/lib/square/types.ts`**

Add the two new interfaces before `CachedProduct`, then extend `CachedProduct` and `CachedVariation`. Final file should read:

```ts
import 'server-only'

export interface CachedMoney {
  amount: number
  currency: string
}

/** One option-value within an ITEM_OPTION axis (e.g. "Small" within the Size axis). */
export interface CachedItemOptionValue {
  id: string
  name: string
}

/** One ITEM_OPTION axis on the item (e.g. Size with its values). */
export interface CachedItemOption {
  id: string
  name: string
  values: CachedItemOptionValue[]
}

export interface CachedVariation {
  id: string
  name: string
  price: CachedMoney | null
  sku: string | null
  /** Option-value IDs picked for this variation. Empty array for variations with no options. */
  optionValueIds: string[]
}

export interface CachedProduct {
  id: string
  name: string
  description: string | null
  descriptionHtml: string | null
  variations: CachedVariation[]
  images: string[]
  categoryIds: string[]
  /** ITEM_OPTION axes on this item. Empty array for items with no options. */
  itemOptions: CachedItemOption[]
  updatedAt: string // ISO-8601 from Square
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: clean (nothing consumes these types yet — they'll fail-fast when Group C/D land if shapes drift).

- [ ] **Step 3: Commit**

```bash
git add src/lib/square/types.ts
git commit -m "Phase 5/A: extend CachedProduct + CachedVariation with item-option projection"
```

### Task A.2: Write the failing unit test for denormalize()

- [ ] **Step 1: Create `tests/products/cache.test.ts`**

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mocks must be hoisted; declare before importing the SUT.
vi.mock('@/lib/db/client', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn()
  }
}))
vi.mock('@/lib/square/client', () => ({
  getSquareClient: vi.fn()
}))

describe('denormalize', () => {
  it('projects itemOptions + optionValueIds from a Square SDK item', async () => {
    const { denormalize } = await import('@/lib/products/cache')

    const sdkItem = {
      id: 'ITEM_1',
      itemData: {
        name: 'Test Print',
        description: 'plain',
        descriptionHtml: '<p>plain</p>',
        categories: [{ id: 'CAT_1' }],
        imageIds: ['IMG_1'],
        itemOptions: [{ itemOptionId: 'OPT_SIZE' }, { itemOptionId: 'OPT_MEDIA' }],
        variations: [
          {
            id: 'VAR_1',
            itemVariationData: {
              name: 'Small / Acrylic',
              sku: 'TP-S-AC',
              pricingType: 'FIXED_PRICING',
              priceMoney: { amount: 2500, currency: 'USD' },
              itemOptionValues: [
                { itemOptionId: 'OPT_SIZE', itemOptionValueId: 'VAL_SM' },
                { itemOptionId: 'OPT_MEDIA', itemOptionValueId: 'VAL_AC' }
              ]
            }
          }
        ]
      }
    }

    const optionDefs = new Map([
      ['OPT_SIZE', { id: 'OPT_SIZE', name: 'Size', values: [{ id: 'VAL_SM', name: 'Small' }] }],
      ['OPT_MEDIA', { id: 'OPT_MEDIA', name: 'Media', values: [{ id: 'VAL_AC', name: 'Acrylic' }] }]
    ])
    const imageUrlById = new Map([['IMG_1', 'https://cdn.example/img1.jpg']])

    const product = denormalize(sdkItem, { optionDefs, imageUrlById })

    expect(product.id).toBe('ITEM_1')
    expect(product.itemOptions).toHaveLength(2)
    expect(product.itemOptions[0]).toEqual({
      id: 'OPT_SIZE',
      name: 'Size',
      values: [{ id: 'VAL_SM', name: 'Small' }]
    })
    expect(product.variations).toHaveLength(1)
    expect(product.variations[0].optionValueIds).toEqual(['VAL_SM', 'VAL_AC'])
    expect(product.variations[0].price).toEqual({ amount: 2500, currency: 'USD' })
    expect(product.images).toEqual(['https://cdn.example/img1.jpg'])
    expect(product.categoryIds).toEqual(['CAT_1'])
  })

  it('returns empty itemOptions + empty optionValueIds for items with no options', async () => {
    const { denormalize } = await import('@/lib/products/cache')

    const sdkItem = {
      id: 'ITEM_2',
      itemData: {
        name: 'Simple',
        categories: [],
        imageIds: [],
        variations: [
          {
            id: 'VAR_A',
            itemVariationData: {
              name: 'Default',
              pricingType: 'FIXED_PRICING',
              priceMoney: { amount: 1000, currency: 'USD' }
            }
          }
        ]
      }
    }

    const product = denormalize(sdkItem, {
      optionDefs: new Map(),
      imageUrlById: new Map()
    })

    expect(product.itemOptions).toEqual([])
    expect(product.variations[0].optionValueIds).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test (should fail — module doesn't exist yet)**

Run: `pnpm vitest run tests/products/cache.test.ts`
Expected: FAIL with "Cannot find module '@/lib/products/cache'"

### Task A.3: Implement denormalize() + getProductById() in cache.ts

- [ ] **Step 1: Create `src/lib/products/cache.ts`**

```ts
import 'server-only'
import { db } from '@/lib/db/client'
import { productCache } from '@/lib/db/schema'
import { getSquareClient } from '@/lib/square/client'
import type {
  CachedItemOption,
  CachedItemOptionValue,
  CachedMoney,
  CachedProduct,
  CachedVariation
} from '@/lib/square/types'
import { eq } from 'drizzle-orm'

/**
 * Read-through cache for single-product fetches used by the PDP.
 *
 * Flow:
 *   1. SELECT from product_cache by catalog_item_id.
 *   2. If row exists AND updated_at within TTL → return row.data as CachedProduct.
 *   3. Else: fetch fresh from Square (item + referenced IMAGE + ITEM_OPTION
 *      objects), denormalize, UPSERT into product_cache, return.
 *   4. If Square returns nothing (deleted / not-found) → return null; leave
 *      any stale cache row in place (acceptable v1 per Decision 2).
 */

/** 1 hour. Tune from here post-launch — single source of truth for the TTL. */
export const PRODUCT_CACHE_TTL_MS = 60 * 60 * 1000

interface OptionDef {
  id: string
  name: string
  values: { id: string; name: string }[]
}

interface DenormalizeContext {
  optionDefs: Map<string, OptionDef>
  imageUrlById: Map<string, string>
}

/**
 * Projects the raw Square SDK item into the cached shape we store.
 * Exported so unit tests can exercise the projection logic in isolation.
 */
// biome-ignore lint/suspicious/noExplicitAny: SDK union is awkward
export function denormalize(sdkItem: any, ctx: DenormalizeContext): CachedProduct {
  const itemData = sdkItem.itemData ?? {}

  const images: string[] = (itemData.imageIds ?? [])
    .map((id: string) => ctx.imageUrlById.get(id))
    .filter((u: string | undefined): u is string => typeof u === 'string')

  const categoryIds: string[] = (itemData.categories ?? [])
    // biome-ignore lint/suspicious/noExplicitAny: SDK
    .map((c: any) => c.id)
    .filter((id: unknown): id is string => typeof id === 'string')

  const itemOptionIds: string[] = (itemData.itemOptions ?? [])
    // biome-ignore lint/suspicious/noExplicitAny: SDK
    .map((o: any) => o.itemOptionId)
    .filter((id: unknown): id is string => typeof id === 'string')

  const itemOptions: CachedItemOption[] = itemOptionIds
    .map((id) => ctx.optionDefs.get(id))
    .filter((d): d is OptionDef => d !== undefined)
    .map((d) => ({
      id: d.id,
      name: d.name,
      values: d.values.map((v) => ({ id: v.id, name: v.name }) satisfies CachedItemOptionValue)
    }))

  // biome-ignore lint/suspicious/noExplicitAny: SDK
  const sdkVariations: any[] = itemData.variations ?? []
  const variations: CachedVariation[] = sdkVariations.map((v) => {
    const vd = v.itemVariationData ?? {}
    let price: CachedMoney | null = null
    if (vd.pricingType === 'FIXED_PRICING' && vd.priceMoney?.amount !== undefined) {
      const raw = vd.priceMoney.amount
      const amount = typeof raw === 'bigint' ? Number(raw) : Number(raw)
      price = { amount, currency: vd.priceMoney.currency ?? 'USD' }
    }
    // biome-ignore lint/suspicious/noExplicitAny: SDK
    const optionValueIds: string[] = (vd.itemOptionValues ?? [])
      // biome-ignore lint/suspicious/noExplicitAny: SDK
      .map((ov: any) => ov.itemOptionValueId)
      .filter((id: unknown): id is string => typeof id === 'string')

    return {
      id: v.id,
      name: vd.name ?? '(unnamed)',
      price,
      sku: vd.sku ?? null,
      optionValueIds
    }
  })

  return {
    id: sdkItem.id,
    name: itemData.name ?? '(unnamed)',
    description: itemData.description ?? null,
    descriptionHtml: itemData.descriptionHtml ?? null,
    variations,
    images,
    categoryIds,
    itemOptions,
    updatedAt: sdkItem.updatedAt ?? new Date().toISOString()
  }
}

/** Fetch a single item from Square + referenced IMAGE + ITEM_OPTION objects, then denormalize. */
async function refreshFromSquare(itemId: string): Promise<CachedProduct | null> {
  const client = getSquareClient()

  // 1. Fetch the item with related objects so we get IMAGE + ITEM_OPTION in one round trip.
  let itemResp: unknown
  try {
    itemResp = await client.catalog.object.get({
      objectId: itemId,
      includeRelatedObjects: true
    })
  } catch (_e) {
    // 404 / network: treat as miss.
    return null
  }
  // biome-ignore lint/suspicious/noExplicitAny: SDK envelope
  const env = itemResp as any
  const sdkItem = env.object ?? env.result?.object
  if (!sdkItem || sdkItem.type !== 'ITEM') return null
  // biome-ignore lint/suspicious/noExplicitAny: SDK
  const related: any[] = env.relatedObjects ?? env.result?.relatedObjects ?? []

  const imageUrlById = new Map<string, string>()
  const optionDefs = new Map<string, OptionDef>()
  for (const r of related) {
    if (r.type === 'IMAGE' && typeof r.imageData?.url === 'string') {
      imageUrlById.set(r.id, r.imageData.url)
    } else if (r.type === 'ITEM_OPTION') {
      const od = r.itemOptionData ?? {}
      // biome-ignore lint/suspicious/noExplicitAny: SDK
      const values = (od.values ?? []).map((v: any) => ({
        id: v.id,
        name: v.itemOptionValueData?.name ?? '(unnamed)'
      }))
      optionDefs.set(r.id, {
        id: r.id,
        name: od.name ?? '(unnamed)',
        values
      })
    }
  }

  return denormalize(sdkItem, { optionDefs, imageUrlById })
}

interface CacheRow {
  data: CachedProduct
  updatedAt: Date
}

async function readFresh(itemId: string): Promise<CacheRow | null> {
  const rows = await db
    .select()
    .from(productCache)
    .where(eq(productCache.catalogItemId, itemId))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  const age = Date.now() - row.updatedAt.getTime()
  if (age > PRODUCT_CACHE_TTL_MS) return null
  return { data: row.data as CachedProduct, updatedAt: row.updatedAt }
}

async function writeCache(product: CachedProduct): Promise<void> {
  await db
    .insert(productCache)
    .values({ catalogItemId: product.id, data: product, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: productCache.catalogItemId,
      set: { data: product, updatedAt: new Date() }
    })
}

/**
 * Public PDP read path. Returns null when no item exists in Square AND
 * no fresh cache row covers it. A stale cache row past TTL is treated
 * as a miss and triggers re-fetch.
 */
export async function getProductById(itemId: string): Promise<CachedProduct | null> {
  if (!itemId) return null
  const fresh = await readFresh(itemId)
  if (fresh) return fresh.data
  const refreshed = await refreshFromSquare(itemId)
  if (!refreshed) return null
  await writeCache(refreshed)
  return refreshed
}

/**
 * Test-only helper: drops the cache row for an item so the next
 * getProductById() forces a Square fetch. Exported under a __ name
 * to signal "do not use in production code."
 */
export async function __forceRefresh(itemId: string): Promise<void> {
  await db.delete(productCache).where(eq(productCache.catalogItemId, itemId))
}
```

- [ ] **Step 2: Run the unit tests (should pass)**

Run: `pnpm vitest run tests/products/cache.test.ts`
Expected: 2/2 pass.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/products/cache.ts tests/products/cache.test.ts
git commit -m "Phase 5/A: getProductById read-through cache + denormalize() unit tests"
```

### Task A.4: Write the failing integration test for read-through cache

- [ ] **Step 1: Create `tests/integration/product-cache-readthrough.integration.test.ts`**

```ts
import { db } from '@/lib/db/client'
import { productCache } from '@/lib/db/schema'
import {
  PRODUCT_CACHE_TTL_MS,
  __forceRefresh,
  getProductById
} from '@/lib/products/cache'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { testNamespace } from '../helpers/db'

const NS = testNamespace('pcache')

// Mock the Square client at module level. Each test sets `mockGet` to control
// the response.
const mockGet = vi.fn()
vi.mock('@/lib/square/client', () => ({
  getSquareClient: () => ({ catalog: { object: { get: mockGet } } })
}))

function sdkResponse(itemId: string, name = 'Test Item') {
  return {
    object: {
      id: itemId,
      type: 'ITEM',
      updatedAt: '2026-05-22T00:00:00Z',
      itemData: {
        name,
        description: null,
        descriptionHtml: null,
        categories: [],
        imageIds: [],
        variations: []
      }
    },
    relatedObjects: []
  }
}

afterAll(async () => {
  await db.delete(productCache).where(sql`${productCache.catalogItemId} LIKE ${`${NS}%`}`)
})

beforeEach(() => {
  mockGet.mockReset()
})

describe('getProductById read-through cache (integration)', () => {
  it('cold cache → calls Square → writes row → second call reads from cache', async () => {
    const id = `${NS}_cold`
    mockGet.mockResolvedValueOnce(sdkResponse(id, 'Cold'))

    const first = await getProductById(id)
    expect(first?.name).toBe('Cold')
    expect(mockGet).toHaveBeenCalledTimes(1)

    const rows = await db.select().from(productCache).where(eq(productCache.catalogItemId, id))
    expect(rows).toHaveLength(1)

    const second = await getProductById(id)
    expect(second?.name).toBe('Cold')
    expect(mockGet).toHaveBeenCalledTimes(1) // no second Square call
  })

  it('stale row past TTL → re-fetches and overwrites', async () => {
    const id = `${NS}_stale`
    mockGet.mockResolvedValueOnce(sdkResponse(id, 'Old'))
    await getProductById(id)

    // Push updated_at back further than the TTL.
    const olderThanTtl = new Date(Date.now() - PRODUCT_CACHE_TTL_MS - 1000)
    await db
      .update(productCache)
      .set({ updatedAt: olderThanTtl })
      .where(eq(productCache.catalogItemId, id))

    mockGet.mockResolvedValueOnce(sdkResponse(id, 'New'))
    const refreshed = await getProductById(id)
    expect(refreshed?.name).toBe('New')
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('Square returns not-found → returns null without writing cache', async () => {
    const id = `${NS}_missing`
    mockGet.mockResolvedValueOnce({ object: null })
    const result = await getProductById(id)
    expect(result).toBeNull()
    const rows = await db.select().from(productCache).where(eq(productCache.catalogItemId, id))
    expect(rows).toHaveLength(0)
  })

  it('Square throws → returns null and does not pollute cache', async () => {
    const id = `${NS}_throw`
    mockGet.mockRejectedValueOnce(new Error('boom'))
    const result = await getProductById(id)
    expect(result).toBeNull()
    const rows = await db.select().from(productCache).where(eq(productCache.catalogItemId, id))
    expect(rows).toHaveLength(0)
  })

  it('__forceRefresh drops the row', async () => {
    const id = `${NS}_force`
    mockGet.mockResolvedValueOnce(sdkResponse(id, 'A'))
    await getProductById(id)
    await __forceRefresh(id)
    const rows = await db.select().from(productCache).where(eq(productCache.catalogItemId, id))
    expect(rows).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm test:integration tests/integration/product-cache-readthrough.integration.test.ts`
Expected: 5/5 pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/product-cache-readthrough.integration.test.ts
git commit -m "Phase 5/A: integration tests for product cache read-through"
```

### Task A.5: Group A acceptance gate

- [ ] **Step 1: Run full automated gate**

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
```

Expected:
- lint clean
- typecheck clean
- unit tests: 63 (baseline) + 2 (A.2) = 65 passing
- integration tests: 40 (baseline) + 5 (A.4) = 45 passing

If any fail, stop and fix before continuing.

- [ ] **Step 2: Group A done**

No additional commit; A.1–A.4 each committed individually. Group A is complete.

---

## Task Group B — `ip_nicknames` schema + admin CRUD

Ships the new Postgres table, query helpers, the `/admin/ip-nicknames` admin pages, and the Square non-artist category helpers. Mirrors `/admin/artists` exactly.

### Task B.1: Append ipNicknames table to schema

- [ ] **Step 1: Edit `src/lib/db/schema.ts` — add the new table after `artists`**

Append at the end of the file (after `export type NewArtist = ...`):

```ts
export const ipNicknames = pgTable('ip_nicknames', {
  id: uuid('id').primaryKey().defaultRandom(),
  squareCategoryId: text('square_category_id').notNull().unique(),
  slug: text('slug').notNull().unique(),
  nickname: text('nickname').notNull(),
  description: text('description'),
  // Nullable in Phase 5; no UI populates this column. Future phases add upload UI.
  coverImageUrl: text('cover_image_url'),
  isPublic: boolean('is_public').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

export type IpNickname = typeof ipNicknames.$inferSelect
export type NewIpNickname = typeof ipNicknames.$inferInsert
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file appears at `drizzle/migrations/0010_<random>_*.sql` containing `CREATE TABLE "ip_nicknames"` and the unique constraints. Inspect it; do not commit if anything else changed.

- [ ] **Step 3: Apply the migration**

Run: `pnpm db:migrate`
Expected: clean output, `ip_nicknames` table now exists in local Postgres.

Verify:
```sh
docker exec animeniacs-postgres psql -U animeniacs -d animeniacs -c "\d ip_nicknames"
```
Should show all 9 columns + the two unique indexes.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Commit schema + migration**

```bash
git add src/lib/db/schema.ts drizzle/migrations/0010_*.sql drizzle/meta/
git commit -m "Phase 5/B: ip_nicknames table (schema + migration)"
```

### Task B.2: Write the failing integration test for ip-nicknames queries

- [ ] **Step 1: Create `tests/integration/ip-nicknames.integration.test.ts`**

```ts
import { db } from '@/lib/db/client'
import {
  createIpNickname,
  getAllIpNicknames,
  getIpNicknameByCategoryId,
  getIpNicknameById,
  getIpNicknameBySlug,
  getPublicIpNicknames,
  updateIpNickname
} from '@/lib/db/queries/ip-nicknames'
import { ipNicknames } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { testNamespace } from '../helpers/db'

const NS = testNamespace('ipnick')
// Slug has no underscores allowed.
const SLUG_NS = NS.replace(/_/g, '-')

function input(suffix: string, overrides: Record<string, unknown> = {}) {
  return {
    slug: `${SLUG_NS}-${suffix}`,
    nickname: `Nickname ${suffix}`,
    squareCategoryId: `${NS}_cat_${suffix}`,
    description: null,
    isPublic: true,
    ...overrides
  }
}

afterAll(async () => {
  await db.delete(ipNicknames).where(sql`${ipNicknames.slug} LIKE ${`${SLUG_NS}%`}`)
})

describe('ip_nicknames query helpers', () => {
  it('createIpNickname inserts a row with generated id + timestamps', async () => {
    const row = await createIpNickname(input('create'))
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(row.createdAt).toBeInstanceOf(Date)
    expect(row.updatedAt).toBeInstanceOf(Date)
    expect(row.slug).toBe(`${SLUG_NS}-create`)
    expect(row.isPublic).toBe(true)
    expect(row.coverImageUrl).toBeNull()
  })

  it('getIpNicknameBySlug returns the row when slug exists', async () => {
    await createIpNickname(input('byslug'))
    const found = await getIpNicknameBySlug(`${SLUG_NS}-byslug`)
    expect(found?.slug).toBe(`${SLUG_NS}-byslug`)
  })

  it('getIpNicknameBySlug returns undefined when slug missing', async () => {
    const found = await getIpNicknameBySlug(`${SLUG_NS}-missing-xyz`)
    expect(found).toBeUndefined()
  })

  it('getIpNicknameByCategoryId finds by Square category id', async () => {
    await createIpNickname(input('bycat'))
    const found = await getIpNicknameByCategoryId(`${NS}_cat_bycat`)
    expect(found?.slug).toBe(`${SLUG_NS}-bycat`)
  })

  it('getIpNicknameById finds by primary key', async () => {
    const created = await createIpNickname(input('byid'))
    const found = await getIpNicknameById(created.id)
    expect(found?.id).toBe(created.id)
  })

  it('getPublicIpNicknames excludes is_public=false rows', async () => {
    await createIpNickname(input('pub-a'))
    await createIpNickname(input('pub-b', { isPublic: false }))
    const pub = await getPublicIpNicknames()
    const mine = pub.filter((n) => n.slug.startsWith(SLUG_NS))
    expect(mine.find((n) => n.slug === `${SLUG_NS}-pub-a`)).toBeDefined()
    expect(mine.find((n) => n.slug === `${SLUG_NS}-pub-b`)).toBeUndefined()
  })

  it('getAllIpNicknames includes is_public=false rows', async () => {
    await createIpNickname(input('all-c', { isPublic: false }))
    const all = await getAllIpNicknames()
    const mine = all.filter((n) => n.slug.startsWith(SLUG_NS))
    expect(mine.find((n) => n.slug === `${SLUG_NS}-all-c`)).toBeDefined()
  })

  it('updateIpNickname patches fields and bumps updated_at', async () => {
    const created = await createIpNickname(input('upd'))
    const before = created.updatedAt
    await new Promise((r) => setTimeout(r, 10))
    const updated = await updateIpNickname(created.id, { nickname: 'New Name' })
    expect(updated.nickname).toBe('New Name')
    expect(updated.updatedAt.getTime()).toBeGreaterThan(before.getTime())
  })

  it('unique constraint on slug rejects duplicates', async () => {
    await createIpNickname(input('uniq-slug'))
    await expect(
      createIpNickname(input('uniq-slug', { squareCategoryId: `${NS}_cat_uniq-slug-2` }))
    ).rejects.toThrow()
  })

  it('unique constraint on square_category_id rejects duplicates', async () => {
    await createIpNickname(input('uniq-cat'))
    await expect(
      createIpNickname(input('uniq-cat-2', { squareCategoryId: `${NS}_cat_uniq-cat` }))
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run — should fail because queries module doesn't exist**

Run: `pnpm test:integration tests/integration/ip-nicknames.integration.test.ts`
Expected: FAIL (`Cannot find module '@/lib/db/queries/ip-nicknames'`).

### Task B.3: Implement the ip-nicknames query helpers

- [ ] **Step 1: Create `src/lib/db/queries/ip-nicknames.ts`**

```ts
import 'server-only'
import { db } from '@/lib/db/client'
import { type IpNickname, type NewIpNickname, ipNicknames } from '@/lib/db/schema'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'

/**
 * Zod schema for runtime validation. Slug regex disallows dot
 * (artist slugs allow dot for handles like `Bxnny.Arts`; IP nicknames
 * don't need that and the URL reads cleaner without).
 */
export const IpNicknameInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'lowercase letters, digits, and hyphen only'),
  nickname: z.string().min(1).max(120),
  squareCategoryId: z.string().min(1),
  description: z.string().max(2000).nullable().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  isPublic: z.boolean().default(true)
})

export type IpNicknameInput = z.input<typeof IpNicknameInputSchema>
export type IpNicknameInputParsed = z.output<typeof IpNicknameInputSchema>

export async function getAllIpNicknames(): Promise<IpNickname[]> {
  return db.select().from(ipNicknames).orderBy(asc(ipNicknames.nickname))
}

export async function getPublicIpNicknames(): Promise<IpNickname[]> {
  return db
    .select()
    .from(ipNicknames)
    .where(eq(ipNicknames.isPublic, true))
    .orderBy(asc(ipNicknames.nickname))
}

export async function getIpNicknameBySlug(slug: string): Promise<IpNickname | undefined> {
  const rows = await db.select().from(ipNicknames).where(eq(ipNicknames.slug, slug)).limit(1)
  return rows[0]
}

export async function getIpNicknameByCategoryId(
  squareCategoryId: string
): Promise<IpNickname | undefined> {
  const rows = await db
    .select()
    .from(ipNicknames)
    .where(eq(ipNicknames.squareCategoryId, squareCategoryId))
    .limit(1)
  return rows[0]
}

export async function getIpNicknameById(id: string): Promise<IpNickname | undefined> {
  const rows = await db.select().from(ipNicknames).where(eq(ipNicknames.id, id)).limit(1)
  return rows[0]
}

export async function createIpNickname(input: IpNicknameInput): Promise<IpNickname> {
  const parsed = IpNicknameInputSchema.parse(input)
  const [row] = await db
    .insert(ipNicknames)
    .values(parsed satisfies NewIpNickname)
    .returning()
  return row
}

export async function updateIpNickname(
  id: string,
  input: Partial<IpNicknameInput>
): Promise<IpNickname> {
  const parsed = IpNicknameInputSchema.partial().parse(input)
  const [row] = await db
    .update(ipNicknames)
    .set({ ...parsed, updatedAt: new Date() })
    .where(eq(ipNicknames.id, id))
    .returning()
  if (!row) throw new Error(`ip_nickname ${id} not found`)
  return row
}
```

- [ ] **Step 2: Run integration tests**

Run: `pnpm test:integration tests/integration/ip-nicknames.integration.test.ts`
Expected: 10/10 pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/queries/ip-nicknames.ts tests/integration/ip-nicknames.integration.test.ts
git commit -m "Phase 5/B: ip_nicknames query helpers + integration tests"
```

### Task B.4: Write failing unit test for getNonArtistCategories

- [ ] **Step 1: Create `tests/square/non-artist-categories.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest'

// Mock the underlying listCategoriesFromSquare so we control the universe.
const mockList = vi.fn()
vi.mock('@/lib/square/categories', async (importOriginal) => {
  const mod: typeof import('@/lib/square/categories') = await importOriginal()
  return {
    ...mod,
    listCategoriesFromSquare: mockList
  }
})

describe('getNonArtistCategories', () => {
  it('excludes the Artist parent and every Artist sub-category', async () => {
    mockList.mockResolvedValue([
      { id: 'ART_PARENT', name: 'Artist', parentCategoryId: null },
      { id: 'ART_KID_1', name: 'Bxnny.Arts', parentCategoryId: 'ART_PARENT' },
      { id: 'ART_KID_2', name: 'Sketched_Reality', parentCategoryId: 'ART_PARENT' },
      { id: 'IP_TOP', name: 'Anime', parentCategoryId: null },
      { id: 'IP_KID_1', name: 'Naruto', parentCategoryId: 'IP_TOP' },
      { id: 'IP_KID_2', name: 'One Piece', parentCategoryId: 'IP_TOP' }
    ])

    const { getNonArtistCategories } = await import('@/lib/square/categories')
    const result = await getNonArtistCategories()
    const ids = result.map((c) => c.id).sort()
    expect(ids).toEqual(['IP_KID_1', 'IP_KID_2', 'IP_TOP'])
  })

  it('returns everything when no Artist parent exists (defensive)', async () => {
    mockList.mockResolvedValue([
      { id: 'A', name: 'Anime', parentCategoryId: null },
      { id: 'B', name: 'Naruto', parentCategoryId: 'A' }
    ])
    const { getNonArtistCategories } = await import('@/lib/square/categories')
    const result = await getNonArtistCategories()
    expect(result.map((c) => c.id).sort()).toEqual(['A', 'B'])
  })
})

describe('buildHierarchicalLabel', () => {
  it('builds "Anime > Naruto" for a 2-level category', async () => {
    const { buildHierarchicalLabel } = await import('@/lib/square/categories')
    const allById = new Map([
      ['A', { id: 'A', name: 'Anime', parentCategoryId: null }],
      ['B', { id: 'B', name: 'Naruto', parentCategoryId: 'A' }]
    ])
    expect(buildHierarchicalLabel(allById.get('B')!, allById)).toBe('Anime > Naruto')
  })

  it('returns just the name for a root-level category', async () => {
    const { buildHierarchicalLabel } = await import('@/lib/square/categories')
    const allById = new Map([['A', { id: 'A', name: 'Anime', parentCategoryId: null }]])
    expect(buildHierarchicalLabel(allById.get('A')!, allById)).toBe('Anime')
  })

  it('breaks cycles (defensive against malformed data)', async () => {
    const { buildHierarchicalLabel } = await import('@/lib/square/categories')
    const allById = new Map([
      ['A', { id: 'A', name: 'A', parentCategoryId: 'B' }],
      ['B', { id: 'B', name: 'B', parentCategoryId: 'A' }]
    ])
    // Should terminate without throwing; exact format doesn't matter,
    // just that it ends.
    const label = buildHierarchicalLabel(allById.get('A')!, allById)
    expect(typeof label).toBe('string')
  })
})
```

- [ ] **Step 2: Run — should fail**

Run: `pnpm vitest run tests/square/non-artist-categories.test.ts`
Expected: FAIL (`getNonArtistCategories` / `buildHierarchicalLabel` not exported).

### Task B.5: Implement getNonArtistCategories + buildHierarchicalLabel

- [ ] **Step 1: Append to `src/lib/square/categories.ts`** (at the end of the file)

```ts
/**
 * Every category that is NOT the Artist parent and NOT one of its
 * children. Used by the IP-nicknames admin to assign nicknames to
 * non-artist categories.
 *
 * If the Artist parent doesn't exist (test fixture / fresh sandbox),
 * returns the full list — defensive, matches the principle that
 * absence-of-Artist means there are no Artist sub-categories to exclude.
 */
export async function getNonArtistCategories(): Promise<SquareCategory[]> {
  const all = await listCategoriesFromSquare()
  const parentId = all.find(
    (c) => c.name === ARTIST_PARENT_CATEGORY_NAME && c.parentCategoryId === null
  )?.id
  if (!parentId) return all
  return all.filter((c) => c.id !== parentId && c.parentCategoryId !== parentId)
}

/**
 * Walks parentCategoryId up the chain, joining names with ` > `.
 * Used to build hierarchical labels for the IP category picker.
 * Detects cycles (returns the partial chain it has so far).
 */
export function buildHierarchicalLabel(
  category: SquareCategory,
  allById: Map<string, SquareCategory>
): string {
  const parts: string[] = [category.name]
  const seen = new Set<string>([category.id])
  let current = category
  while (current.parentCategoryId) {
    if (seen.has(current.parentCategoryId)) break // cycle guard
    const parent = allById.get(current.parentCategoryId)
    if (!parent) break
    parts.unshift(parent.name)
    seen.add(parent.id)
    current = parent
  }
  return parts.join(' > ')
}
```

- [ ] **Step 2: Run the unit tests**

Run: `pnpm vitest run tests/square/non-artist-categories.test.ts`
Expected: 5/5 pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/square/categories.ts tests/square/non-artist-categories.test.ts
git commit -m "Phase 5/B: getNonArtistCategories + buildHierarchicalLabel helpers"
```

### Task B.6: Create the SquareIpCategoryPicker server-side loader

- [ ] **Step 1: Create `src/app/(admin)/admin/ip-nicknames/_components/SquareIpCategoryPicker.tsx`**

```tsx
import {
  buildHierarchicalLabel,
  getNonArtistCategories,
  listCategoriesFromSquare
} from '@/lib/square/categories'

export interface SquareIpCategoryOption {
  id: string
  /** Hierarchical label like "Anime > Naruto". */
  label: string
}

/**
 * Server-side fetch of the dropdown options. Called from server
 * components and passed to the client form as a prop.
 *
 * `alreadyMappedCategoryIds` lets the form exclude categories that
 * already have an ip_nicknames row (so the operator can't double-map).
 * On the edit page, the current row's category id is re-included so
 * the form's pre-filled value remains selectable.
 */
export async function loadIpCategoryOptions(
  alreadyMappedCategoryIds: Set<string> = new Set()
): Promise<SquareIpCategoryOption[]> {
  const [all, nonArtist] = await Promise.all([
    listCategoriesFromSquare(),
    getNonArtistCategories()
  ])
  const allById = new Map(all.map((c) => [c.id, c]))
  return nonArtist
    .filter((c) => !alreadyMappedCategoryIds.has(c.id))
    .map((c) => ({ id: c.id, label: buildHierarchicalLabel(c, allById) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/(admin)/admin/ip-nicknames/_components/SquareIpCategoryPicker.tsx
git commit -m "Phase 5/B: SquareIpCategoryPicker loader"
```

### Task B.7: Create the IpNicknameForm + formData + validation modules

- [ ] **Step 1: Create `src/app/(admin)/admin/ip-nicknames/_components/IpNicknameForm.tsx`**

```tsx
'use client'

import type { IpNickname } from '@/lib/db/schema'
import { useFormState } from 'react-dom'
import type { SquareIpCategoryOption } from './SquareIpCategoryPicker'

export interface IpNicknameFormError {
  message: string
  fields?: Partial<Record<string, string>>
}

export type IpNicknameFormState = { error?: IpNicknameFormError } | undefined

export interface IpNicknameFormProps {
  action: (prev: IpNicknameFormState, form: FormData) => Promise<IpNicknameFormState>
  categoryOptions: SquareIpCategoryOption[]
  initial?: IpNickname
  mode: 'create' | 'edit'
}

export function IpNicknameForm({
  action,
  categoryOptions,
  initial,
  mode
}: IpNicknameFormProps): JSX.Element {
  const [state, formAction] = useFormState(action, undefined)
  const n = initial
  const err = state?.error
  const fieldErr = (name: string) => err?.fields?.[name]

  return (
    <form
      action={formAction}
      method="post"
      style={{ display: 'grid', gap: '0.75rem', maxWidth: '40rem' }}
    >
      {err?.message && (
        <div role="alert" style={{ background: '#fee', padding: '0.5rem' }}>
          {err.message}
        </div>
      )}

      <Field
        label="Slug"
        hint="Lowercase letters, digits, hyphen. Used in /category/<slug>."
        error={fieldErr('slug')}
      >
        <input
          type="text"
          name="slug"
          required
          maxLength={80}
          pattern="^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$"
          defaultValue={n?.slug}
          readOnly={mode === 'edit'}
        />
      </Field>

      <Field label="Nickname (public)" error={fieldErr('nickname')}>
        <input type="text" name="nickname" required maxLength={120} defaultValue={n?.nickname} />
      </Field>

      <Field
        label="Square category"
        error={fieldErr('squareCategoryId')}
        hint="Hierarchical label shows parent > child. Categories already mapped are hidden."
      >
        <select name="squareCategoryId" defaultValue={n?.squareCategoryId ?? ''} required>
          <option value="" disabled>
            Select a Square category…
          </option>
          {categoryOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
        {categoryOptions.length === 0 && (
          <small style={{ color: '#a33' }}>
            No unmapped non-artist categories available.
          </small>
        )}
      </Field>

      <Field label="Description" error={fieldErr('description')}>
        <textarea
          name="description"
          maxLength={2000}
          rows={4}
          defaultValue={n?.description ?? ''}
        />
      </Field>

      <Field label="Visibility">
        <span>
          <label style={{ marginRight: '1rem' }}>
            <input
              type="radio"
              name="isPublic"
              value="true"
              defaultChecked={(n?.isPublic ?? true) === true}
            />{' '}
            Public
          </label>
          <label>
            <input
              type="radio"
              name="isPublic"
              value="false"
              defaultChecked={n?.isPublic === false}
            />{' '}
            Hidden
          </label>
        </span>
      </Field>

      <button type="submit" style={{ justifySelf: 'start', padding: '0.5rem 1rem' }}>
        {mode === 'create' ? 'Create nickname' : 'Save changes'}
      </button>
    </form>
  )
}

function Field({
  label,
  hint,
  error,
  children
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div style={{ display: 'grid', gap: '0.25rem' }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {children}
      {hint && <small style={{ color: '#666' }}>{hint}</small>}
      {error && (
        <span role="alert" style={{ color: '#a33', fontSize: '0.85em' }}>
          {error}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `src/app/(admin)/admin/ip-nicknames/_components/formData.ts`**

```ts
import type { IpNicknameInput } from '@/lib/db/queries/ip-nicknames'

function getNullable(form: FormData, key: string): string | null {
  const v = form.get(key)
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed.length === 0 ? null : trimmed
}

function getRequired(form: FormData, key: string): string {
  const v = form.get(key)
  if (typeof v !== 'string') return ''
  return v.trim()
}

export function parseIpNicknameForm(form: FormData): IpNicknameInput {
  const isPublicRaw = form.get('isPublic')
  const isPublic = typeof isPublicRaw === 'string' ? isPublicRaw === 'true' : true

  return {
    slug: getRequired(form, 'slug'),
    nickname: getRequired(form, 'nickname'),
    squareCategoryId: getRequired(form, 'squareCategoryId'),
    description: getNullable(form, 'description'),
    isPublic
  }
}
```

- [ ] **Step 3: Create `src/app/(admin)/admin/ip-nicknames/_components/validation.ts`**

```ts
import { IpNicknameInputSchema } from '@/lib/db/queries/ip-nicknames'
import type { IpNicknameFormError } from './IpNicknameForm'

export function validateIpNicknameInput(
  raw: unknown
):
  | { ok: true; data: ReturnType<typeof IpNicknameInputSchema.parse> }
  | { ok: false; error: IpNicknameFormError } {
  const result = IpNicknameInputSchema.safeParse(raw)
  if (result.success) return { ok: true, data: result.data }

  const fieldErrs: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '')
    if (!key) continue
    fieldErrs[key] = fieldErrs[key] ? `${fieldErrs[key]}; ${issue.message}` : issue.message
  }
  return {
    ok: false,
    error: {
      message: 'Please correct the highlighted fields.',
      fields: fieldErrs
    }
  }
}

/**
 * Detects Postgres unique-violation errors for ip_nicknames.
 * Returns 'slug' or 'square_category_id' depending on which constraint
 * tripped, or null if it's not a unique violation we recognise.
 */
export function detectIpNicknameUniqueViolation(
  err: unknown
): 'slug' | 'square_category_id' | null {
  if (!err || typeof err !== 'object') return null
  const e = err as { code?: string; constraint_name?: string; message?: string }
  if (e.code !== '23505' && !/unique/i.test(e.message ?? '')) return null
  const msg = e.message ?? ''
  if (/slug/i.test(msg) || e.constraint_name?.includes('slug')) return 'slug'
  if (/square_category_id/i.test(msg) || e.constraint_name?.includes('square_category_id')) {
    return 'square_category_id'
  }
  return null
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/(admin)/admin/ip-nicknames/_components/
git commit -m "Phase 5/B: IpNicknameForm + formData + validation"
```

### Task B.8: Server actions for create + update

- [ ] **Step 1: Create `src/app/(admin)/admin/ip-nicknames/new/actions.ts`**

```ts
'use server'

import type { IpNicknameFormState } from '@/app/(admin)/admin/ip-nicknames/_components/IpNicknameForm'
import { parseIpNicknameForm } from '@/app/(admin)/admin/ip-nicknames/_components/formData'
import {
  detectIpNicknameUniqueViolation,
  validateIpNicknameInput
} from '@/app/(admin)/admin/ip-nicknames/_components/validation'
import { createIpNickname } from '@/lib/db/queries/ip-nicknames'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createIpNicknameAction(
  _prev: IpNicknameFormState,
  form: FormData
): Promise<IpNicknameFormState> {
  const input = parseIpNicknameForm(form)
  const validated = validateIpNicknameInput(input)
  if (!validated.ok) return { error: validated.error }

  try {
    await createIpNickname(input)
  } catch (err) {
    const which = detectIpNicknameUniqueViolation(err)
    if (which === 'slug') {
      return {
        error: {
          message: 'That slug is already in use.',
          fields: { slug: 'Slug already in use; pick a different one.' }
        }
      }
    }
    if (which === 'square_category_id') {
      return {
        error: {
          message: 'That Square category already has a nickname.',
          fields: {
            squareCategoryId: 'Already mapped; edit the existing row or pick another category.'
          }
        }
      }
    }
    throw err
  }

  revalidatePath('/admin/ip-nicknames')
  revalidatePath(`/category/${validated.data.slug}`)
  redirect('/admin/ip-nicknames')
}
```

- [ ] **Step 2: Create `src/app/(admin)/admin/ip-nicknames/[id]/actions.ts`**

```ts
'use server'

import type { IpNicknameFormState } from '@/app/(admin)/admin/ip-nicknames/_components/IpNicknameForm'
import { parseIpNicknameForm } from '@/app/(admin)/admin/ip-nicknames/_components/formData'
import {
  detectIpNicknameUniqueViolation,
  validateIpNicknameInput
} from '@/app/(admin)/admin/ip-nicknames/_components/validation'
import { updateIpNickname } from '@/lib/db/queries/ip-nicknames'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function updateIpNicknameAction(
  id: string,
  _prev: IpNicknameFormState,
  form: FormData
): Promise<IpNicknameFormState> {
  const input = parseIpNicknameForm(form)
  const validated = validateIpNicknameInput(input)
  if (!validated.ok) return { error: validated.error }

  try {
    await updateIpNickname(id, input)
  } catch (err) {
    const which = detectIpNicknameUniqueViolation(err)
    if (which === 'slug') {
      return {
        error: {
          message: 'That slug is already in use.',
          fields: { slug: 'Slug already in use; pick a different one.' }
        }
      }
    }
    if (which === 'square_category_id') {
      return {
        error: {
          message: 'That Square category already has a nickname on another row.',
          fields: { squareCategoryId: 'Already mapped to another nickname.' }
        }
      }
    }
    throw err
  }

  revalidatePath('/admin/ip-nicknames')
  revalidatePath(`/category/${validated.data.slug}`)
  redirect('/admin/ip-nicknames')
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/(admin)/admin/ip-nicknames/new/actions.ts src/app/(admin)/admin/ip-nicknames/[id]/actions.ts
git commit -m "Phase 5/B: ip-nicknames server actions"
```

### Task B.9: Write the failing unit test for server actions

- [ ] **Step 1: Create `tests/admin/ip-nicknames-actions.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRevalidate = vi.fn()
const mockRedirect = vi.fn(() => {
  throw new Error('NEXT_REDIRECT')
})

vi.mock('@/lib/db/queries/ip-nicknames', async (importOriginal) => {
  const mod: typeof import('@/lib/db/queries/ip-nicknames') = await importOriginal()
  return {
    ...mod,
    createIpNickname: mockCreate,
    updateIpNickname: mockUpdate
  }
})
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidate }))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

function makeForm(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

afterEach(() => {
  mockCreate.mockReset()
  mockUpdate.mockReset()
  mockRevalidate.mockReset()
  mockRedirect.mockClear()
})

describe('createIpNicknameAction', () => {
  it('happy path: validates, creates, redirects', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'X', slug: 'naruto-ramen', nickname: 'Ramen Shop' })
    const { createIpNicknameAction } = await import(
      '@/app/(admin)/admin/ip-nicknames/new/actions'
    )
    const form = makeForm({
      slug: 'naruto-ramen',
      nickname: 'Ramen Shop',
      squareCategoryId: 'CAT_X',
      description: '',
      isPublic: 'true'
    })
    await expect(createIpNicknameAction(undefined, form)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockRevalidate).toHaveBeenCalledWith('/admin/ip-nicknames')
    expect(mockRevalidate).toHaveBeenCalledWith('/category/naruto-ramen')
    expect(mockRedirect).toHaveBeenCalledWith('/admin/ip-nicknames')
  })

  it('rejects invalid slug (uppercase) without hitting DB', async () => {
    const { createIpNicknameAction } = await import(
      '@/app/(admin)/admin/ip-nicknames/new/actions'
    )
    const form = makeForm({
      slug: 'BadSlug',
      nickname: 'Ramen',
      squareCategoryId: 'CAT_X',
      isPublic: 'true'
    })
    const result = await createIpNicknameAction(undefined, form)
    expect(result?.error?.fields?.slug).toBeDefined()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('translates unique slug violation to friendly field error', async () => {
    mockCreate.mockRejectedValueOnce({ code: '23505', message: 'duplicate key value violates unique constraint "ip_nicknames_slug_unique"' })
    const { createIpNicknameAction } = await import(
      '@/app/(admin)/admin/ip-nicknames/new/actions'
    )
    const form = makeForm({
      slug: 'naruto-ramen',
      nickname: 'Ramen',
      squareCategoryId: 'CAT_X',
      isPublic: 'true'
    })
    const result = await createIpNicknameAction(undefined, form)
    expect(result?.error?.fields?.slug).toMatch(/already in use/i)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('translates unique square_category_id violation to friendly field error', async () => {
    mockCreate.mockRejectedValueOnce({ code: '23505', message: 'duplicate key value violates unique constraint "ip_nicknames_square_category_id_unique"' })
    const { createIpNicknameAction } = await import(
      '@/app/(admin)/admin/ip-nicknames/new/actions'
    )
    const form = makeForm({
      slug: 'naruto-ramen',
      nickname: 'Ramen',
      squareCategoryId: 'CAT_X',
      isPublic: 'true'
    })
    const result = await createIpNicknameAction(undefined, form)
    expect(result?.error?.fields?.squareCategoryId).toMatch(/already mapped/i)
  })
})

describe('updateIpNicknameAction', () => {
  it('happy path: validates, updates, redirects', async () => {
    mockUpdate.mockResolvedValueOnce({ id: 'X', slug: 'ramen-shop' })
    const { updateIpNicknameAction } = await import(
      '@/app/(admin)/admin/ip-nicknames/[id]/actions'
    )
    const form = makeForm({
      slug: 'ramen-shop',
      nickname: 'Ramen',
      squareCategoryId: 'CAT_X',
      isPublic: 'true'
    })
    await expect(updateIpNicknameAction('X', undefined, form)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockUpdate).toHaveBeenCalledWith('X', expect.any(Object))
    expect(mockRedirect).toHaveBeenCalledWith('/admin/ip-nicknames')
  })
})
```

- [ ] **Step 2: Run — should fail until pages exist (actions exist; this is just the smoke test)**

Run: `pnpm vitest run tests/admin/ip-nicknames-actions.test.ts`
Expected: 5/5 pass (actions exist from B.8).

- [ ] **Step 3: Commit**

```bash
git add tests/admin/ip-nicknames-actions.test.ts
git commit -m "Phase 5/B: ip-nicknames server-action unit tests"
```

### Task B.10: Pages — list / new / edit

- [ ] **Step 1: Create `src/app/(admin)/admin/ip-nicknames/page.tsx`**

```tsx
import { getAllIpNicknames } from '@/lib/db/queries/ip-nicknames'
import { getCategoryNameMap } from '@/lib/square/categories'
import type { Route } from 'next'
import Link from 'next/link'

export const metadata = {
  title: 'IP nicknames — admin'
}

export default async function AdminIpNicknamesListPage(): Promise<JSX.Element> {
  const [nicknames, categoryNames] = await Promise.all([
    getAllIpNicknames(),
    getCategoryNameMap()
  ])

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '1rem'
        }}
      >
        <h1>IP nicknames ({nicknames.length})</h1>
        <Link href={'/admin/ip-nicknames/new' as Route}>+ new nickname</Link>
      </header>

      {nicknames.length === 0 ? (
        <EmptyState />
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th style={cellStyle}>Public?</th>
              <th style={cellStyle}>Nickname</th>
              <th style={cellStyle}>Slug</th>
              <th style={cellStyle}>Square category (staff-only)</th>
              <th style={cellStyle}>Description</th>
              <th style={cellStyle} />
            </tr>
          </thead>
          <tbody>
            {nicknames.map((n) => {
              const catName = categoryNames.get(n.squareCategoryId) ?? '(unknown)'
              const trimmedDesc = n.description
                ? n.description.length > 80
                  ? `${n.description.slice(0, 80)}…`
                  : n.description
                : ''
              return (
                <tr key={n.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={cellStyle}>
                    <PublicBadge isPublic={n.isPublic} />
                  </td>
                  <td style={cellStyle}>{n.nickname}</td>
                  <td style={cellStyle}>
                    <code>{n.slug}</code>
                  </td>
                  <td style={cellStyle}>{catName}</td>
                  <td style={cellStyle}>{trimmedDesc}</td>
                  <td style={cellStyle}>
                    <Link href={`/admin/ip-nicknames/${n.id}` as Route}>edit</Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

const cellStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', verticalAlign: 'top' }

function EmptyState(): JSX.Element {
  return (
    <div style={{ padding: '2rem', textAlign: 'center', background: '#f7f7f7' }}>
      <p>No nicknames yet.</p>
      <Link href={'/admin/ip-nicknames/new' as Route}>Create the first one</Link>
    </div>
  )
}

function PublicBadge({ isPublic }: { isPublic: boolean }): JSX.Element {
  const bg = isPublic ? '#dfd' : '#eee'
  const label = isPublic ? 'Public' : 'Hidden'
  return (
    <span style={{ background: bg, padding: '0.15rem 0.5rem', borderRadius: '0.25rem' }}>
      {label}
    </span>
  )
}
```

- [ ] **Step 2: Create `src/app/(admin)/admin/ip-nicknames/new/page.tsx`**

```tsx
import { IpNicknameForm } from '@/app/(admin)/admin/ip-nicknames/_components/IpNicknameForm'
import { loadIpCategoryOptions } from '@/app/(admin)/admin/ip-nicknames/_components/SquareIpCategoryPicker'
import { getAllIpNicknames } from '@/lib/db/queries/ip-nicknames'
import { createIpNicknameAction } from './actions'

export const metadata = { title: 'New IP nickname — admin' }

export default async function NewIpNicknamePage(): Promise<JSX.Element> {
  const existing = await getAllIpNicknames()
  const mapped = new Set(existing.map((n) => n.squareCategoryId))
  const categoryOptions = await loadIpCategoryOptions(mapped)

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>New IP nickname</h1>
      <p>
        Slug is permanent (used in <code>/category/&lt;slug&gt;</code>). Pick carefully. Square
        category names are staff-only — never displayed on the public page.
      </p>
      <IpNicknameForm action={createIpNicknameAction} categoryOptions={categoryOptions} mode="create" />
    </div>
  )
}
```

- [ ] **Step 3: Create `src/app/(admin)/admin/ip-nicknames/[id]/page.tsx`**

```tsx
import { IpNicknameForm } from '@/app/(admin)/admin/ip-nicknames/_components/IpNicknameForm'
import { loadIpCategoryOptions } from '@/app/(admin)/admin/ip-nicknames/_components/SquareIpCategoryPicker'
import { getAllIpNicknames, getIpNicknameById } from '@/lib/db/queries/ip-nicknames'
import { notFound } from 'next/navigation'
import { updateIpNicknameAction } from './actions'

export const metadata = { title: 'Edit IP nickname — admin' }

interface PageProps {
  params: { id: string }
}

export default async function EditIpNicknamePage({ params }: PageProps): Promise<JSX.Element> {
  const nickname = await getIpNicknameById(params.id)
  if (!nickname) notFound()

  const all = await getAllIpNicknames()
  // Re-include the current row's category id so it stays selectable.
  const mapped = new Set(all.map((n) => n.squareCategoryId).filter((id) => id !== nickname.squareCategoryId))
  const categoryOptions = await loadIpCategoryOptions(mapped)

  const boundAction = updateIpNicknameAction.bind(null, nickname.id)

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Edit IP nickname: {nickname.nickname}</h1>
      <p>
        Slug is read-only here (changing it would break <code>/category/{nickname.slug}</code>).
        Toggle visibility to hide the public page without deleting the row.
      </p>
      <IpNicknameForm
        action={boundAction}
        categoryOptions={categoryOptions}
        initial={nickname}
        mode="edit"
      />
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: clean. New routes `/admin/ip-nicknames`, `/admin/ip-nicknames/new`, `/admin/ip-nicknames/[id]` appear in the route table.

- [ ] **Step 6: Commit**

```bash
git add src/app/(admin)/admin/ip-nicknames/page.tsx src/app/(admin)/admin/ip-nicknames/new/page.tsx src/app/(admin)/admin/ip-nicknames/[id]/page.tsx
git commit -m "Phase 5/B: /admin/ip-nicknames list + new + edit pages"
```

### Task B.11: Group B acceptance gate

- [ ] **Step 1: Run full automated gate**

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

Expected:
- lint + typecheck + build clean
- unit tests: 65 (after Group A) + 5 (B.4) + 5 (B.9) = 75 passing
- integration: 45 (after Group A) + 10 (B.2) = 55 passing

- [ ] **Step 2: Group B done**

---

## Task Group C — PDP client components

Ships `<MockupGallery>`, `<VariantPicker>`, the baked mockup scene library + background images, and unit tests for both components. Independent of Groups A and B at the file level — but Plan C consumes the type extensions from Plan A, so A must be merged first **if** running C in isolation. (Otherwise: the type extensions live in A.1; ensure that commit is on the branch before starting C.)

### Task C.1: Commit the 4 mockup scene background images

- [ ] **Step 1: Download each background from the reference HTML**

```sh
mkdir -p public/images/mockup-scenes
curl -L -o public/images/mockup-scenes/style1.png 'https://animeniacs.shop/wp-content/uploads/2025/05/Purple-and-Blue-Abstract-Color-and-Style-Desktop-Wallpaper-1200-x-750-px.png'
curl -L -o public/images/mockup-scenes/style2.png 'https://animeniacs.shop/wp-content/uploads/2025/05/Untitled-design1.png'
curl -L -o public/images/mockup-scenes/style3.webp 'https://animeniacs.shop/wp-content/uploads/2025/05/product_style_1.webp'
curl -L -o public/images/mockup-scenes/style4.webp 'https://animeniacs.shop/wp-content/uploads/2025/05/product_style_4.webp'
```

Verify each file is >5KB (i.e. not an HTML error page):
```sh
ls -lh public/images/mockup-scenes/
```

- [ ] **Step 2: Convert PNGs to WebP for consistency (uses local `sharp`)**

```sh
node -e "const sharp=require('sharp');const fs=require('fs');for(const i of [1,2]){sharp(\`public/images/mockup-scenes/style\${i}.png\`).webp({quality:88}).toFile(\`public/images/mockup-scenes/style\${i}.webp\`).then(()=>fs.unlinkSync(\`public/images/mockup-scenes/style\${i}.png\`));}"
```

Verify only `.webp` files remain.

- [ ] **Step 3: Commit**

```bash
git add public/images/mockup-scenes/
git commit -m "Phase 5/C: commit 4 mockup scene backgrounds as self-hosted webp"
```

### Task C.2: Create the scene library const

- [ ] **Step 1: Create `src/lib/mockup-scenes.ts`**

```ts
/**
 * Hardcoded mockup gallery scene library (Decision 3).
 *
 * Phase 5 ships exactly the 4 scenes from the legacy site at
 * docs/superpowers/specs/reference/mockup-gallery-original.html.
 * Background images self-hosted under public/images/mockup-scenes/.
 *
 * Future phases (likely Phase 7+) replace this const with admin-editable
 * data from site_settings + an /admin/settings scene editor.
 */

export interface MockupScene {
  id: string
  name: string
  /** Path under /public, served as a root-relative URL. */
  backgroundImage: string
  productPosition: {
    top: string
    left: string
    width: string
    height: string
    transform: string
  }
}

export const MOCKUP_SCENES: readonly MockupScene[] = [
  {
    id: 'style1',
    name: 'Modern Gallery Wall',
    backgroundImage: '/images/mockup-scenes/style1.webp',
    productPosition: {
      top: '5%',
      left: '30%',
      width: '37%',
      height: '90%',
      transform: 'perspective(400px) rotate3d(0, 0, 0, 0deg)'
    }
  },
  {
    id: 'style2',
    name: 'Angled Wall',
    backgroundImage: '/images/mockup-scenes/style2.webp',
    productPosition: {
      top: '5%',
      left: '48%',
      width: '33%',
      height: '80%',
      transform: 'perspective(400px) rotate3d(0, -1, 0, -20deg)'
    }
  },
  {
    id: 'style3',
    name: 'Classic Display',
    backgroundImage: '/images/mockup-scenes/style3.webp',
    productPosition: {
      top: '3%',
      left: '40%',
      width: '20%',
      height: '30%',
      transform: 'rotate(0deg)'
    }
  },
  {
    id: 'style4',
    name: 'Premium Showcase',
    backgroundImage: '/images/mockup-scenes/style4.webp',
    productPosition: {
      top: '5%',
      left: '43%',
      width: '20%',
      height: '30%',
      transform: 'rotate(0deg)'
    }
  }
] as const
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mockup-scenes.ts
git commit -m "Phase 5/C: MOCKUP_SCENES const (4 scenes baked in)"
```

### Task C.3: Write failing tests for MockupGallery

- [ ] **Step 1: Create `tests/public/mockup-gallery.test.tsx`**

```tsx
import { MockupGallery } from '@/components/product/MockupGallery'
import type { MockupScene } from '@/lib/mockup-scenes'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

const SCENES: MockupScene[] = [
  {
    id: 's1',
    name: 'Scene One',
    backgroundImage: '/images/mockup-scenes/style1.webp',
    productPosition: { top: '0', left: '0', width: '50%', height: '50%', transform: 'none' }
  },
  {
    id: 's2',
    name: 'Scene Two',
    backgroundImage: '/images/mockup-scenes/style2.webp',
    productPosition: { top: '10%', left: '10%', width: '40%', height: '40%', transform: 'none' }
  }
]

describe('<MockupGallery>', () => {
  it('renders scene thumbnails with aria-pressed reflecting active scene', () => {
    render(<MockupGallery scenes={SCENES} productImages={['/img1.jpg']} productName="Test" />)
    const sceneOne = screen.getByRole('button', { name: /scene: scene one/i })
    const sceneTwo = screen.getByRole('button', { name: /scene: scene two/i })
    expect(sceneOne).toHaveAttribute('aria-pressed', 'true')
    expect(sceneTwo).toHaveAttribute('aria-pressed', 'false')
  })

  it('switching scenes flips aria-pressed', () => {
    render(<MockupGallery scenes={SCENES} productImages={['/img1.jpg']} productName="Test" />)
    const sceneTwo = screen.getByRole('button', { name: /scene: scene two/i })
    fireEvent.click(sceneTwo)
    expect(sceneTwo).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders product image thumbnails only when more than one image', () => {
    const { rerender } = render(
      <MockupGallery scenes={SCENES} productImages={['/img1.jpg']} productName="Test" />
    )
    expect(screen.queryByRole('button', { name: /product image 1 of/i })).toBeNull()
    rerender(<MockupGallery scenes={SCENES} productImages={['/img1.jpg', '/img2.jpg']} productName="Test" />)
    expect(screen.getByRole('button', { name: /product image 1 of 2/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /product image 2 of 2/i })).toBeInTheDocument()
  })

  it('clicking a product image thumbnail swaps the overlay src', () => {
    render(
      <MockupGallery
        scenes={SCENES}
        productImages={['/img1.jpg', '/img2.jpg']}
        productName="Test"
      />
    )
    const overlay = screen.getByAltText(/test/i)
    expect(overlay).toHaveAttribute('src', expect.stringContaining('/img1.jpg'))
    fireEvent.click(screen.getByRole('button', { name: /product image 2 of 2/i }))
    expect(overlay).toHaveAttribute('src', expect.stringContaining('/img2.jpg'))
  })

  it('arrow keys cycle scenes when the container has focus', () => {
    render(<MockupGallery scenes={SCENES} productImages={['/img1.jpg']} productName="Test" />)
    const container = screen.getByRole('group', { name: /mockup gallery/i })
    container.focus()
    fireEvent.keyDown(container, { key: 'ArrowRight' })
    expect(screen.getByRole('button', { name: /scene: scene two/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    fireEvent.keyDown(container, { key: 'ArrowLeft' })
    expect(screen.getByRole('button', { name: /scene: scene one/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('empty productImages still renders the active scene without crash', () => {
    render(<MockupGallery scenes={SCENES} productImages={[]} productName="Test" />)
    expect(screen.getByLabelText(/no product image available/i)).toBeInTheDocument()
  })

  it('respects prefers-reduced-motion (no transition class applied)', () => {
    // jsdom does not implement matchMedia by default; supply a stub.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    })
    render(<MockupGallery scenes={SCENES} productImages={['/img1.jpg']} productName="Test" />)
    const display = screen.getByRole('img', { name: /test on scene one/i })
    // The component sets a data-reduced-motion="true" attribute when the
    // media query matches; we assert that signal rather than CSS specifics.
    expect(display).toHaveAttribute('data-reduced-motion', 'true')
  })
})
```

- [ ] **Step 2: Run — should fail (component doesn't exist)**

Run: `pnpm vitest run tests/public/mockup-gallery.test.tsx`
Expected: FAIL with module-not-found.

### Task C.4: Implement <MockupGallery>

- [ ] **Step 1: Create `src/components/product/MockupGallery.module.css`**

```css
.container {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 1rem;
}

@media (max-width: 640px) {
  .container {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
}

.thumbStrip {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

@media (max-width: 640px) {
  .thumbStrip {
    flex-direction: row;
    overflow-x: auto;
  }
}

.thumb {
  border: 2px solid transparent;
  padding: 0;
  background: none;
  cursor: pointer;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 4px;
}

.thumb[aria-pressed='true'] {
  border-color: #333;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.display {
  position: relative;
  width: 100%;
  background: #f5f5f5;
  border-radius: 8px;
  overflow: hidden;
  aspect-ratio: 16 / 10;
}

.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 400ms ease;
}

.bg[data-active='true'] {
  opacity: 1;
}

.display[data-reduced-motion='true'] .bg {
  transition: none;
}

.overlay {
  position: absolute;
  object-fit: contain;
}

.groupLabel {
  font-size: 0.75rem;
  color: #666;
  margin: 0.5rem 0 0.25rem;
}
```

- [ ] **Step 2: Create `src/components/product/MockupGallery.tsx`**

```tsx
'use client'

import type { MockupScene } from '@/lib/mockup-scenes'
import { useEffect, useId, useRef, useState } from 'react'
import styles from './MockupGallery.module.css'

interface MockupGalleryProps {
  scenes: MockupScene[]
  /** Ordered list of product image URLs (CachedProduct.images). May be empty. */
  productImages: string[]
  productName: string
}

export function MockupGallery({ scenes, productImages, productName }: MockupGalleryProps): JSX.Element {
  const [sceneIdx, setSceneIdx] = useState(0)
  const [productImageIdx, setProductImageIdx] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = () => setReducedMotion(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  const activeScene = scenes[sceneIdx]
  const activeImage = productImages[productImageIdx] ?? null

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'ArrowRight') {
      setSceneIdx((i) => (i + 1) % scenes.length)
      e.preventDefault()
    } else if (e.key === 'ArrowLeft') {
      setSceneIdx((i) => (i - 1 + scenes.length) % scenes.length)
      e.preventDefault()
    }
  }

  return (
    <div
      ref={containerRef}
      className={styles.container}
      role="group"
      aria-labelledby={titleId}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <span id={titleId} style={{ position: 'absolute', left: -9999, top: 'auto' }}>
        Mockup gallery
      </span>

      <div className={styles.thumbStrip}>
        <p className={styles.groupLabel}>Scenes</p>
        {scenes.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={styles.thumb}
            aria-label={`Scene: ${s.name}`}
            aria-pressed={i === sceneIdx}
            onClick={() => setSceneIdx(i)}
          >
            <img src={s.backgroundImage} alt="" />
          </button>
        ))}

        {productImages.length > 1 && (
          <>
            <p className={styles.groupLabel}>Product images</p>
            {productImages.map((src, i) => (
              <button
                key={src}
                type="button"
                className={styles.thumb}
                aria-label={`Product image ${i + 1} of ${productImages.length}`}
                aria-pressed={i === productImageIdx}
                onClick={() => setProductImageIdx(i)}
              >
                <img src={src} alt="" />
              </button>
            ))}
          </>
        )}
      </div>

      <div
        className={styles.display}
        data-reduced-motion={reducedMotion ? 'true' : 'false'}
        role="img"
        aria-label={
          activeImage
            ? `${productName} on ${activeScene.name}`
            : 'No product image available'
        }
      >
        {scenes.map((s, i) => (
          <img
            key={s.id}
            src={s.backgroundImage}
            alt=""
            className={styles.bg}
            data-active={i === sceneIdx}
          />
        ))}
        {activeImage && (
          <img
            src={activeImage}
            alt={productName}
            className={styles.overlay}
            style={{
              top: activeScene.productPosition.top,
              left: activeScene.productPosition.left,
              width: activeScene.productPosition.width,
              height: activeScene.productPosition.height,
              transform: activeScene.productPosition.transform
            }}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run the tests**

Run: `pnpm vitest run tests/public/mockup-gallery.test.tsx`
Expected: 7/7 pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/product/MockupGallery.tsx src/components/product/MockupGallery.module.css tests/public/mockup-gallery.test.tsx
git commit -m "Phase 5/C: <MockupGallery> client component + unit tests"
```

### Task C.5: Write failing tests for VariantPicker

- [ ] **Step 1: Create `tests/public/variant-picker.test.tsx`**

```tsx
import { VariantPicker } from '@/components/product/VariantPicker'
import type { CachedItemOption, CachedVariation } from '@/lib/square/types'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

const SIZE: CachedItemOption = {
  id: 'OPT_SIZE',
  name: 'Size',
  values: [
    { id: 'VAL_S', name: 'Small' },
    { id: 'VAL_M', name: 'Medium' }
  ]
}
const MEDIA: CachedItemOption = {
  id: 'OPT_MEDIA',
  name: 'Media',
  values: [
    { id: 'VAL_AC', name: 'Acrylic' },
    { id: 'VAL_VI', name: 'Vinyl' }
  ]
}

const VARIATIONS: CachedVariation[] = [
  { id: 'V_S_AC', name: 'Small / Acrylic', price: { amount: 2500, currency: 'USD' }, sku: null, optionValueIds: ['VAL_S', 'VAL_AC'] },
  { id: 'V_S_VI', name: 'Small / Vinyl', price: { amount: 2000, currency: 'USD' }, sku: null, optionValueIds: ['VAL_S', 'VAL_VI'] },
  { id: 'V_M_AC', name: 'Medium / Acrylic', price: { amount: 3000, currency: 'USD' }, sku: null, optionValueIds: ['VAL_M', 'VAL_AC'] }
  // Note: no Medium/Vinyl variation — picking that combo should yield onChange(null).
]

describe('<VariantPicker>', () => {
  it('renders one <select> per option axis with proper labels', () => {
    render(
      <VariantPicker variations={VARIATIONS} itemOptions={[SIZE, MEDIA]} onChange={() => {}} />
    )
    expect(screen.getByLabelText(/size/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/media/i)).toBeInTheDocument()
  })

  it('initial selection defaults to variations[0]', () => {
    const onChange = vi.fn()
    render(
      <VariantPicker variations={VARIATIONS} itemOptions={[SIZE, MEDIA]} onChange={onChange} />
    )
    // The component emits initial selection on mount.
    expect(onChange).toHaveBeenCalledWith(VARIATIONS[0])
  })

  it('changing a select resolves to the matching variation', () => {
    const onChange = vi.fn()
    render(
      <VariantPicker variations={VARIATIONS} itemOptions={[SIZE, MEDIA]} onChange={onChange} />
    )
    onChange.mockClear()
    fireEvent.change(screen.getByLabelText(/media/i), { target: { value: 'VAL_VI' } })
    expect(onChange).toHaveBeenLastCalledWith(VARIATIONS[1]) // Small / Vinyl
  })

  it('unmatched combination yields onChange(null)', () => {
    const onChange = vi.fn()
    render(
      <VariantPicker variations={VARIATIONS} itemOptions={[SIZE, MEDIA]} onChange={onChange} />
    )
    fireEvent.change(screen.getByLabelText(/size/i), { target: { value: 'VAL_M' } })
    fireEvent.change(screen.getByLabelText(/media/i), { target: { value: 'VAL_VI' } })
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('zero options + one variation renders nothing', () => {
    const single: CachedVariation[] = [
      { id: 'V1', name: 'Default', price: { amount: 1000, currency: 'USD' }, sku: null, optionValueIds: [] }
    ]
    const { container } = render(
      <VariantPicker variations={single} itemOptions={[]} onChange={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('zero options + multiple variations renders one select over variation names', () => {
    const multi: CachedVariation[] = [
      { id: 'A', name: 'Option A', price: { amount: 100, currency: 'USD' }, sku: null, optionValueIds: [] },
      { id: 'B', name: 'Option B', price: { amount: 200, currency: 'USD' }, sku: null, optionValueIds: [] }
    ]
    const onChange = vi.fn()
    render(<VariantPicker variations={multi} itemOptions={[]} onChange={onChange} />)
    expect(screen.getByLabelText(/variation/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/variation/i), { target: { value: 'B' } })
    expect(onChange).toHaveBeenLastCalledWith(multi[1])
  })

  it('initialVariationId pre-selects that variation', () => {
    const onChange = vi.fn()
    render(
      <VariantPicker
        variations={VARIATIONS}
        itemOptions={[SIZE, MEDIA]}
        onChange={onChange}
        initialVariationId="V_M_AC"
      />
    )
    expect(onChange).toHaveBeenCalledWith(VARIATIONS[2])
  })
})
```

- [ ] **Step 2: Run — should fail (component doesn't exist)**

Run: `pnpm vitest run tests/public/variant-picker.test.tsx`
Expected: FAIL with module-not-found.

### Task C.6: Implement <VariantPicker>

- [ ] **Step 1: Create `src/components/product/VariantPicker.tsx`**

```tsx
'use client'

import type { CachedItemOption, CachedVariation } from '@/lib/square/types'
import { useEffect, useId, useRef, useState } from 'react'

interface VariantPickerProps {
  variations: CachedVariation[]
  itemOptions: CachedItemOption[]
  onChange: (variation: CachedVariation | null) => void
  initialVariationId?: string
}

function findVariation(
  variations: CachedVariation[],
  itemOptions: CachedItemOption[],
  selected: Map<string, string>
): CachedVariation | null {
  return (
    variations.find((v) =>
      itemOptions.every((opt) => {
        const pickedValue = selected.get(opt.id)
        return pickedValue !== undefined && v.optionValueIds.includes(pickedValue)
      })
    ) ?? null
  )
}

export function VariantPicker({
  variations,
  itemOptions,
  onChange,
  initialVariationId
}: VariantPickerProps): JSX.Element | null {
  // Zero variations: nothing meaningful to render.
  if (variations.length === 0) return null
  // Zero options + one variation: picker is invisible.
  if (itemOptions.length === 0 && variations.length === 1) return null

  // The "zero options + multiple variations" branch renders a single
  // <select> over variation names.
  if (itemOptions.length === 0) {
    return <VariationNameSelect variations={variations} onChange={onChange} initialVariationId={initialVariationId} />
  }

  return (
    <OptionSelects
      variations={variations}
      itemOptions={itemOptions}
      onChange={onChange}
      initialVariationId={initialVariationId}
    />
  )
}

function VariationNameSelect({
  variations,
  onChange,
  initialVariationId
}: {
  variations: CachedVariation[]
  onChange: (v: CachedVariation | null) => void
  initialVariationId?: string
}): JSX.Element {
  const id = useId()
  const initial = (initialVariationId && variations.find((v) => v.id === initialVariationId)) ?? variations[0]
  const [selectedId, setSelectedId] = useState(initial.id)
  const fired = useRef(false)

  useEffect(() => {
    if (!fired.current) {
      fired.current = true
      onChange(initial)
    }
  }, [initial, onChange])

  return (
    <div>
      <label htmlFor={id}>Variation</label>
      <select
        id={id}
        value={selectedId}
        onChange={(e) => {
          setSelectedId(e.target.value)
          const v = variations.find((v) => v.id === e.target.value) ?? null
          onChange(v)
        }}
      >
        {variations.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function OptionSelects({
  variations,
  itemOptions,
  onChange,
  initialVariationId
}: VariantPickerProps): JSX.Element {
  const initialVariation =
    (initialVariationId && variations.find((v) => v.id === initialVariationId)) ?? variations[0]
  const initialSelected = new Map<string, string>()
  for (const opt of itemOptions) {
    const pickedValueId = initialVariation.optionValueIds.find((vid) =>
      opt.values.some((val) => val.id === vid)
    )
    if (pickedValueId) initialSelected.set(opt.id, pickedValueId)
  }

  const [selected, setSelected] = useState<Map<string, string>>(initialSelected)
  const fired = useRef(false)

  useEffect(() => {
    if (!fired.current) {
      fired.current = true
      onChange(findVariation(variations, itemOptions, selected))
    }
  }, [variations, itemOptions, selected, onChange])

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      {itemOptions.map((opt) => {
        const id = `option-${opt.id}`
        return (
          <div key={opt.id}>
            <label htmlFor={id}>{opt.name}</label>
            <select
              id={id}
              name={`option-${opt.id}`}
              value={selected.get(opt.id) ?? ''}
              onChange={(e) => {
                const next = new Map(selected)
                next.set(opt.id, e.target.value)
                setSelected(next)
                onChange(findVariation(variations, itemOptions, next))
              }}
            >
              {opt.values.map((val) => (
                <option key={val.id} value={val.id}>
                  {val.name}
                </option>
              ))}
            </select>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Run the tests**

Run: `pnpm vitest run tests/public/variant-picker.test.tsx`
Expected: 7/7 pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/product/VariantPicker.tsx tests/public/variant-picker.test.tsx
git commit -m "Phase 5/C: <VariantPicker> client component + unit tests"
```

### Task C.7: Group C acceptance gate

- [ ] **Step 1: Run full automated gate**

```sh
pnpm lint
pnpm typecheck
pnpm test
```

Expected:
- lint + typecheck clean
- unit tests: previous total + 7 (C.3) + 7 (C.5) = 89 passing

- [ ] **Step 2: Group C done**

---

## Task Group D — PDP route integration

Wires Groups A, B, C together into the public `/product/[id]` route. Adds sanitization, related-products resolver, the purchase-panel client island, image-host allowlist, loading + error UI. **Depends on A, B, C all merged.**

### Task D.1: Site copy + sanitization

- [ ] **Step 1: Create `src/lib/site-copy.ts`**

```ts
/**
 * Site-wide hardcoded copy that an admin would eventually edit.
 * Phase 5 keeps these in code (Decision 6); Phase 7+ moves them to
 * site_settings + /admin/settings.
 */

export const PRODUCTION_TIME_TEXT =
  'Ships in 3-10 days depending on convention schedule.'

export const DISABLED_ADD_TO_CART_TOOLTIP =
  'Shopping cart launching soon — follow us on Instagram for the launch.'
```

- [ ] **Step 2: Create `src/lib/sanitize-html.ts`**

```ts
import DOMPurify from 'isomorphic-dompurify'

const ALLOWED_TAGS = ['p', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'a']
const ALLOWED_ATTR = ['href']

// Register the link-hardening hook once at module load. dompurify's
// hook registry is global across imports so this attaches once per
// process.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/**
 * Sanitize a product description HTML string against the Decision 11
 * whitelist. Strips everything outside the allowlist. Forces every
 * surviving <a> to open in a new tab with rel="noopener noreferrer".
 */
export function sanitizeProductDescription(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false
  })
}

/**
 * Strip all tags from an HTML string. Used for SEO descriptions where
 * we need plain text.
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim()
}
```

- [ ] **Step 3: Create `tests/public/sanitize-html.test.ts`**

```ts
import { sanitizeProductDescription, stripHtml } from '@/lib/sanitize-html'
import { describe, expect, it } from 'vitest'

describe('sanitizeProductDescription', () => {
  it('keeps whitelisted tags', () => {
    const out = sanitizeProductDescription('<p>Hello <strong>world</strong></p>')
    expect(out).toContain('<p>')
    expect(out).toContain('<strong>')
  })

  it('strips <script>', () => {
    const out = sanitizeProductDescription('<p>safe</p><script>alert(1)</script>')
    expect(out).not.toMatch(/script/i)
  })

  it('strips <img>', () => {
    const out = sanitizeProductDescription('<p>x</p><img src=x onerror=alert(1)>')
    expect(out).not.toMatch(/<img/)
  })

  it('strips <iframe>', () => {
    const out = sanitizeProductDescription('<iframe src="evil"></iframe><p>x</p>')
    expect(out).not.toMatch(/<iframe/)
  })

  it('strips inline event handlers from allowed tags', () => {
    const out = sanitizeProductDescription('<p onclick="boom">x</p>')
    expect(out).not.toMatch(/onclick/)
  })

  it('strips javascript: URLs from <a href>', () => {
    const out = sanitizeProductDescription('<a href="javascript:alert(1)">x</a>')
    expect(out).not.toMatch(/javascript:/i)
  })

  it('forces rel + target on <a>', () => {
    const out = sanitizeProductDescription('<a href="https://example.com">link</a>')
    expect(out).toMatch(/rel="noopener noreferrer"/)
    expect(out).toMatch(/target="_blank"/)
  })
})

describe('stripHtml', () => {
  it('returns plain text', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world')
  })

  it('returns empty string for null / undefined', () => {
    expect(stripHtml(null)).toBe('')
    expect(stripHtml(undefined)).toBe('')
  })

  it('strips script + their content', () => {
    expect(stripHtml('<p>safe</p><script>evil()</script>')).toBe('safe')
  })
})
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/public/sanitize-html.test.ts`
Expected: 10/10 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/site-copy.ts src/lib/sanitize-html.ts tests/public/sanitize-html.test.ts
git commit -m "Phase 5/D: site-copy const + sanitize-html helpers + unit tests"
```

### Task D.2: Related products resolver

- [ ] **Step 1: Create `tests/categories/related.test.ts` (failing)**

```ts
import { describe, expect, it, vi } from 'vitest'

const mockGetItems = vi.fn()
const mockArtistByCat = vi.fn()
const mockIpNickByCat = vi.fn()

vi.mock('@/lib/square/items', () => ({ getItemsByCategoryId: mockGetItems }))
vi.mock('@/lib/db/queries/artists', () => ({ getArtistByCategoryId: mockArtistByCat }))
vi.mock('@/lib/db/queries/ip-nicknames', () => ({ getIpNicknameByCategoryId: mockIpNickByCat }))

function items(...ids: string[]) {
  return ids.map((id) => ({ id, name: `Item ${id}`, imageUrl: null, priceCents: 100, categoryIds: [] }))
}

describe('getRelatedProducts', () => {
  it('artist match wins (priority 1)', async () => {
    mockArtistByCat.mockResolvedValueOnce({ slug: 'noah', displayName: 'Noah', squareCategoryId: 'ART_CAT' })
    mockGetItems.mockResolvedValueOnce(items('A', 'B', 'CURRENT'))
    const { getRelatedProducts } = await import('@/lib/categories/related')
    const result = await getRelatedProducts('CURRENT', ['ART_CAT'])
    expect(result.source).toEqual({ kind: 'artist', slug: 'noah', displayName: 'Noah' })
    expect(result.items.map((i) => i.id)).toEqual(['A', 'B']) // excludes CURRENT
  })

  it('falls back to IP nickname (priority 2) when no artist matches', async () => {
    mockArtistByCat.mockResolvedValue(undefined)
    mockIpNickByCat.mockResolvedValueOnce({ slug: 'ramen-shop', nickname: 'Ramen Shop', squareCategoryId: 'IP_CAT' })
    mockGetItems.mockResolvedValueOnce(items('X', 'Y'))
    const { getRelatedProducts } = await import('@/lib/categories/related')
    const result = await getRelatedProducts('CURRENT', ['IP_CAT'])
    expect(result.source).toEqual({ kind: 'ip', slug: 'ramen-shop', nickname: 'Ramen Shop' })
    expect(result.items.map((i) => i.id)).toEqual(['X', 'Y'])
  })

  it('returns empty + null source when neither matches', async () => {
    mockArtistByCat.mockResolvedValue(undefined)
    mockIpNickByCat.mockResolvedValue(undefined)
    const { getRelatedProducts } = await import('@/lib/categories/related')
    const result = await getRelatedProducts('CURRENT', ['UNMAPPED'])
    expect(result.source).toBeNull()
    expect(result.items).toEqual([])
  })

  it('caps results at 6', async () => {
    mockArtistByCat.mockResolvedValueOnce({ slug: 'a', displayName: 'A', squareCategoryId: 'C' })
    mockGetItems.mockResolvedValueOnce(items('1', '2', '3', '4', '5', '6', '7', '8'))
    const { getRelatedProducts } = await import('@/lib/categories/related')
    const result = await getRelatedProducts('CURRENT', ['C'])
    expect(result.items).toHaveLength(6)
  })
})
```

- [ ] **Step 2: Create `src/lib/categories/related.ts`**

```ts
import 'server-only'
import { getArtistByCategoryId } from '@/lib/db/queries/artists'
import { getIpNicknameByCategoryId } from '@/lib/db/queries/ip-nicknames'
import { type ArtistProduct, getItemsByCategoryId } from '@/lib/square/items'

const MAX_RELATED = 6

export type RelatedSource =
  | { kind: 'artist'; slug: string; displayName: string }
  | { kind: 'ip'; slug: string; nickname: string }

export interface RelatedResult {
  items: ArtistProduct[]
  source: RelatedSource | null
}

/**
 * Two-tier resolver for the PDP "More from …" carousel.
 *
 *   Priority 1: any of the product's category ids maps to an artist row
 *               in the local `artists` table. Carousel = items in that
 *               artist's category (minus the current product id).
 *   Priority 2: any category id maps to an ip_nicknames row that is
 *               currently public. Carousel = items in that IP category
 *               (minus the current product id).
 *   Else: empty items + null source. The PDP omits the section.
 *
 * Public label respects the IP-never-public constraint: we expose only
 * the artist's display name OR the IP nickname — never the raw Square
 * category name.
 */
export async function getRelatedProducts(
  currentItemId: string,
  categoryIds: string[]
): Promise<RelatedResult> {
  // Priority 1: artist
  for (const id of categoryIds) {
    const artist = await getArtistByCategoryId(id)
    if (artist) {
      const items = (await getItemsByCategoryId(artist.squareCategoryId))
        .filter((it) => it.id !== currentItemId)
        .slice(0, MAX_RELATED)
      return {
        items,
        source: { kind: 'artist', slug: artist.slug, displayName: artist.displayName }
      }
    }
  }

  // Priority 2: IP nickname
  for (const id of categoryIds) {
    const nickname = await getIpNicknameByCategoryId(id)
    if (nickname && nickname.isPublic) {
      const items = (await getItemsByCategoryId(nickname.squareCategoryId))
        .filter((it) => it.id !== currentItemId)
        .slice(0, MAX_RELATED)
      return {
        items,
        source: { kind: 'ip', slug: nickname.slug, nickname: nickname.nickname }
      }
    }
  }

  return { items: [], source: null }
}
```

- [ ] **Step 3: Run the tests**

Run: `pnpm vitest run tests/categories/related.test.ts`
Expected: 4/4 pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/categories/related.ts tests/categories/related.test.ts
git commit -m "Phase 5/D: getRelatedProducts two-tier resolver"
```

### Task D.3: PdpPurchasePanel client island

- [ ] **Step 1: Create `tests/public/pdp-purchase-panel.test.tsx` (failing)**

```tsx
import { PdpPurchasePanel } from '@/components/product/PdpPurchasePanel'
import type { CachedItemOption, CachedVariation } from '@/lib/square/types'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

const SIZE: CachedItemOption = {
  id: 'OPT_SIZE',
  name: 'Size',
  values: [
    { id: 'S', name: 'Small' },
    { id: 'M', name: 'Medium' }
  ]
}
const VARIATIONS: CachedVariation[] = [
  { id: 'V_S', name: 'Small', price: { amount: 2500, currency: 'USD' }, sku: null, optionValueIds: ['S'] },
  { id: 'V_M', name: 'Medium', price: { amount: 3500, currency: 'USD' }, sku: null, optionValueIds: ['M'] }
]

describe('<PdpPurchasePanel>', () => {
  it('renders the initial variation price', () => {
    render(
      <PdpPurchasePanel
        variations={VARIATIONS}
        itemOptions={[SIZE]}
        productionTimeText="Ships in 3-10 days."
      />
    )
    expect(screen.getByText('$25.00')).toBeInTheDocument()
  })

  it('updates price when variation changes', () => {
    render(
      <PdpPurchasePanel
        variations={VARIATIONS}
        itemOptions={[SIZE]}
        productionTimeText="Ships in 3-10 days."
      />
    )
    fireEvent.change(screen.getByLabelText(/size/i), { target: { value: 'M' } })
    expect(screen.getByText('$35.00')).toBeInTheDocument()
  })

  it('renders the production time text', () => {
    render(
      <PdpPurchasePanel
        variations={VARIATIONS}
        itemOptions={[SIZE]}
        productionTimeText="Ships in 3-10 days."
      />
    )
    expect(screen.getByText('Ships in 3-10 days.')).toBeInTheDocument()
  })

  it('Add-to-Cart button is disabled and has the launch tooltip', () => {
    render(
      <PdpPurchasePanel
        variations={VARIATIONS}
        itemOptions={[SIZE]}
        productionTimeText="x"
      />
    )
    const btn = screen.getByRole('button', { name: /add to cart/i })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', expect.stringMatching(/launching soon/i))
  })

  it('quantity stepper increments and decrements (cannot go below 1)', () => {
    render(
      <PdpPurchasePanel
        variations={VARIATIONS}
        itemOptions={[SIZE]}
        productionTimeText="x"
      />
    )
    const qty = screen.getByLabelText(/quantity/i) as HTMLInputElement
    expect(qty.value).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: /increase quantity/i }))
    expect(qty.value).toBe('2')
    fireEvent.click(screen.getByRole('button', { name: /decrease quantity/i }))
    fireEvent.click(screen.getByRole('button', { name: /decrease quantity/i }))
    expect(qty.value).toBe('1')
  })

  it('renders "Combination unavailable" when picker yields null', () => {
    const VS: CachedVariation[] = [
      { id: 'V_S_AC', name: 'S/AC', price: { amount: 100, currency: 'USD' }, sku: null, optionValueIds: ['S', 'AC'] },
      { id: 'V_M_AC', name: 'M/AC', price: { amount: 200, currency: 'USD' }, sku: null, optionValueIds: ['M', 'AC'] }
    ]
    const SIZE2: CachedItemOption = { id: 'OPT_SIZE', name: 'Size', values: [{ id: 'S', name: 'S' }, { id: 'M', name: 'M' }] }
    const MEDIA: CachedItemOption = { id: 'OPT_MEDIA', name: 'Media', values: [{ id: 'AC', name: 'Acrylic' }, { id: 'VI', name: 'Vinyl' }] }
    render(
      <PdpPurchasePanel variations={VS} itemOptions={[SIZE2, MEDIA]} productionTimeText="x" />
    )
    fireEvent.change(screen.getByLabelText(/media/i), { target: { value: 'VI' } })
    expect(screen.getByText(/combination unavailable/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Create `src/components/product/PdpPurchasePanel.tsx`**

```tsx
'use client'

import { VariantPicker } from '@/components/product/VariantPicker'
import { DISABLED_ADD_TO_CART_TOOLTIP } from '@/lib/site-copy'
import type { CachedItemOption, CachedVariation } from '@/lib/square/types'
import { useState } from 'react'

interface PdpPurchasePanelProps {
  variations: CachedVariation[]
  itemOptions: CachedItemOption[]
  productionTimeText: string
}

function formatPrice(v: CachedVariation | null): string {
  if (!v?.price) return ''
  return `$${(v.price.amount / 100).toFixed(2)}`
}

export function PdpPurchasePanel({
  variations,
  itemOptions,
  productionTimeText
}: PdpPurchasePanelProps): JSX.Element {
  const [selected, setSelected] = useState<CachedVariation | null>(variations[0] ?? null)
  const [qty, setQty] = useState(1)

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
        {selected ? formatPrice(selected) : <span>Combination unavailable</span>}
      </div>
      <p style={{ color: '#666', fontSize: '0.9rem' }}>{productionTimeText}</p>

      <VariantPicker variations={variations} itemOptions={itemOptions} onChange={setSelected} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <label htmlFor="qty" style={{ fontWeight: 600 }}>
          Quantity
        </label>
        <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))}>
          −
        </button>
        <input
          id="qty"
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          style={{ width: '4rem', textAlign: 'center' }}
          readOnly
        />
        <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => q + 1)}>
          +
        </button>
      </div>

      <button
        type="button"
        disabled
        title={DISABLED_ADD_TO_CART_TOOLTIP}
        style={{
          padding: '0.75rem 1.5rem',
          background: '#ddd',
          color: '#555',
          border: 'none',
          borderRadius: '0.25rem',
          cursor: 'not-allowed'
        }}
      >
        Add to Cart
      </button>
      <small style={{ color: '#666' }}>{DISABLED_ADD_TO_CART_TOOLTIP}</small>
    </div>
  )
}
```

- [ ] **Step 3: Run the tests**

Run: `pnpm vitest run tests/public/pdp-purchase-panel.test.tsx`
Expected: 6/6 pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/product/PdpPurchasePanel.tsx tests/public/pdp-purchase-panel.test.tsx
git commit -m "Phase 5/D: <PdpPurchasePanel> client island + unit tests"
```

### Task D.4: Image-host allowlist

- [ ] **Step 1: Verify Square image hosts against live responses BEFORE committing**

Probe both environments:
```sh
# Production probe: pick any real item id and inspect its imageData URL
# (one path: hit a real /artist/<slug> page that has products, view source,
# find the s3.us-west-2.amazonaws.com URL)
curl -sI 'https://items-images-production.s3.us-west-2.amazonaws.com/' | head -5

# Sandbox probe: same drill via the local dev server hitting sandbox
# credentials. The expected hostname is items-images-sandbox.s3.us-west-2.amazonaws.com.
# Adjust the next.config.mjs values below if either hostname differs.
```

If the probe returns a different hostname, amend the `remotePatterns` entries in step 2 accordingly. Otherwise proceed.

- [ ] **Step 2: Edit `next.config.mjs`**

Replace the `images.remotePatterns` line:

```ts
/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  experimental: {
    typedRoutes: true
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'items-images-production.s3.us-west-2.amazonaws.com'
      },
      {
        protocol: 'https',
        hostname: 'items-images-sandbox.s3.us-west-2.amazonaws.com'
      }
    ]
  }
}

export default config
```

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add next.config.mjs
git commit -m "Phase 5/D: allowlist Square S3 image hostnames in next/image"
```

### Task D.5: Replace the /product/[id] stub with the real PDP

- [ ] **Step 1: Replace `src/app/product/[id]/page.tsx`**

```tsx
import { ArtistMetaLine } from '@/components/product/ArtistMetaLine'
import { MockupGallery } from '@/components/product/MockupGallery'
import { PdpPurchasePanel } from '@/components/product/PdpPurchasePanel'
import { getRelatedProducts } from '@/lib/categories/related'
import { MOCKUP_SCENES } from '@/lib/mockup-scenes'
import { getProductById } from '@/lib/products/cache'
import { sanitizeProductDescription, stripHtml } from '@/lib/sanitize-html'
import { PRODUCTION_TIME_TEXT } from '@/lib/site-copy'
import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface PageProps {
  params: { id: string }
}

export async function generateMetadata({ params }: PageProps) {
  const product = await getProductById(params.id)
  if (!product) return { title: 'Product not found | Animeniacs' }
  return {
    title: `${product.name} | Animeniacs`,
    description: stripHtml(product.descriptionHtml).slice(0, 160) || product.name
  }
}

export default async function ProductDetailPage({ params }: PageProps): Promise<JSX.Element> {
  const product = await getProductById(params.id)
  if (!product) notFound()

  const related = await getRelatedProducts(product.id, product.categoryIds)
  const sanitized = product.descriptionHtml
    ? sanitizeProductDescription(product.descriptionHtml)
    : null

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-gray-600">
        <Link href={'/' as Route} className="underline hover:no-underline">
          Home
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{product.name}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-2">
        <MockupGallery
          scenes={[...MOCKUP_SCENES]}
          productImages={product.images}
          productName={product.name}
        />

        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-bold">{product.name}</h1>
          {/* @ts-expect-error Server Component */}
          <ArtistMetaLine categoryIds={product.categoryIds} />
          <PdpPurchasePanel
            variations={product.variations}
            itemOptions={product.itemOptions}
            productionTimeText={PRODUCTION_TIME_TEXT}
          />
        </div>
      </div>

      {sanitized && (
        <section className="mt-12 max-w-3xl">
          <h2 className="mb-3 text-xl font-semibold">Description</h2>
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via dompurify */}
          <div
            className="prose prose-sm"
            dangerouslySetInnerHTML={{ __html: sanitized }}
          />
        </section>
      )}

      {related.source && related.items.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-semibold">
            More from {related.source.kind === 'artist' ? related.source.displayName : related.source.nickname}
          </h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
            {related.items.map((p) => (
              <li key={p.id}>
                <Link href={`/product/${p.id}` as Route} className="block">
                  {p.imageUrl ? (
                    <Image
                      src={p.imageUrl}
                      alt={p.name}
                      width={300}
                      height={450}
                      className="aspect-[2/3] w-full rounded object-cover"
                    />
                  ) : (
                    <div className="aspect-[2/3] w-full rounded bg-gray-200" aria-hidden="true" />
                  )}
                  <div className="mt-1 text-sm">{p.name}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `src/app/product/[id]/loading.tsx`**

```tsx
export default function Loading(): JSX.Element {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-4 h-4 w-1/3 animate-pulse rounded bg-gray-200" />
      <div className="grid gap-8 md:grid-cols-2">
        <div className="aspect-[16/10] w-full animate-pulse rounded bg-gray-200" />
        <div className="flex flex-col gap-4">
          <div className="h-8 w-2/3 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200" />
          <div className="h-12 w-full animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/app/product/[id]/error.tsx`**

```tsx
'use client'

export default function ProductError({
  error,
  reset
}: {
  error: Error
  reset: () => void
}): JSX.Element {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-3 text-2xl font-semibold">Couldn't load this product.</h1>
      <p className="mb-4 text-gray-600">
        Something went wrong fetching this product. Try again, or come back later.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded bg-gray-900 px-4 py-2 text-white"
      >
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

- [ ] **Step 4: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: clean. Build output should now list `/product/[id]` as a regular page (not an `error` route only).

- [ ] **Step 5: Commit**

```bash
git add src/app/product/[id]/page.tsx src/app/product/[id]/loading.tsx src/app/product/[id]/error.tsx
git commit -m "Phase 5/D: replace PDP stub with real layout (gallery + picker + description + related)"
```

### Task D.6: PDP route unit tests

- [ ] **Step 1: Create `tests/public/product-detail-page.test.tsx`**

```tsx
import ProductDetailPage from '@/app/product/[id]/page'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

const mockGetProductById = vi.fn()
const mockGetRelated = vi.fn()
const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})

vi.mock('@/lib/products/cache', () => ({ getProductById: mockGetProductById }))
vi.mock('@/lib/categories/related', () => ({ getRelatedProducts: mockGetRelated }))
vi.mock('next/navigation', () => ({ notFound: mockNotFound }))
vi.mock('@/components/product/ArtistMetaLine', () => ({
  ArtistMetaLine: ({ categoryIds }: { categoryIds: string[] }) => (
    <div data-testid="artist-meta" data-cats={categoryIds.join(',')} />
  )
}))
vi.mock('@/components/product/MockupGallery', () => ({
  MockupGallery: () => <div data-testid="mockup-gallery" />
}))
vi.mock('@/components/product/PdpPurchasePanel', () => ({
  PdpPurchasePanel: () => <div data-testid="pdp-panel" />
}))
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href as string}>{children}</a>
  )
}))

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 'P1',
    name: 'Cool Print',
    description: null,
    descriptionHtml: '<p>Nice <strong>print</strong></p>',
    variations: [],
    images: ['https://example.com/img.jpg'],
    categoryIds: ['ART_CAT', 'IP_CAT'],
    itemOptions: [],
    updatedAt: '2026-05-22T00:00:00Z',
    ...overrides
  }
}

describe('ProductDetailPage', () => {
  it('renders H1 + breadcrumbs exactly "Home / {name}" (no IP segment)', async () => {
    mockGetProductById.mockResolvedValueOnce(product())
    mockGetRelated.mockResolvedValueOnce({ items: [], source: null })
    const ui = await ProductDetailPage({ params: { id: 'P1' } })
    render(ui)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cool Print')
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i })
    expect(nav.textContent).toMatch(/^Home\s*\/\s*Cool Print\s*$/)
    // IP-leak regression guard: the literal Square category id / IP names
    // must not be in the page.
    expect(nav.textContent).not.toMatch(/IP_CAT|ART_CAT/i)
  })

  it('passes categoryIds to <ArtistMetaLine>', async () => {
    mockGetProductById.mockResolvedValueOnce(product())
    mockGetRelated.mockResolvedValueOnce({ items: [], source: null })
    const ui = await ProductDetailPage({ params: { id: 'P1' } })
    render(ui)
    expect(screen.getByTestId('artist-meta')).toHaveAttribute('data-cats', 'ART_CAT,IP_CAT')
  })

  it('omits the description section when descriptionHtml is null', async () => {
    mockGetProductById.mockResolvedValueOnce(product({ descriptionHtml: null }))
    mockGetRelated.mockResolvedValueOnce({ items: [], source: null })
    const ui = await ProductDetailPage({ params: { id: 'P1' } })
    render(ui)
    expect(screen.queryByRole('heading', { name: /description/i })).toBeNull()
  })

  it('omits the related section when source is null', async () => {
    mockGetProductById.mockResolvedValueOnce(product())
    mockGetRelated.mockResolvedValueOnce({ items: [], source: null })
    const ui = await ProductDetailPage({ params: { id: 'P1' } })
    render(ui)
    expect(screen.queryByRole('heading', { name: /more from/i })).toBeNull()
  })

  it('renders related section with artist label when source.kind === "artist"', async () => {
    mockGetProductById.mockResolvedValueOnce(product())
    mockGetRelated.mockResolvedValueOnce({
      items: [{ id: 'X', name: 'Other', imageUrl: null, priceCents: 100, categoryIds: [] }],
      source: { kind: 'artist', slug: 'noah', displayName: 'Noah' }
    })
    const ui = await ProductDetailPage({ params: { id: 'P1' } })
    render(ui)
    expect(screen.getByRole('heading', { name: /more from noah/i })).toBeInTheDocument()
  })

  it('renders related section with nickname label when source.kind === "ip"', async () => {
    mockGetProductById.mockResolvedValueOnce(product())
    mockGetRelated.mockResolvedValueOnce({
      items: [{ id: 'X', name: 'Other', imageUrl: null, priceCents: 100, categoryIds: [] }],
      source: { kind: 'ip', slug: 'ramen-shop', nickname: 'Ramen Shop' }
    })
    const ui = await ProductDetailPage({ params: { id: 'P1' } })
    render(ui)
    expect(screen.getByRole('heading', { name: /more from ramen shop/i })).toBeInTheDocument()
  })

  it('calls notFound() when product is null', async () => {
    mockGetProductById.mockResolvedValueOnce(null)
    await expect(ProductDetailPage({ params: { id: 'MISSING' } })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `pnpm vitest run tests/public/product-detail-page.test.tsx`
Expected: 7/7 pass.

- [ ] **Step 3: Commit**

```bash
git add tests/public/product-detail-page.test.tsx
git commit -m "Phase 5/D: PDP route unit tests (incl. IP-leak regression guard)"
```

### Task D.7: Group D acceptance gate

- [ ] **Step 1: Run full automated gate**

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

Expected:
- lint + typecheck + build clean
- unit tests: previous total + 10 (D.1) + 4 (D.2) + 6 (D.3) + 7 (D.6) = 116 passing
- integration: 55 passing (no integration tests added in Group D)
- Build output lists `/product/[id]` as a dynamic route (not a stub).

- [ ] **Step 2: Group D done**

---

## Task Group E — `/category/[slug]` public IP browse page

Depends on Groups A and B (not C). Ships the public IP browse page + its loading/error UI + a thin wrapper helper.

### Task E.1: `getProductsForIpNickname` helper

- [ ] **Step 1: Create `src/lib/categories/index.ts`**

```ts
import 'server-only'
import type { IpNickname } from '@/lib/db/schema'
import { type ArtistProduct, getItemsByCategoryId } from '@/lib/square/items'

/**
 * Thin wrapper around getItemsByCategoryId for the public IP browse page.
 * Lives here (not in `square/items`) so the public read paths can grow
 * other category-shaped helpers without polluting the Square SDK module.
 */
export async function getProductsForIpNickname(nickname: IpNickname): Promise<ArtistProduct[]> {
  return getItemsByCategoryId(nickname.squareCategoryId)
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/categories/index.ts
git commit -m "Phase 5/E: getProductsForIpNickname wrapper"
```

### Task E.2: Failing tests for /category/[slug]

- [ ] **Step 1: Create `tests/public/category-page.test.tsx`**

```tsx
import CategoryPage from '@/app/category/[slug]/page'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

const mockGetBySlug = vi.fn()
const mockGetProducts = vi.fn()
const mockGetCategoryNameMap = vi.fn()
const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})

vi.mock('@/lib/db/queries/ip-nicknames', () => ({ getIpNicknameBySlug: mockGetBySlug }))
vi.mock('@/lib/categories', () => ({ getProductsForIpNickname: mockGetProducts }))
vi.mock('@/lib/square/categories', () => ({ getCategoryNameMap: mockGetCategoryNameMap }))
vi.mock('next/navigation', () => ({ notFound: mockNotFound }))
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href as string}>{children}</a>
  )
}))

function nickname(overrides: Record<string, unknown> = {}) {
  return {
    id: 'N1',
    slug: 'ramen-shop',
    nickname: 'Ramen Shop',
    squareCategoryId: 'CAT_NARUTO',
    description: 'Drops featuring ramen.',
    coverImageUrl: null,
    isPublic: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }
}

describe('CategoryPage', () => {
  it('renders H1 = nickname and description', async () => {
    mockGetBySlug.mockResolvedValueOnce(nickname())
    mockGetProducts.mockResolvedValueOnce([])
    mockGetCategoryNameMap.mockResolvedValueOnce(new Map([['CAT_NARUTO', 'Anime > Naruto']]))
    const ui = await CategoryPage({ params: { slug: 'ramen-shop' } })
    render(ui)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ramen Shop')
    expect(screen.getByText(/drops featuring ramen/i)).toBeInTheDocument()
  })

  it('REGRESSION GUARD: never renders the literal Square category name', async () => {
    mockGetBySlug.mockResolvedValueOnce(nickname())
    mockGetProducts.mockResolvedValueOnce([])
    mockGetCategoryNameMap.mockResolvedValueOnce(new Map([['CAT_NARUTO', 'Anime > Naruto']]))
    const ui = await CategoryPage({ params: { slug: 'ramen-shop' } })
    const { container } = render(ui)
    // The Square category name "Anime > Naruto" must NEVER appear in the DOM
    // on this public page. This is the canary for the IP-never-public constraint.
    expect(container.textContent).not.toMatch(/Anime/i)
    expect(container.textContent).not.toMatch(/Naruto/i)
  })

  it('renders product grid with PDP links when products exist', async () => {
    mockGetBySlug.mockResolvedValueOnce(nickname())
    mockGetProducts.mockResolvedValueOnce([
      { id: 'P1', name: 'Print A', imageUrl: 'https://example.com/a.jpg', priceCents: 2500, categoryIds: [] },
      { id: 'P2', name: 'Print B', imageUrl: null, priceCents: null, categoryIds: [] }
    ])
    mockGetCategoryNameMap.mockResolvedValueOnce(new Map())
    const ui = await CategoryPage({ params: { slug: 'ramen-shop' } })
    render(ui)
    const link1 = screen.getByRole('link', { name: /print a/i })
    expect(link1).toHaveAttribute('href', '/product/P1')
    expect(screen.getByText('Print B')).toBeInTheDocument()
  })

  it('shows empty state when no products', async () => {
    mockGetBySlug.mockResolvedValueOnce(nickname())
    mockGetProducts.mockResolvedValueOnce([])
    mockGetCategoryNameMap.mockResolvedValueOnce(new Map())
    const ui = await CategoryPage({ params: { slug: 'ramen-shop' } })
    render(ui)
    expect(screen.getByText(/no drops featuring ramen shop/i)).toBeInTheDocument()
  })

  it('calls notFound() when nickname missing', async () => {
    mockGetBySlug.mockResolvedValueOnce(undefined)
    await expect(CategoryPage({ params: { slug: 'missing' } })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('calls notFound() when nickname is_public=false', async () => {
    mockGetBySlug.mockResolvedValueOnce(nickname({ isPublic: false }))
    await expect(CategoryPage({ params: { slug: 'hidden' } })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('omits description section when description is null', async () => {
    mockGetBySlug.mockResolvedValueOnce(nickname({ description: null }))
    mockGetProducts.mockResolvedValueOnce([])
    mockGetCategoryNameMap.mockResolvedValueOnce(new Map())
    const ui = await CategoryPage({ params: { slug: 'ramen-shop' } })
    const { container } = render(ui)
    expect(container.querySelector('[data-testid="ip-description"]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run — should fail (page doesn't exist)**

Run: `pnpm vitest run tests/public/category-page.test.tsx`
Expected: FAIL with module-not-found.

### Task E.3: Implement /category/[slug] page

- [ ] **Step 1: Create `src/app/category/[slug]/page.tsx`**

```tsx
import { getProductsForIpNickname } from '@/lib/categories'
import { getIpNicknameBySlug } from '@/lib/db/queries/ip-nicknames'
import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface PageProps {
  params: { slug: string }
}

export async function generateMetadata({ params }: PageProps) {
  const nickname = await getIpNicknameBySlug(params.slug)
  if (!nickname || !nickname.isPublic) return { title: 'Not found | Animeniacs' }
  return {
    title: `${nickname.nickname} | Animeniacs`,
    description:
      nickname.description?.slice(0, 160) ?? `Drops featuring ${nickname.nickname}.`
  }
}

export default async function CategoryPage({ params }: PageProps): Promise<JSX.Element> {
  const nickname = await getIpNicknameBySlug(params.slug)
  if (!nickname || !nickname.isPublic) notFound()

  const products = await getProductsForIpNickname(nickname)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header
        className="mb-8 flex h-48 items-center justify-center rounded-lg"
        style={{
          // Brand-neutral CSS gradient until per-IP cover image uploads land.
          background: 'linear-gradient(135deg, #1f2937 0%, #4b5563 100%)'
        }}
      >
        <h1 className="text-4xl font-bold text-white">{nickname.nickname}</h1>
      </header>

      {nickname.description && (
        <p data-testid="ip-description" className="mb-8 text-gray-700">
          {nickname.description}
        </p>
      )}

      {products.length === 0 ? (
        <section className="rounded-lg bg-gray-50 p-8 text-center">
          <p>No drops featuring {nickname.nickname} just yet.</p>
        </section>
      ) : (
        <section>
          <h2 className="sr-only">Drops</h2>
          <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            {products.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/product/${p.id}` as Route}
                  className="block rounded-lg transition hover:opacity-90"
                >
                  {p.imageUrl ? (
                    <Image
                      src={p.imageUrl}
                      alt={p.name}
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
                  <div className="mt-2 text-sm font-medium">{p.name}</div>
                  {p.priceCents !== null && (
                    <div className="text-sm text-gray-600">
                      ${(p.priceCents / 100).toFixed(2)}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `src/app/category/[slug]/loading.tsx`**

```tsx
export default function Loading(): JSX.Element {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 h-48 w-full animate-pulse rounded-lg bg-gray-200" />
      <div className="mb-8 h-4 w-1/2 animate-pulse rounded bg-gray-200" />
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="aspect-[2/3] w-full animate-pulse rounded bg-gray-200" />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/app/category/[slug]/error.tsx`**

```tsx
'use client'

export default function CategoryError({
  error,
  reset
}: {
  error: Error
  reset: () => void
}): JSX.Element {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-3 text-2xl font-semibold">Couldn't load this page.</h1>
      <p className="mb-4 text-gray-600">Something went wrong. Try again, or come back later.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded bg-gray-900 px-4 py-2 text-white"
      >
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

- [ ] **Step 4: Run tests + build**

Run: `pnpm vitest run tests/public/category-page.test.tsx && pnpm typecheck && pnpm build`
Expected: 7/7 tests pass, typecheck + build clean. Build output lists `/category/[slug]` as a new dynamic route.

- [ ] **Step 5: Commit**

```bash
git add src/app/category/[slug]/page.tsx src/app/category/[slug]/loading.tsx src/app/category/[slug]/error.tsx tests/public/category-page.test.tsx
git commit -m "Phase 5/E: /category/[slug] public IP browse page (+ IP-leak regression guard test)"
```

### Task E.4: Group E acceptance gate

- [ ] **Step 1: Run full automated gate**

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

Expected:
- lint + typecheck + build clean
- unit tests: previous total + 7 (E.2) = 123 passing
- integration: 55 passing
- Build lists `/category/[slug]` as a new route.

- [ ] **Step 2: Group E done**

---

## Final acceptance gate (whole phase)

This runs after all five groups are merged. It's the gate before tagging.

- [ ] **Step 1: Hard-constraint canary**

```sh
grep -rn "goaffpro\|GoAffPro" src/ tests/
```
Expected: zero hits (only `scripts/goaffpro/probe.ts` is the historical reference, and `src/ tests/` excludes it).

- [ ] **Step 2: Full automated gate**

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

Expected: all clean. Build output should list the 5 new routes:
- `/product/[id]` (dynamic, ready to render — no longer a stub)
- `/category/[slug]` (dynamic, new)
- `/admin/ip-nicknames` (new)
- `/admin/ip-nicknames/new` (new)
- `/admin/ip-nicknames/[id]` (dynamic, new)

Test count expectations (totals after Phase 5):
- Unit: ~123 (up from baseline 63)
- Integration: ~55 (up from baseline 40)

- [ ] **Step 3: Manual smoke checklist (operator does this)**

The execution agent **STOPS HERE** and surfaces the smoke checklist to the operator. The operator runs through it locally before the tag is applied.

1. `pnpm dev` and `docker compose up postgres -d` running.
2. Sign in at `/sign-in`, redirected to `/admin/artists` (or wherever the admin lands).
3. Navigate to `/admin/ip-nicknames` — empty list page renders.
4. Click "+ new nickname".
5. Pick a hierarchical-labeled category from the dropdown (confirm labels like `Anime > Naruto` appear).
6. Fill slug `ramen-shop`, nickname `Ramen Shop`, description anything. Submit.
7. Redirected to list page — new row appears with green "Public" badge.
8. Visit `/category/ramen-shop` (replace with the slug you used) — gradient cover + nickname + description + product grid (or empty state if the chosen category has no items in Square).
9. Visit `/product/<a-real-item-id>` (pick one from `/artist/<slug>` grid):
   - Mockup gallery loads. Click a scene thumbnail → background swaps.
   - If the product has multiple images: click a thumbnail under "Product images" → overlay swap.
   - If variations exist: change a `<select>` → price updates above.
   - Description block renders (sanitized HTML).
   - Artist meta line renders with "Designed by …" + Instagram icon if applicable.
   - Add-to-Cart button is greyed out + hover tooltip says "Shopping cart launching soon — follow us on Instagram for the launch."
   - Related products section either renders or is correctly hidden.
10. View page source for `/product/[id]` AND `/category/[slug]` — confirm no Square category name (e.g. "Naruto", "Anime") appears in the public DOM.
11. Edit the nickname → flip to Hidden → save → visit `/category/ramen-shop` → 404.
12. Flip back to Public → 200.

- [ ] **Step 4: Write `docs/superpowers/specs/reference/phase-05-handoff.md`**

After the manual smoke passes, the execution agent writes the phase handoff doc matching `phase-04-handoff.md`'s structure. This is **non-negotiable** — the master terminal needs it to bootstrap Phase 6. See the execution-handoff prompt for the full template.

- [ ] **Step 5: Tag the phase**

```sh
git tag phase-5-product-detail-page
git push origin main --tags  # if the operator confirms it's time to push
```

The tag is applied at the HEAD that includes the Phase 5 handoff doc commit.

---

## Spec self-review (plan vs spec coverage)

Cross-checking every spec section to a plan task:

| Spec section | Covered by |
|---|---|
| §4 Acceptance criteria | Final acceptance gate (above) + Task E.4 + the manual smoke |
| §5 Architecture overview | Whole plan; tracked in the file-structure table |
| §6.1 `ip_nicknames` table | Task B.1 |
| §6.2 `product_cache` wiring | Task A.3 (writeCache + readFresh) |
| §6.3 Type extensions | Task A.1 |
| §7 cache.ts | Task A.3 |
| §7 ip-nicknames.ts queries | Task B.3 |
| §7 related.ts | Task D.2 |
| §7 categories/index.ts | Task E.1 |
| §7.1 categories.ts additions | Task B.5 |
| §8 Admin UI | Tasks B.6 – B.10 |
| §9.1 MockupGallery | Task C.4 |
| §9.2 VariantPicker | Task C.6 |
| §9.4 Scene library | Tasks C.1 + C.2 |
| §10 PDP route + PdpPurchasePanel | Tasks D.3 + D.5 |
| §11 /category/[slug] | Task E.3 |
| §12.1 sanitize-html | Task D.1 |
| §12.2 site-copy | Task D.1 |
| §12.3 next.config.mjs | Task D.4 |
| §13.1 Unit tests | C.3, C.5, D.1, D.2, D.3, D.6, E.2, B.4, B.9, A.2 |
| §13.2 Integration tests | A.4, B.2 |
| §13.3 Manual smoke | Final gate Step 3 |
| §13.4 Pre-tag acceptance gate | Final gate Step 2 |

No spec sections without a task. No tasks reference symbols not defined elsewhere in the plan (cross-checked: `getProductById`, `denormalize`, `__forceRefresh`, `getNonArtistCategories`, `buildHierarchicalLabel`, `loadIpCategoryOptions`, `parseIpNicknameForm`, `validateIpNicknameInput`, `detectIpNicknameUniqueViolation`, `createIpNicknameAction`, `updateIpNicknameAction`, `sanitizeProductDescription`, `stripHtml`, `getRelatedProducts`, `getProductsForIpNickname`, `MOCKUP_SCENES`, `PRODUCTION_TIME_TEXT`, `DISABLED_ADD_TO_CART_TOOLTIP`, `MockupGallery`, `VariantPicker`, `PdpPurchasePanel`, `IpNicknameForm`, `ArtistMetaLine` — all defined in their respective tasks).

Type consistency check:
- `CachedItemOption` and `CachedItemOptionValue` definitions in A.1 match the consumer shapes in C.5/C.6 and D.3.
- `RelatedSource` discriminated union in D.2 matches the conditional rendering in D.5.
- `IpNicknameFormState` defined in B.7 used consistently in B.8.

---

## End of plan.





