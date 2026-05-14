import 'server-only'

/**
 * Keys for the four catalog custom attribute definitions Phase 3 creates.
 * The `as const` union is used directly in code paths that pluck attribute
 * values from a CatalogItem.
 */
export const CUSTOM_ATTR_KEYS = {
  ARTIST: 'artist',
  IP: 'ip',
  PRODUCT_TYPE: 'product_type',
  SIBLING_GROUP: 'sibling_group'
} as const

export type CustomAttrKey = (typeof CUSTOM_ATTR_KEYS)[keyof typeof CUSTOM_ATTR_KEYS]

/**
 * Allowed values for the `product_type` Selection custom attribute.
 * Mirrors the spec §3 enum. New values require a Square dashboard edit
 * AND a code change here.
 */
export const PRODUCT_TYPES = [
  'acrylic',
  'vinyl',
  'lit-box',
  'acoustic-panel',
  'accessory',
  'custom'
] as const
export type ProductType = (typeof PRODUCT_TYPES)[number]

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
 * - `customAttributes` is keyed by our CUSTOM_ATTR_KEYS values.
 *   A missing key means the staff didn't set that attribute on this
 *   item; consumers must handle the absent case.
 * - `categoryIds` maps to Square category IDs; Phase 4 resolves them
 *   to names via a separate category lookup.
 */
export interface CachedProduct {
  id: string
  name: string
  description: string | null
  descriptionHtml: string | null
  variations: CachedVariation[]
  images: string[]
  categoryIds: string[]
  customAttributes: Partial<Record<CustomAttrKey, string>>
  updatedAt: string // ISO-8601 from Square
}

/**
 * Helper type guard for the Selection-typed product_type value.
 */
export function isProductType(value: string | undefined): value is ProductType {
  return value !== undefined && (PRODUCT_TYPES as readonly string[]).includes(value)
}
