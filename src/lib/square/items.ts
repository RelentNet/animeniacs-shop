import 'server-only'
import { unstable_cache as cache } from 'next/cache'
import { getSquareClient } from './client'

/**
 * Public-facing product card shape. A minimal projection of the Square
 * `CatalogItem` containing only the bits the artist-page grid needs.
 *
 * Phase 4 ships this in isolation; Phase 5's full PDP will surface the
 * larger CachedProduct shape from src/lib/square/types.ts.
 */
export interface ArtistProduct {
  id: string
  name: string
  /** First image URL, if any. Square returns presigned CDN URLs. */
  imageUrl: string | null
  /** Lowest variation price in cents (USD), or null if variable / not set. */
  priceCents: number | null
  /** Square category IDs the item belongs to. Useful for downstream filters. */
  categoryIds: string[]
}

/**
 * Returns active (non-archived) catalog items whose `categories[]`
 * contains the given category id. Image URLs are resolved by fetching
 * each referenced IMAGE object.
 *
 * Implementation choices:
 *   - Uses `searchItems({ categoryIds: [...] })` which is the Square
 *     SDK's documented happy path for category-filtered item listings.
 *   - Filters out archived items in code (search returns them as well).
 *   - Resolves images via `batchGet` so a single round-trip pulls every
 *     referenced IMAGE for the whole result page.
 *   - Cached per-category-id for 60 seconds so a page reload while
 *     browsing doesn't re-hit Square. Aggressive invalidation isn't
 *     needed because the admin actions revalidate `/artist/<slug>`
 *     after edits, and Square's catalog itself isn't being edited
 *     from the app side.
 */
export const getItemsByCategoryId = cache(
  async (categoryId: string): Promise<ArtistProduct[]> => {
    if (!categoryId) return []
    const client = getSquareClient()

    const search = await client.catalog.searchItems({
      categoryIds: [categoryId],
      limit: 100
    })

    // biome-ignore lint/suspicious/noExplicitAny: SDK union is awkward
    const items: any[] = (search as any).items ?? []

    // Filter out archived items.
    const active = items.filter((it) => it.itemData?.isArchived !== true)

    if (active.length === 0) return []

    // Collect all unique image IDs referenced by these items.
    const allImageIds = new Set<string>()
    for (const it of active) {
      const ids: string[] = it.itemData?.imageIds ?? []
      for (const id of ids) allImageIds.add(id)
    }

    // Batch-fetch images so we get one network round-trip for all
    // referenced IMAGE objects.
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

    // Project to our public shape.
    const out: ArtistProduct[] = []
    for (const it of active) {
      const itemData = it.itemData ?? {}
      const firstImageId: string | undefined = itemData.imageIds?.[0]
      const variations: Array<Record<string, unknown>> = itemData.variations ?? []

      // Lowest price across variations (skipping VARIABLE_PRICING).
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

      out.push({
        id: it.id,
        name: itemData.name ?? '(unnamed)',
        imageUrl: firstImageId ? (imageUrlById.get(firstImageId) ?? null) : null,
        priceCents,
        categoryIds
      })
    }

    // Sort alphabetically by name for stable display order.
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  },
  ['square-items-by-category'],
  { revalidate: 60 }
)
