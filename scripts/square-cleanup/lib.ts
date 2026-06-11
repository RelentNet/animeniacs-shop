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
/**
 * Keys to strip everywhere they appear in any catalog object subtree.
 *
 * Reasons:
 *   - version / updatedAt / createdAt / isDeleted: Square-managed; rejected
 *     on upsert. Also: `version` is a bigint that JSON.parse coerces into
 *     a Number, so it always fails SDK Zod validation regardless of intent.
 *   - presentAtLocationIds / absentAtLocationIds / presentAtAllLocations /
 *     catalogV1Ids: production-specific location refs. Sandbox doesn't
 *     know these IDs and rejects the whole upsert.
 *   - channels: production-specific sales-channel refs.
 *   - locationOverrides / location_overrides: production-specific.
 *   - itemVariationVendorInfos / Ids: production vendor refs.
 *
 * The set is conservative — every key here is either a Square-managed
 * value Square will regenerate, or a production-environment-specific ref
 * that has no meaning in the sandbox tenant.
 */
const STRIP_KEYS_RECURSIVE = new Set([
  'version',
  'updatedAt',
  'updated_at',
  'createdAt',
  'created_at',
  'isDeleted',
  'is_deleted',
  'presentAtLocationIds',
  'present_at_location_ids',
  'absentAtLocationIds',
  'absent_at_location_ids',
  'presentAtAllLocations',
  'present_at_all_locations',
  'catalogV1Ids',
  'catalog_v1_ids',
  'channels',
  'locationOverrides',
  'location_overrides',
  'itemVariationVendorInfos',
  'item_variation_vendor_infos',
  'itemVariationVendorInfoIds',
  'item_variation_vendor_info_ids'
])

/**
 * Walks the object tree and deletes every key in STRIP_KEYS_RECURSIVE
 * wherever it appears. Also coerces money amounts back to BigInt: the
 * snapshot serializes BigInts as Numbers (cents), but the SDK's input
 * schema validates `amount` fields inside any `*Money` object as bigint.
 * Mutates in place.
 */
function stripRecursive(node: unknown): void {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) stripRecursive(item)
    return
  }
  const obj = node as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    if (STRIP_KEYS_RECURSIVE.has(key)) {
      delete obj[key]
      continue
    }
    const value = obj[key]
    // Coerce *Money.amount back to BigInt so the SDK's Zod schema accepts
    // it. Snapshot stored these as Numbers because JSON can't represent
    // BigInts natively. Cents are well within safe integer range; the
    // BigInt(Number) round-trip is exact.
    if (
      key.toLowerCase().endsWith('money') &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      const money = value as Record<string, unknown>
      if (typeof money.amount === 'number') {
        money.amount = BigInt(money.amount)
      }
    }
    // `serviceDuration` (item variation, milliseconds) is validated by the SDK
    // as a bigint, but the snapshot serializes it as a Number — same gotcha as
    // *Money.amount and ordinal. Coerce it back so the items upsert validates.
    if (key === 'serviceDuration' && typeof value === 'number') {
      obj[key] = BigInt(value)
    }
    stripRecursive(value)
  }
}

/**
 * Walks any object subtree and remaps every string value that is a key in
 * `idMap` to its mapped value. Mutates in place.
 *
 * Used to apply the bulk ID remap (production ID → `#temp_<n>`) across
 * every field of every catalog object without enumerating individual paths
 * — Square's catalog payload has many optional reference fields, and the
 * exact set may grow with API versions.
 */
function remapStringsRecursive(node: unknown, idMap: Map<string, string>): void {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const v = node[i]
      if (typeof v === 'string') {
        const mapped = idMap.get(v)
        if (mapped !== undefined) node[i] = mapped
      } else {
        remapStringsRecursive(v, idMap)
      }
    }
    return
  }
  const obj = node as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    const v = obj[key]
    if (typeof v === 'string') {
      const mapped = idMap.get(v)
      if (mapped !== undefined) obj[key] = mapped
    } else {
      remapStringsRecursive(v, idMap)
    }
  }
}

