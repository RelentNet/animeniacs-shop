/**
 * Shared helpers for the Square cleanup scripts.
 *
 * Intentionally NOT importing from src/lib/* — these scripts are operational
 * tools that may run against production credentials and must NOT pull in any
 * server-only or app-coupled code.
 */

import { SquareClient, SquareEnvironment } from 'square'

export type SquareEnv = 'sandbox' | 'production'

/**
 * Object types we mirror. Order matters for restore: definitions and options
 * must exist before items reference them.
 *
 * Excluded on purpose:
 *   - INVENTORY_ALERT, MEASUREMENT_UNIT, PRICING_RULE, PRODUCT_SET, TIME_PERIOD
 *     (not in use, can be added later if needed)
 *   - ITEM_VARIATION (always nested under its parent ITEM in upsert payloads)
 */
export const SNAPSHOT_TYPES = [
  'CUSTOM_ATTRIBUTE_DEFINITION',
  'TAX',
  'CATEGORY',
  'ITEM_OPTION',
  'ITEM_OPTION_VAL',
  'IMAGE',
  'DISCOUNT',
  'ITEM'
] as const

export type SnapshotType = (typeof SNAPSHOT_TYPES)[number]

/** Order in which to upsert during a restore — parents before children. */
export const RESTORE_ORDER: SnapshotType[] = [
  'CUSTOM_ATTRIBUTE_DEFINITION',
  'TAX',
  'CATEGORY',
  'ITEM_OPTION',
  'ITEM_OPTION_VAL',
  'IMAGE',
  'DISCOUNT',
  'ITEM'
]

export interface CatalogObject {
  type: string
  id: string
  // Index signature so the snapshot stays loose — we don't model the full
  // Square schema here, just round-trip whatever fields we receive.
  // biome-ignore lint/suspicious/noExplicitAny: opaque pass-through
  [key: string]: any
}

export interface Snapshot {
  schemaVersion: 1
  takenAt: string
  source: {
    env: SquareEnv
    locationIds: string[]
    merchantId?: string
  }
  counts: Record<string, number>
  objects: CatalogObject[]
}

/** Build a SquareClient for the requested env, reading from process.env. */
export function buildClient(env: SquareEnv): SquareClient {
  if (env === 'production') {
    const token = process.env.SQUARE_PROD_ACCESS_TOKEN
    if (!token) {
      throw new Error(
        'SQUARE_PROD_ACCESS_TOKEN is not set. Add it to .env.local before running production operations.'
      )
    }
    return new SquareClient({
      token,
      environment: SquareEnvironment.Production
    })
  }

  // sandbox
  const token = process.env.SQUARE_ACCESS_TOKEN
  if (!token) {
    throw new Error('SQUARE_ACCESS_TOKEN is not set in .env.local.')
  }
  return new SquareClient({
    token,
    environment: SquareEnvironment.Sandbox
  })
}

/**
 * Lists every catalog object of the requested type, walking pagination.
 * Returns a fully-buffered array; safe for our catalog size (<2000 objects).
 */
export async function listAll(client: SquareClient, types: SnapshotType): Promise<CatalogObject[]> {
  const out: CatalogObject[] = []
  const page = await client.catalog.list({ types })
  for await (const obj of page) {
    out.push(obj as CatalogObject)
  }
  return out
}

/**
 * Walks every type sequentially and builds a snapshot.
 * Safe to call against production — read-only.
 */
export async function takeSnapshot(env: SquareEnv, locationIds: string[]): Promise<Snapshot> {
  const client = buildClient(env)
  const objects: CatalogObject[] = []
  const counts: Record<string, number> = {}

  for (const type of SNAPSHOT_TYPES) {
    process.stdout.write(`  fetching ${type}... `)
    const batch = await listAll(client, type)
    objects.push(...batch)
    counts[type] = batch.length
    console.log(`${batch.length}`)
  }

  return {
    schemaVersion: 1,
    takenAt: new Date().toISOString(),
    source: { env, locationIds },
    counts,
    objects
  }
}

export interface RewriteResult {
  /** New objects with #temp_<n> IDs, ready for batchUpsert. */
  rewritten: CatalogObject[]
  /** Map from original Square IDs to the temp IDs we assigned. */
  idMap: Map<string, string>
}

/**
 * Rewrites every Square-assigned ID into a temporary `#temp_<n>` ID and
 * updates every cross-reference (imageIds, categories, itemOptionValues,
 * etc.) to point at the new temp IDs.
 *
 * NB: The Square v44 Node SDK returns and accepts CAMELCASE field names
 * (itemData, imageIds, itemOptionValues, parentCategory, priceMoney). The
 * raw HTTP API uses snake_case. We work in camelCase here because the SDK
 * is what the upsert call goes through.
 *
 * Fields rewritten:
 *   - object.id                                       → temp
 *   - itemData.imageIds[]                             → temp
 *   - itemData.taxIds[]                               → temp
 *   - itemData.categoryId                             → temp (deprecated)
 *   - itemData.categories[].id                        → temp
 *   - itemData.reportingCategory.id                   → temp
 *   - itemData.variations[].id                        → temp
 *   - itemData.variations[].itemVariationData.itemId  → temp
 *   - itemData.variations[].itemVariationData.itemOptionValues[]
 *       .itemOptionId / .itemOptionValueId            → temp
 *   - itemOptionData.values[].id                      → temp
 *   - itemOptionValueData.itemOptionId                → temp
 *   - categoryData.parentCategory.id                  → temp
 *
 * Fields stripped (Square-managed; regenerated on upsert):
 *   - version, updatedAt, createdAt, isDeleted (plus snake_case variants)
 *   - itemData.channels / variations[].itemVariationData.channels
 *   - itemVariationData.itemVariationVendorInfos / Ids
 *   - itemVariationData.locationOverrides
 *   - customAttributeValues (slot keys are Square-assigned)
 */
