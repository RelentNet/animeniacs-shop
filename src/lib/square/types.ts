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