export function rewriteIdsForUpsert(snapshot: Snapshot): RewriteResult {
  const idMap = new Map<string, string>()
  let counter = 0

  const allocate = (originalId: string): void => {
    if (idMap.has(originalId)) return
    counter += 1
    idMap.set(originalId, `#temp_${counter}`)
  }

  // Pass 1: assign temp IDs to every Square ID we'll send.
  // Top-level objects:
  for (const obj of snapshot.objects) {
    allocate(obj.id)
    // Nested ITEM_VARIATIONs (inside ITEM.itemData.variations) need their
    // own temp IDs too — they're new objects being created, not updates.
    // Without temp IDs Square interprets the existing production ID as
    // "update this existing variation", which fails in sandbox where the
    // variation doesn't exist.
    if (obj.type === 'ITEM' && obj.itemData?.variations) {
      for (const v of obj.itemData.variations as { id?: string }[]) {
        if (v.id) allocate(v.id)
      }
    }
    // Nested ITEM_OPTION values (inside ITEM_OPTION.itemOptionData.values)
    // similarly need temp IDs of their own.
    if (obj.type === 'ITEM_OPTION' && obj.itemOptionData?.values) {
      for (const val of obj.itemOptionData.values as { id?: string }[]) {
        if (val.id) allocate(val.id)
      }
    }
  }

  const remap = (id: string | undefined): string | undefined => {
    if (!id) return id
    return idMap.get(id) ?? id
  }

  // Pass 2: deep-rewrite each object.
  const rewritten: CatalogObject[] = snapshot.objects.map((source) => {
    // Deep clone so we don't mutate the snapshot.
    const obj: CatalogObject = JSON.parse(JSON.stringify(source))

    // Recursively strip server-managed metadata, location refs, channels,
    // and other production-tenant noise from every nesting level.
    stripRecursive(obj)

    // Generic remap: walk the entire subtree and remap any string that's
    // a known Square ID into its `#temp_<n>` placeholder. This catches
    // any reference field we haven't enumerated explicitly (e.g.
    // itemData.itemOptions[].itemOptionId, which production uses to
    // declare which options an item exposes for variants).
    //
    // Skipped paths: none. Strings that aren't in idMap pass through
    // untouched.
    remapStringsRecursive(obj, idMap)

    // Category-specific extras the recursive strip can't safely target by
    // key alone:
    //   - rootCategory: production category ID; safest to drop and let
    //     Square recompute it from parentCategory.
    //   - parentCategory.ordinal: Square-internal sort key that exceeds the
    //     JS safe integer range. The SDK validates it as a bigint, but
    //     JSON.parse turns it into a Number, so any non-stripped occurrence
    //     fails SDK validation. Square regenerates ordering on its own.
    if (obj.categoryData) {
      delete obj.categoryData.rootCategory
      if (obj.categoryData.parentCategory) {
        delete obj.categoryData.parentCategory.ordinal
        // If parentCategory only had {ordinal}, it was a top-level marker;
        // drop the empty container so the SDK doesn't reject `{}`.
        if (Object.keys(obj.categoryData.parentCategory).length === 0) {
          delete obj.categoryData.parentCategory
        }
      }
    }

    // TAX objects in production reference PRODUCT_SET tokens via
    // appliesToProductSetId (snake_case `applies_to_product_set_id` in the
    // raw API). We don't snapshot PRODUCT_SETs, so these references would
    // be dangling. Strip the field — the tax then applies to all products,
    // which is fine for a sandbox mirror.
    if (obj.taxData) {
      delete obj.taxData.appliesToProductSetId
      delete obj.taxData.applies_to_product_set_id
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
        // Strip `ordinal` — same bigint-vs-Number SDK-validation issue as
        // categoryData.parentCategory.ordinal. Square regenerates ordering.
        obj.itemData.categories = obj.itemData.categories.map(
          (c: { id: string; ordinal?: number }) => ({
            id: remap(c.id)
          })
        )
      }
      if (obj.itemData.reportingCategory) {
        obj.itemData.reportingCategory.id = remap(obj.itemData.reportingCategory.id)
        delete obj.itemData.reportingCategory.ordinal
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

/**
 * Walks any object subtree and removes every leftover `#temp_<n>` reference
 * — i.e. a temp ID that did not get resolved into a real Square ID.
 *
 * Rules:
 *   - Array elements that are unresolved temp strings get filtered out.
 *   - Non-array object fields named `id` are never touched. A `#temp_<n>`
 *     in an `id` field is the object's own placeholder identifier; Square
 *     will assign a real ID on upsert. This rule holds for any nesting
 *     level (ITEMs, nested ITEM_VARIATIONs, nested ITEM_OPTION values…
 *     they all need their own `id` to stay `#temp_<n>` until upsert).
 *   - Any other non-array object field whose value is `#temp_<n>` is a
 *     dangling reference; the field is deleted.
 *
 * Use this on any object whose temp-ref rewriting may have left dangling
 * references (typically: ITEMs referencing IMAGEs we couldn't upsert).
 */
export function scrubUnresolvedTempRefs(node: unknown): void {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let i = node.length - 1; i >= 0; i--) {
      const v = node[i]
      if (typeof v === 'string' && v.startsWith('#temp_')) {
        node.splice(i, 1)
      } else {
        scrubUnresolvedTempRefs(v)
      }
    }
    return
  }
  const obj = node as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    const v = obj[key]
    if (key === 'id') {
      // Never scrub the object's own id field at any nesting level.
      // Recurse only if it's a structured value (won't be, but safe).
      if (typeof v === 'object' && v !== null) scrubUnresolvedTempRefs(v)
      continue
    }
    if (typeof v === 'string' && v.startsWith('#temp_')) {
      delete obj[key]
    } else {
      scrubUnresolvedTempRefs(v)
    }
  }
}

/**
 * Walks any object subtree and replaces every `#temp_<n>` string with the
 * real Square-assigned ID from `tempToReal`. Mutates in place. Untouched
 * temp IDs (e.g., references to objects not yet upserted in a later pass)
 * pass through unchanged.
 */
export function rewriteTempRefsToReal(node: unknown, tempToReal: Map<string, string>): void {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const v = node[i]
      if (typeof v === 'string' && v.startsWith('#temp_')) {
        const real = tempToReal.get(v)
        if (real) node[i] = real
      } else {
        rewriteTempRefsToReal(v, tempToReal)
      }
    }
    return
  }
  const obj = node as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    const v = obj[key]
    if (typeof v === 'string' && v.startsWith('#temp_')) {
      const real = tempToReal.get(v)
      if (real) obj[key] = real
    } else {
      rewriteTempRefsToReal(v, tempToReal)
    }
  }
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