export function rewriteIdsForUpsert(snapshot: Snapshot): RewriteResult {
  const idMap = new Map<string, string>()
  let counter = 0

  // Pass 1: assign temp IDs.
  for (const obj of snapshot.objects) {
    counter += 1
    idMap.set(obj.id, `#temp_${counter}`)
  }

  const remap = (id: string | undefined): string | undefined => {
    if (!id) return id
    return idMap.get(id) ?? id
  }

  // Pass 2: deep-rewrite each object.
  const rewritten: CatalogObject[] = snapshot.objects.map((source) => {
    // Deep clone so we don't mutate the snapshot.
    const obj: CatalogObject = JSON.parse(JSON.stringify(source))

    // Strip server-managed top-level metadata.
    delete obj.version
    delete obj.updatedAt
    delete obj.updated_at
    delete obj.createdAt
    delete obj.created_at
    delete obj.isDeleted
    delete obj.is_deleted

    // Strip every reference to a production-specific location ID. When these
    // arrays are absent, Square defaults to the seller's default location,
    // which is the correct sandbox behavior.
    delete obj.presentAtLocationIds
    delete obj.absentAtLocationIds
    delete obj.presentAtAllLocations
    // catalogV1Ids is Square's legacy POS ID array; not required for upsert
    // and references production-only location IDs.
    delete obj.catalogV1Ids

    // Strip channels and variation-internal noise.
    if (obj.itemData) {
      delete obj.itemData.channels
      if (obj.itemData.variations) {
        for (const v of obj.itemData.variations) {
          delete v.version
          delete v.updatedAt
          delete v.updated_at
          delete v.createdAt
          delete v.created_at
          delete v.isDeleted
          delete v.is_deleted
          delete v.presentAtLocationIds
          delete v.absentAtLocationIds
          delete v.presentAtAllLocations
          delete v.catalogV1Ids
          if (v.itemVariationData) {
            delete v.itemVariationData.channels
            delete v.itemVariationData.itemVariationVendorInfos
            delete v.itemVariationData.itemVariationVendorInfoIds
            delete v.itemVariationData.locationOverrides
          }
        }
      }
    }

    // Categories may carry location overrides (snake_case in some payloads).
    if (obj.categoryData) {
      delete obj.categoryData.location_overrides
      delete obj.categoryData.locationOverrides
    }

    // Rewrite the object's own ID.
    obj.id = remap(obj.id)!

    // Type-specific cross-references.
    if (obj.type === 'ITEM' && obj.itemData) {
      if (obj.itemData.imageIds) {
        obj.itemData.imageIds = obj.itemData.imageIds.map(remap).filter(Boolean)
      }
      if (obj.itemData.taxIds) {
        obj.itemData.taxIds = obj.itemData.taxIds.map(remap).filter(Boolean)
      }
      if (obj.itemData.categoryId) {
        obj.itemData.categoryId = remap(obj.itemData.categoryId)
      }
      if (obj.itemData.categories) {
        obj.itemData.categories = obj.itemData.categories.map(
          (c: { id: string; ordinal?: number }) => ({
            ...c,
            id: remap(c.id)
          })
        )
      }
      if (obj.itemData.reportingCategory) {
        obj.itemData.reportingCategory.id = remap(obj.itemData.reportingCategory.id)
      }
      if (obj.itemData.variations) {
        for (const v of obj.itemData.variations) {
          v.id = remap(v.id)
          if (v.itemVariationData) {
            v.itemVariationData.itemId = remap(v.itemVariationData.itemId)
            if (v.itemVariationData.itemOptionValues) {
              for (const iov of v.itemVariationData.itemOptionValues) {
                iov.itemOptionId = remap(iov.itemOptionId)
                iov.itemOptionValueId = remap(iov.itemOptionValueId)
              }
            }
          }
        }
      }
      delete obj.customAttributeValues
    }

    if (obj.type === 'ITEM_OPTION' && obj.itemOptionData?.values) {
      for (const val of obj.itemOptionData.values) {
        val.id = remap(val.id)
        if (val.itemOptionValueData) {
          val.itemOptionValueData.itemOptionId = remap(val.itemOptionValueData.itemOptionId)
        }
      }
    }

    if (obj.type === 'ITEM_OPTION_VAL' && obj.itemOptionValueData) {
      obj.itemOptionValueData.itemOptionId = remap(obj.itemOptionValueData.itemOptionId)
    }

    if (obj.type === 'CATEGORY' && obj.categoryData?.parentCategory?.id) {
      obj.categoryData.parentCategory.id = remap(obj.categoryData.parentCategory.id)
    }

    return obj
  })

  return { rewritten, idMap }
}

/** Split an array into fixed-size chunks for batch API calls. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

/** Sleep helper for rate-limit pacing. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
