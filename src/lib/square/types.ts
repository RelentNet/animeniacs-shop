import 'server-only'

/**
 * Money values from Square are integers in the smallest currency unit
 * (cents for USD). We preserve that on the cache side.
 */
export interface CachedMoney {
  amount: number
  currency: string
}

/**
 * One catalog item variation (size, material, etc.) denormalized for
 * fast read. Phase 3 stores variations inline; Phase 4 surfaces them
 * as the variant picker.
 */
export interface CachedVariation {
  id: string
  name: string
  price: CachedMoney | null
  sku: string | null
}

/**
 * The denormalized product blob written into product_cache.data.
 *
 * - `images` is an ordered list; `images[0]` is the primary.
 * - `categoryIds` maps to Square category IDs; Phase 4 resolves them
 *   to names via a separate category lookup, and joins artist-owned
 *   category IDs against the local `artists` table.
 */
export interface CachedProduct {
  id: string
  name: string
  description: string | null
  descriptionHtml: string | null
  variations: CachedVariation[]
  images: string[]
  categoryIds: string[]
  updatedAt: string // ISO-8601 from Square
}
