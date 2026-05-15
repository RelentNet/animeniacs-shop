#!/usr/bin/env tsx
/**
 * One-shot field-shape probe for the audit script.
 *
 * Reads a snapshot file and prints the actual field shapes the audit needs
 * to read (item names, descriptions, category references, ITEM_OPTION wiring,
 * image URLs, custom-attribute slot keys, ecom visibility, archived flag,
 * variation pricing). Run once before writing the audit logic to document
 * the SDK gotchas the snapshot exposes.
 *
 * NOT a permanent tool — kept in-tree as a record of how the probe was done.
 * Usage:
 *   tsx scripts/square-cleanup/probe.ts <snapshot.json>
 */

import { readFile } from 'node:fs/promises'
import type { CatalogObject, Snapshot } from './lib'

const SNAPSHOT_FILE = process.argv.find((a) => a.endsWith('.json'))
if (!SNAPSHOT_FILE) {
  console.error('Usage: tsx scripts/square-cleanup/probe.ts <snapshot.json>')
  process.exit(2)
}

function summarizeKeys(obj: unknown, prefix = '', depth = 0, maxDepth = 3): string[] {
  if (depth > maxDepth) return [`${prefix}<truncated>`]
  if (obj === null) return [`${prefix} = null`]
  if (typeof obj !== 'object') return [`${prefix} = ${typeof obj}`]
  if (Array.isArray(obj)) {
    if (obj.length === 0) return [`${prefix} = [] (empty)`]
    return [
      `${prefix}[0] (len=${obj.length}):`,
      ...summarizeKeys(obj[0], prefix, depth + 1, maxDepth)
    ]
  }
  const out: string[] = []
  const entries = Object.entries(obj as Record<string, unknown>)
  for (const [k, v] of entries) {
    const childPrefix = prefix ? `${prefix}.${k}` : k
    if (v === null) {
      out.push(`${childPrefix} = null`)
    } else if (typeof v === 'object') {
      if (Array.isArray(v)) {
        out.push(`${childPrefix}[] (len=${v.length})${v.length === 0 ? ' (empty)' : ''}`)
        if (v.length > 0 && depth + 1 <= maxDepth) {
          out.push(...summarizeKeys(v[0], `${childPrefix}[0]`, depth + 2, maxDepth))
        }
      } else {
        out.push(...summarizeKeys(v, childPrefix, depth + 1, maxDepth))
      }
    } else {
      const val = typeof v === 'string' && v.length > 40 ? `${v.slice(0, 40)}…` : v
      out.push(`${childPrefix} = ${JSON.stringify(val)}`)
    }
  }
  return out
}

function firstOfType(snap: Snapshot, type: string): CatalogObject | undefined {
  return snap.objects.find((o) => o.type === type)
}

function header(text: string): void {
  console.log(`\n=== ${text} ===`)
}

