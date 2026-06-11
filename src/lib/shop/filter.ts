import type { ReviewSummary } from '@/lib/db/queries/reviews'
import type { ArtistProduct } from '@/lib/square/items'
import type { ShopQuery } from '@/lib/shop/parse-params'

/**
 * Pure, I/O-free filter + sort over the cached `getShopProducts()` result.
 * Category/artist slug → squareCategoryId resolution happens in the page; this
 * function takes the already-resolved `categoryId`/`artistCategoryId`.
 *
 * Filters (all ANDed): name substring (case-insensitive), category containment,
 * artist containment, price range. Null-price (variable-price) products are
 * excluded ONLY when a price bound is set. Returns a NEW array — never mutates
 * the input.
 */
export function filterAndSortProducts(
  products: ArtistProduct[],
  summaries: Map<string, ReviewSummary>,
  query: ShopQuery
): ArtistProduct[] {
  const needle = query.q?.toLowerCase() ?? null
  const hasPriceBound = query.minCents !== null || query.maxCents !== null

  const filtered = products.filter((product) => {
    if (needle && !product.name.toLowerCase().includes(needle)) return false
    if (query.categoryId && !product.categoryIds.includes(query.categoryId)) return false
    if (query.artistCategoryId && !product.categoryIds.includes(query.artistCategoryId)) {
      return false
    }
    if (hasPriceBound) {
      if (product.priceCents === null) return false
      if (query.minCents !== null && product.priceCents < query.minCents) return false
      if (query.maxCents !== null && product.priceCents > query.maxCents) return false
    }
    return true
  })

  return sortProducts(filtered, summaries, query.sort)
}

/** Sorts a copy of `products` by the chosen key. Default = alpha-by-name. */
function sortProducts(
  products: ArtistProduct[],
  summaries: Map<string, ReviewSummary>,
  sort: ShopQuery['sort']
): ArtistProduct[] {
  const out = [...products]
  switch (sort) {
    case 'rating':
      out.sort((a, b) => {
        const sa = summaries.get(a.id) ?? { count: 0, average: 0 }
        const sb = summaries.get(b.id) ?? { count: 0, average: 0 }
        if (sb.average !== sa.average) return sb.average - sa.average
        return sb.count - sa.count
      })
      return out
    case 'price_asc':
      out.sort((a, b) => comparePrice(a.priceCents, b.priceCents, 'asc'))
      return out
    case 'price_desc':
      out.sort((a, b) => comparePrice(a.priceCents, b.priceCents, 'desc'))
      return out
    case 'newest':
      out.sort((a, b) => {
        // null updatedAt sorts last
        if (a.updatedAt === null && b.updatedAt === null) return 0
        if (a.updatedAt === null) return 1
        if (b.updatedAt === null) return -1
        return b.updatedAt.localeCompare(a.updatedAt)
      })
      return out
    default:
      out.sort((a, b) => a.name.localeCompare(b.name))
      return out
  }
}

/** Compares two nullable prices; nulls always sort last regardless of direction. */
function comparePrice(a: number | null, b: number | null, dir: 'asc' | 'desc'): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return dir === 'asc' ? a - b : b - a
}

export interface PaginationResult<T> {
  pageItems: T[]
  page: number
  pageCount: number
  total: number
}

/**
 * Slices `items` into a page window. `page` is clamped to `[1, pageCount]`, so
 * an out-of-range page snaps to the last page (and `0`/negative snaps to 1).
 * Empty input yields `pageCount: 1`, `page: 1`, and an empty window.
 */
export function paginate<T>(items: T[], page: number, pageSize: number): PaginationResult<T> {
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const clamped = Math.min(Math.max(1, Math.floor(page)), pageCount)
  const start = (clamped - 1) * pageSize
  return {
    pageItems: items.slice(start, start + pageSize),
    page: clamped,
    pageCount,
    total
  }
}
