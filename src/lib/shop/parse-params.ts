/**
 * Pure parsing/normalization of `/shop` query params. No I/O — fully unit
 * testable. Garbage input degrades to defaults (never throws): unknown sort →
 * null, non-numeric/negative bounds → null, non-positive/NaN page → 1.
 *
 * Slug → squareCategoryId resolution is NOT done here (it needs the DB option
 * lists). The page resolves `categorySlug`/`artistSlug` against the public IP
 * nicknames + active artists and fills `categoryId`/`artistCategoryId`.
 */

export type ShopSort = 'rating' | 'price_asc' | 'price_desc' | 'newest'

const SORTS: readonly ShopSort[] = ['rating', 'price_asc', 'price_desc', 'newest']

export interface ShopQuery {
  /** case-insensitive name substring; null when absent/blank */
  q: string | null
  /** raw public IP-nickname slug from the URL; resolved by the page */
  categorySlug: string | null
  /** raw active-artist slug from the URL; resolved by the page */
  artistSlug: string | null
  /** resolved Square category id for the IP filter (page-filled) */
  categoryId: string | null
  /** resolved Square category id for the artist filter (page-filled) */
  artistCategoryId: string | null
  /** lower price bound in cents; null when absent/invalid */
  minCents: number | null
  /** upper price bound in cents; null when absent/invalid */
  maxCents: number | null
  /** validated sort key; null = default alpha-by-name */
  sort: ShopSort | null
  /** 1-based page; >= 1 (final range clamp happens in `paginate`) */
  page: number
}

export type RawSearchParams = Record<string, string | string[] | undefined>

/** Returns the first value when a param arrives as an array (`?q=a&q=b`). */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Trim + drop empty → null. */
function cleanString(value: string | string[] | undefined): string | null {
  const raw = first(value)
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Dollars string → integer cents; null for blank/non-finite/negative. */
function dollarsToCents(value: string | string[] | undefined): number | null {
  const raw = first(value)
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const dollars = Number(raw)
  if (!Number.isFinite(dollars) || dollars < 0) return null
  return Math.round(dollars * 100)
}

export function parseShopParams(searchParams: RawSearchParams): ShopQuery {
  const sortRaw = first(searchParams.sort)
  const sort = SORTS.includes(sortRaw as ShopSort) ? (sortRaw as ShopSort) : null

  const pageRaw = Number(first(searchParams.page))
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1

  return {
    q: cleanString(searchParams.q),
    categorySlug: cleanString(searchParams.category),
    artistSlug: cleanString(searchParams.artist),
    categoryId: null,
    artistCategoryId: null,
    minCents: dollarsToCents(searchParams.min),
    maxCents: dollarsToCents(searchParams.max),
    sort,
    page
  }
}