async function main(): Promise<void> {
  const raw = await readFile(SNAPSHOT_FILE!, 'utf-8')
  const snap = JSON.parse(raw) as Snapshot
  console.log(`Snapshot: ${SNAPSHOT_FILE}`)
  console.log(`Counts:`, snap.counts)

  // ITEM shape
  header('ITEM (sample)')
  const item = firstOfType(snap, 'ITEM')
  if (item) console.log(summarizeKeys(item, '', 0, 4).join('\n'))

  // Pick an item that has more interesting fields (variations + image refs).
  header('ITEM with itemOptions + variations + images')
  const richItem = snap.objects.find(
    (o) =>
      o.type === 'ITEM' && o.itemData?.variations?.length > 1 && o.itemData?.imageIds?.length > 0
  )
  if (richItem) console.log(summarizeKeys(richItem, '', 0, 5).join('\n'))

  // What keys appear inside itemData across all items? (union of top-level keys)
  header('Union of itemData keys across all ITEMs')
  const itemDataKeys = new Set<string>()
  for (const o of snap.objects) {
    if (o.type === 'ITEM' && o.itemData) {
      for (const k of Object.keys(o.itemData)) itemDataKeys.add(k)
    }
  }
  console.log([...itemDataKeys].sort().join('\n'))

  header('Union of itemVariationData keys')
  const variationKeys = new Set<string>()
  for (const o of snap.objects) {
    if (o.type === 'ITEM' && o.itemData?.variations) {
      for (const v of o.itemData.variations) {
        if (v.itemVariationData) {
          for (const k of Object.keys(v.itemVariationData)) variationKeys.add(k)
        }
      }
    }
  }
  console.log([...variationKeys].sort().join('\n'))

  header('Sample variation with pricingType')
  const variantSample = snap.objects
    .filter((o) => o.type === 'ITEM' && o.itemData?.variations)
    .flatMap((o) => o.itemData.variations as { itemVariationData?: { pricingType?: string } }[])
    .find((v) => v.itemVariationData?.pricingType)
  console.log(JSON.stringify(variantSample, null, 2)?.slice(0, 1500))

  // Distinct pricingType values
  header('Distinct itemVariationData.pricingType values + counts')
  const pricingCounts: Record<string, number> = {}
  for (const o of snap.objects) {
    if (o.type !== 'ITEM' || !o.itemData?.variations) continue
    for (const v of o.itemData.variations) {
      const pt = v.itemVariationData?.pricingType ?? '<unset>'
      pricingCounts[pt] = (pricingCounts[pt] ?? 0) + 1
    }
  }
  console.log(pricingCounts)

  // Distinct ecomVisibility values across items
  header('Distinct itemData.ecomVisibility values + counts')
  const ecomCounts: Record<string, number> = {}
  for (const o of snap.objects) {
    if (o.type !== 'ITEM') continue
    const v = o.itemData?.ecomVisibility ?? '<unset>'
    ecomCounts[v] = (ecomCounts[v] ?? 0) + 1
  }
  console.log(ecomCounts)

  // isArchived counts
  header('itemData.isArchived counts')
  const archivedCounts: Record<string, number> = {}
  for (const o of snap.objects) {
    if (o.type !== 'ITEM') continue
    const v = String(o.itemData?.isArchived ?? '<unset>')
    archivedCounts[v] = (archivedCounts[v] ?? 0) + 1
  }
  console.log(archivedCounts)

  // Category references — both legacy categoryId and modern categories[]/reportingCategory.
  header('How items reference categories')
  let withLegacy = 0
  let withCategoriesArr = 0
  let withReporting = 0
  let withNoCategory = 0
  for (const o of snap.objects) {
    if (o.type !== 'ITEM') continue
    const d = o.itemData ?? {}
    const hasLegacy = !!d.categoryId
    const hasArr = Array.isArray(d.categories) && d.categories.length > 0
    const hasReporting = !!d.reportingCategory?.id
    if (hasLegacy) withLegacy++
    if (hasArr) withCategoriesArr++
    if (hasReporting) withReporting++
    if (!hasLegacy && !hasArr && !hasReporting) withNoCategory++
  }
  console.log({ withLegacy, withCategoriesArr, withReporting, withNoCategory })

  // Items with NO category at all (under any reference style)
  header('Sample 3 items with NO category at all')
  const noCat = snap.objects
    .filter((o) => {
      if (o.type !== 'ITEM') return false
      const d = o.itemData ?? {}
      const hasLegacy = !!d.categoryId
      const hasArr = Array.isArray(d.categories) && d.categories.length > 0
      const hasReporting = !!d.reportingCategory?.id
      return !hasLegacy && !hasArr && !hasReporting
    })
    .slice(0, 3)
  for (const o of noCat) {
    console.log(`  ${o.id} :: ${o.itemData?.name ?? '<noname>'}`)
  }

  // CATEGORY shape
  header('CATEGORY (sample) + key union')
  const cat = firstOfType(snap, 'CATEGORY')
  if (cat) console.log(summarizeKeys(cat, '', 0, 4).join('\n'))
  const catDataKeys = new Set<string>()
  for (const o of snap.objects) {
    if (o.type === 'CATEGORY' && o.categoryData) {
      for (const k of Object.keys(o.categoryData)) catDataKeys.add(k)
    }
  }
  console.log('\nUnion categoryData keys:', [...catDataKeys].sort().join(', '))

  // What name field is on CATEGORY?
  header('Sample CATEGORY names (first 10)')
  let count = 0
  for (const o of snap.objects) {
    if (o.type === 'CATEGORY') {
      console.log(
        `  ${o.id} :: name=${JSON.stringify(o.categoryData?.name)} parentCategory.id=${o.categoryData?.parentCategory?.id ?? '<root>'}`
      )
      if (++count >= 10) break
    }
  }

  // ITEM_OPTION shape
  header('ITEM_OPTION (sample)')
  const opt = firstOfType(snap, 'ITEM_OPTION')
  if (opt) console.log(summarizeKeys(opt, '', 0, 5).join('\n'))

  // ITEM_OPTION_VAL standalone (do any actually appear in production snapshot
  // as top-level objects, or only nested in ITEM_OPTION.values?)
  header('Top-level ITEM_OPTION_VAL count + sample')
  const standaloneVals = snap.objects.filter((o) => o.type === 'ITEM_OPTION_VAL')
  console.log(`count: ${standaloneVals.length}`)
  if (standaloneVals[0]) console.log(summarizeKeys(standaloneVals[0], '', 0, 4).join('\n'))

  // IMAGE shape — what URL fields are present?
  header('IMAGE (sample) + URL field')
  const img = firstOfType(snap, 'IMAGE')
  if (img) console.log(summarizeKeys(img, '', 0, 3).join('\n'))

  header('IMAGE imageData key union')
  const imgKeys = new Set<string>()
  for (const o of snap.objects) {
    if (o.type === 'IMAGE' && o.imageData) {
      for (const k of Object.keys(o.imageData)) imgKeys.add(k)
    }
  }
  console.log([...imgKeys].sort().join('\n'))

  // Are item.itemData.imageIds referencing IMAGE.id?
  header('Cross-check: how many distinct IMAGE IDs are referenced by items?')
  const referencedImageIds = new Set<string>()
  for (const o of snap.objects) {
    if (o.type === 'ITEM' && Array.isArray(o.itemData?.imageIds)) {
      for (const id of o.itemData.imageIds) referencedImageIds.add(id)
    }
  }
  const totalImages = snap.objects.filter((o) => o.type === 'IMAGE').length
  console.log({ referencedImageIds: referencedImageIds.size, totalImages })

  // CUSTOM_ATTRIBUTE_DEFINITION shape
  header('CUSTOM_ATTRIBUTE_DEFINITION shapes')
  for (const o of snap.objects) {
    if (o.type === 'CUSTOM_ATTRIBUTE_DEFINITION') {
      console.log(`\n--- ${o.id} ---`)
      console.log(summarizeKeys(o, '', 0, 4).join('\n'))
    }
  }

  // customAttributeValues — these are the slot-keyed map on items.
  header('Items with customAttributeValues — sample slot keys')
  let acvCount = 0
  for (const o of snap.objects) {
    if (o.type === 'ITEM' && o.customAttributeValues) {
      acvCount++
      if (acvCount <= 3) {
        console.log(`  ${o.id} :: keys=${Object.keys(o.customAttributeValues).join(',')}`)
        for (const [slot, val] of Object.entries(o.customAttributeValues)) {
          console.log(`    ${slot}:`, JSON.stringify(val).slice(0, 200))
        }
      }
    }
  }
  console.log(`Items with any customAttributeValues set: ${acvCount}`)

  // Description fields — newer Square uses descriptionHtml + descriptionPlaintext.
  header('Description fields present on items')
  const descFields: Record<string, number> = {}
  for (const o of snap.objects) {
    if (o.type !== 'ITEM' || !o.itemData) continue
    for (const k of ['description', 'descriptionHtml', 'descriptionPlaintext']) {
      if (o.itemData[k] !== undefined && o.itemData[k] !== '') {
        descFields[k] = (descFields[k] ?? 0) + 1
      }
    }
  }
  console.log(descFields)

  // ITEM_OPTION references on items (the `itemOptions` list)
  header('itemData.itemOptions shape')
  const withOpts = snap.objects.find(
    (o) => o.type === 'ITEM' && o.itemData?.itemOptions?.length > 0
  )
  if (withOpts) {
    console.log(JSON.stringify(withOpts.itemData.itemOptions, null, 2))
  }

  // Variation price shapes (priceMoney present? VARIABLE_PRICING?)
  header('Variation pricing patterns (first 5 ITEMs that look unusual)')
  let shown = 0
  for (const o of snap.objects) {
    if (o.type !== 'ITEM' || !o.itemData?.variations) continue
    for (const v of o.itemData.variations) {
      const d = v.itemVariationData
      if (!d) continue
      const noPrice = d.pricingType === 'VARIABLE_PRICING' || d.priceMoney?.amount === undefined
      if (noPrice && shown < 5) {
        console.log(
          `  ${o.id} :: name=${o.itemData?.name?.slice(0, 30)} variation=${d.name} pricingType=${d.pricingType} priceMoney=${JSON.stringify(d.priceMoney)}`
        )
        shown++
      }
    }
  }

  // Distinct top-level types
  header('Top-level type counts')
  const typeCounts: Record<string, number> = {}
  for (const o of snap.objects) typeCounts[o.type] = (typeCounts[o.type] ?? 0) + 1
  console.log(typeCounts)
}

main().catch((err) => {
  console.error('probe failed:', err)
  process.exit(1)
})
