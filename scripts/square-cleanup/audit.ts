#!/usr/bin/env tsx
/**
 * Catalog audit report (read-only).
 *
 * Reads a snapshot file (output of `pnpm sq:snapshot production`) and emits a
 * markdown report flagging 17 categories of catalog-hygiene issues. The report
 * is the artifact the user reviews to decide cleanup rules in Phase C.
 *
 * No writes to Square. Optional network access only for image HEAD-checks
 * (issue #13), which can be disabled with `--no-check-urls`.
 *
 * Usage:
 *   pnpm sq:audit <snapshot.json>                  # full report incl. HEAD checks
 *   pnpm sq:audit <snapshot.json> --no-check-urls  # skip image URL checks
 *   pnpm sq:audit <snapshot.json> -o <path>        # custom output path
 *
 * Default output:
 *   docs/superpowers/specs/reference/square-production-audit.md
 *
 * --- API SHAPE NOTES (from probe against 2026-05-15 production snapshot) ---
 *
 * The Square v44 SDK does NOT consistently camelCase fields. Some are
 * snake_case in returned payloads. The audit reads BOTH casings where it
 * matters. Specifically:
 *
 *   - `itemData.ecom_visibility`  (snake)   — values: VISIBLE / UNAVAILABLE / UNINDEXED
 *   - `itemData.ecom_available`   (snake)
 *   - `itemData.isArchived`       (camel)
 *   - `itemData.imageIds`         (camel)
 *   - `itemData.itemOptions`      (camel)   — array of {itemOptionId}
 *   - `itemData.categories[]`     (camel)   — modern category refs
 *   - `itemData.categoryId`       (camel)   — legacy single-category ref (not used in this snapshot)
 *   - `itemData.reportingCategory.id` (camel) — barely used (1 of 231 items)
 *   - `itemVariationData.pricingType`  (camel) — FIXED_PRICING / VARIABLE_PRICING
 *   - `itemVariationData.priceMoney`   (camel) — {amount: bigint, currency: string}
 *   - `itemVariationData.imageIds`     (camel) — variation-level images
 *   - `imageData.url`                  (camel) — IMAGE URL
 *   - `categoryData.parentCategory.id` (camel) — hierarchy
 *   - `categoryData.location_overrides` (snake) — ignored by audit
 *
 * Other shape gotchas:
 *
 *   1. `customAttributeValues` is UNSET on all 231 items. None use the
 *      `Media` or `Size` custom-attribute definitions, even though the
 *      definitions exist. So "unused custom attributes" lights up the
 *      staff-created ones; the 3 Square-system ones (is_alcoholic,
 *      ecom_target_classic_site_id, ecom_gifting_enabled) get a separate
 *      classification because removing them is risky.
 *   2. `itemData.description`, `descriptionHtml`, `descriptionPlaintext` all
 *      exist on items that have any description. Each is set/empty in
 *      lockstep. The audit reads `descriptionPlaintext` for text matching
 *      since `description` itself contains HTML and `descriptionHtml`
 *      contains double-encoded HTML (Square-side encoding artifact).
 *   3. Money amounts ARE stored as Number in the snapshot (not BigInt) —
 *      the snapshot serialized BigInts via `Number()` cast on write. JSON
 *      parse hands back Numbers. Safe — all our prices fit.
 *   4. `categories[].ordinal` is a Square-internal sort key that overflows
 *      JS safe integer range. The audit only reads `id` from category
 *      refs, never `ordinal`.
 *   5. IMAGE objects are referenced via:
 *        - itemData.imageIds[]               (item-level)
 *        - variations[].itemVariationData.imageIds[]  (variation-level)
 *      The orphan check unions both sets.
 *   6. CATEGORY `name` casing matters for issue #9 (weird casing). The
 *      audit flags any category name where the first letter is lowercase.
 *      Real-world example in this snapshot: `portrait`.
 *   7. There's no `Brand` category or `artist` custom attribute in this
 *      snapshot. Issue #11 (missing artist info) is detected by
 *      heuristics on item name/description — we flag items where the
 *      filename or description mentions specific signal words used by
 *      production staff (e.g. "AM<digits>" SKU prefix matches Animeniacs
 *      assets). The decision belongs to the user in Phase C; we only
 *      surface candidates.
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { CatalogObject, Snapshot } from './lib'

// -- CLI ---------------------------------------------------------------------

const ARGV = process.argv.slice(2)
const SNAPSHOT_FILE = ARGV.find((a) => a.endsWith('.json'))
const NO_CHECK_URLS = ARGV.includes('--no-check-urls')
const outIdx = ARGV.findIndex((a) => a === '-o' || a === '--out')
const OUT_FILE =
  outIdx >= 0 && ARGV[outIdx + 1]
    ? ARGV[outIdx + 1]
    : 'docs/superpowers/specs/reference/square-production-audit.md'

if (!SNAPSHOT_FILE) {
  console.error(
    'Usage: pnpm sq:audit <snapshot.json> [--no-check-urls] [-o <out.md>]\n\n' +
      '  Reads a snapshot and emits a markdown audit report flagging 17\n' +
      '  categories of catalog-hygiene issues. Read-only.'
  )
  process.exit(2)
}

// -- Types -------------------------------------------------------------------

interface Category {
  id: string
  name: string
  parentId?: string
  isTopLevel: boolean
}

interface Variation {
  id: string
  name: string
  itemId: string
  pricingType?: string
  priceAmount?: number
  imageIds: string[]
  itemOptionValueRefs: { itemOptionId: string; itemOptionValueId: string }[]
}

interface Item {
  id: string
  name: string
  description: string // plaintext, for matching
  isArchived: boolean
  ecomVisibility?: string
  imageIds: string[]
  categoryIds: string[] // union of legacy + categories[] + reportingCategory.id
  itemOptionIds: string[]
  variations: Variation[]
  raw: CatalogObject
}

interface CustomAttrDef {
  id: string
  key: string
  name: string
  type: string
  allowedObjectTypes: string[]
  sourceApplicationName?: string
}

interface ImageObj {
  id: string
  name?: string
  url?: string
}

// -- Snapshot loading + indexing --------------------------------------------

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function readField<T>(obj: Record<string, unknown> | undefined, ...keys: string[]): T | undefined {
  if (!obj) return undefined
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k] as T
  }
  return undefined
}

function parseItem(o: CatalogObject, categoryById: Map<string, Category>): Item {
  const d = o.itemData ?? {}

  // Category references — three possible sources, union them.
  const categoryIds = new Set<string>()
  if (typeof d.categoryId === 'string') categoryIds.add(d.categoryId)
  if (Array.isArray(d.categories)) {
    for (const c of d.categories) {
      if (typeof c?.id === 'string') categoryIds.add(c.id)
    }
  }
  if (typeof d.reportingCategory?.id === 'string') categoryIds.add(d.reportingCategory.id)

  // Filter out category IDs that don't resolve (defensive).
  const resolvedCats: string[] = []
  for (const id of categoryIds) {
    if (categoryById.has(id)) resolvedCats.push(id)
    else resolvedCats.push(id) // keep unresolved; surfaces as data integrity issue
  }

  const itemOptionIds: string[] = Array.isArray(d.itemOptions)
    ? d.itemOptions
        .map((io: { itemOptionId?: string }) => io?.itemOptionId)
        .filter((v: unknown): v is string => typeof v === 'string')
    : []

  const variations: Variation[] = Array.isArray(d.variations)
    ? d.variations.map((v: CatalogObject) => {
        const vd = v.itemVariationData ?? {}
        const priceAmount =
          typeof vd.priceMoney?.amount === 'number'
            ? vd.priceMoney.amount
            : typeof vd.priceMoney?.amount === 'bigint'
              ? Number(vd.priceMoney.amount)
              : undefined
        return {
          id: asString(v.id),
          name: asString(vd.name),
          itemId: asString(vd.itemId),
          pricingType: typeof vd.pricingType === 'string' ? vd.pricingType : undefined,
          priceAmount,
          imageIds: Array.isArray(vd.imageIds)
            ? vd.imageIds.filter((i: unknown) => typeof i === 'string')
            : [],
          itemOptionValueRefs: Array.isArray(vd.itemOptionValues)
            ? vd.itemOptionValues
                .map((r: { itemOptionId?: string; itemOptionValueId?: string }) => ({
                  itemOptionId: r?.itemOptionId ?? '',
                  itemOptionValueId: r?.itemOptionValueId ?? ''
                }))
                .filter((r: { itemOptionId: string }) => r.itemOptionId)
            : []
        }
      })
    : []

  // Description: use plaintext if present; fall back to stripping the HTML
  // from `description`.
  const descPlain =
    asString(d.descriptionPlaintext) ||
    asString(d.description)
      .replace(/<[^>]+>/g, ' ')
      .trim()

  return {
    id: o.id,
    name: asString(d.name),
    description: descPlain,
    isArchived: d.isArchived === true,
    ecomVisibility: readField<string>(d, 'ecomVisibility', 'ecom_visibility'),
    imageIds: Array.isArray(d.imageIds)
      ? d.imageIds.filter((i: unknown) => typeof i === 'string')
      : [],
    categoryIds: resolvedCats,
    itemOptionIds,
    variations,
    raw: o
  }
}

function loadIndex(snapshot: Snapshot) {
  const categories: Category[] = []
  const items: Item[] = []
  const images: ImageObj[] = []
  const customDefs: CustomAttrDef[] = []
  const itemOptions: { id: string; name: string }[] = []

  for (const o of snapshot.objects) {
    if (o.type === 'CATEGORY') {
      const cd = o.categoryData ?? {}
      categories.push({
        id: o.id,
        name: asString(cd.name),
        parentId: typeof cd.parentCategory?.id === 'string' ? cd.parentCategory.id : undefined,
        isTopLevel: cd.isTopLevel === true
      })
    } else if (o.type === 'IMAGE') {
      const im = o.imageData ?? {}
      images.push({ id: o.id, name: asString(im.name), url: asString(im.url) })
    } else if (o.type === 'CUSTOM_ATTRIBUTE_DEFINITION') {
      const c = o.customAttributeDefinitionData ?? {}
      customDefs.push({
        id: o.id,
        key: asString(c.key),
        name: asString(c.name),
        type: asString(c.type),
        allowedObjectTypes: Array.isArray(c.allowedObjectTypes) ? c.allowedObjectTypes : [],
        sourceApplicationName: asString(c.sourceApplication?.name)
      })
    } else if (o.type === 'ITEM_OPTION') {
      itemOptions.push({ id: o.id, name: asString(o.itemOptionData?.name) })
    }
  }

  const categoryById = new Map(categories.map((c) => [c.id, c]))

  for (const o of snapshot.objects) {
    if (o.type === 'ITEM') items.push(parseItem(o, categoryById))
  }

  return { categories, categoryById, items, images, customDefs, itemOptions }
}

// -- Helpers -----------------------------------------------------------------

function escapeMd(s: string): string {
  // Escape pipes/newlines so tables stay intact. Keep it simple.
  return (s || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim()
}

function truncate(s: string, n = 60): string {
  const t = (s || '').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

function categoryPath(cat: Category | undefined, byId: Map<string, Category>): string {
  if (!cat) return '<unresolved>'
  const parts: string[] = []
  let cur: Category | undefined = cat
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    parts.unshift(cur.name)
    seen.add(cur.id)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return parts.join(' / ')
}

function fmtCents(amount: number | undefined): string {
  if (amount === undefined) return '—'
  return `$${(amount / 100).toFixed(2)}`
}

// -- Issue detectors ---------------------------------------------------------

interface IssueRow {
  itemId?: string
  name?: string
  details: Record<string, string>
}

interface IssueSection {
  num: number
  title: string
  description: string
  totalDenominator: number
  totalDenominatorLabel: string
  columns: string[]
  rows: IssueRow[]
  /** Optional extra blocks (e.g., a category lookup table for context). */
  extra?: string
}

function buildReport(
  snap: Snapshot,
  brokenImageUrls: Map<string, string>,
  imageCheckSkipped: boolean
): IssueSection[] {
  const { categories, categoryById, items, images, customDefs, itemOptions } = loadIndex(snap)
  const sections: IssueSection[] = []

  // Common lookups.
  const catByName = new Map<string, Category>()
  for (const c of categories) catByName.set(c.name, c)
  const uncategorizedCat = catByName.get('Uncategorized')
  const notOnlineCat = catByName.get('Not Online')
  const slapsCat = catByName.get('Slaps')

  // ---- 1. Items with no category --------------------------------------------
  {
    const rows: IssueRow[] = items
      .filter((i) => i.categoryIds.length === 0)
      .map((i) => ({
        itemId: i.id,
        name: i.name,
        details: {
          itemId: i.id,
          name: truncate(i.name, 50),
          variations: String(i.variations.length),
          archived: String(i.isArchived),
          ecomVisibility: i.ecomVisibility ?? '<unset>'
        }
      }))
    sections.push({
      num: 1,
      title: 'Items with no category',
      description:
        "Items that have no `categoryId`, no `categories[]` entries, and no `reportingCategory`. These won't appear in any category-based filter or navigation in Square Online.",
      totalDenominator: items.length,
      totalDenominatorLabel: 'items',
      columns: ['Item ID', 'Name', 'Variations', 'Archived', 'Ecom Visibility'],
      rows
    })
  }

  // ---- 2. Items in Uncategorized / Not Online / Slaps -----------------------
  {
    const targetCats = [uncategorizedCat, notOnlineCat, slapsCat].filter((c): c is Category => !!c)
    const targetIds = new Set(targetCats.map((c) => c.id))
    const rows: IssueRow[] = items
      .filter((i) => i.categoryIds.some((cid) => targetIds.has(cid)))
      .map((i) => {
        const hitCats = i.categoryIds
          .map((cid) => categoryById.get(cid))
          .filter((c): c is Category => !!c && targetIds.has(c.id))
          .map((c) => c.name)
        return {
          itemId: i.id,
          name: i.name,
          details: {
            itemId: i.id,
            name: truncate(i.name, 50),
            inCategories: hitCats.join(', '),
            allCategories: i.categoryIds
              .map((cid) => categoryById.get(cid)?.name ?? '<unresolved>')
              .join(', ')
          }
        }
      })
    sections.push({
      num: 2,
      title: 'Items in `Uncategorized`, `Not Online`, or `Slaps`',
      description:
        'These three categories are buckets for items that have been intentionally excluded from the storefront or never properly categorized. Decision in Phase C: move to a real category, leave parked, or delete.',
      totalDenominator: items.length,
      totalDenominatorLabel: 'items',
      columns: ['Item ID', 'Name', 'In Categories', 'All Categories'],
      rows,
      extra: targetCats.length
        ? `_Categories targeted by this check:_ ${targetCats.map((c) => `\`${c.name}\` (id: \`${c.id}\`)`).join(', ')}`
        : '_None of the target categories (`Uncategorized`/`Not Online`/`Slaps`) were found in the snapshot._'
    })
  }

  // ---- 3. Items with suspicious names ---------------------------------------
  {
    // Word-boundary patterns to avoid false positives like "Todoroki".
    const suspiciousPatterns: { pattern: RegExp; reason: string }[] = [
      { pattern: /\btest\b/i, reason: 'contains word "test"' },
      { pattern: /\btodo\b/i, reason: 'contains word "todo"' },
      { pattern: /\buntitled\b/i, reason: 'contains "untitled"' },
      { pattern: /\bnew item\b/i, reason: 'literal "new item"' },
      { pattern: /\bsample\b/i, reason: 'contains "sample"' },
      { pattern: /\bplaceholder\b/i, reason: 'contains "placeholder"' },
      { pattern: /^asdf+$/i, reason: 'keysmash name' },
      { pattern: /^\d+$/, reason: 'purely numeric name' },
      { pattern: /^.{1,2}$/, reason: 'name 1-2 characters long' },
      { pattern: /[<>]/, reason: 'contains HTML angle brackets' }
    ]
    const rows: IssueRow[] = []
    for (const i of items) {
      const n = i.name.trim()
      if (!n) {
        rows.push({
          itemId: i.id,
          name: i.name,
          details: { itemId: i.id, name: '<empty>', reasons: 'empty name' }
        })
        continue
      }
      const hits = suspiciousPatterns.filter((p) => p.pattern.test(n))
      if (hits.length > 0) {
        rows.push({
          itemId: i.id,
          name: i.name,
          details: {
            itemId: i.id,
            name: truncate(n, 50),
            reasons: hits.map((h) => h.reason).join('; ')
          }
        })
      }
    }
    sections.push({
      num: 3,
      title: 'Items with empty / "test" / suspicious names',
      description:
        'Items whose names look like placeholders, tests, or other operator-error states. Word-boundary matching is used to avoid false positives (e.g., "Todoroki" is not flagged as containing "todo").',
      totalDenominator: items.length,
      totalDenominatorLabel: 'items',
      columns: ['Item ID', 'Name', 'Reason(s)'],
      rows
    })
  }

  // ---- 4. Items with no images ----------------------------------------------
  {
    const rows: IssueRow[] = items
      .filter((i) => {
        if (i.imageIds.length > 0) return false
        for (const v of i.variations) if (v.imageIds.length > 0) return false
        return true
      })
      .map((i) => ({
        itemId: i.id,
        name: i.name,
        details: {
          itemId: i.id,
          name: truncate(i.name, 50),
          archived: String(i.isArchived),
          ecomVisibility: i.ecomVisibility ?? '<unset>',
          categories:
            i.categoryIds.map((cid) => categoryById.get(cid)?.name ?? '<unresolved>').join(', ') ||
            '<none>'
        }
      }))
    sections.push({
      num: 4,
      title: 'Items with no images',
      description:
        "Items where neither `itemData.imageIds` nor any variation's `itemVariationData.imageIds` contains anything. These display as blank cards in the storefront.",
      totalDenominator: items.length,
      totalDenominatorLabel: 'items',
      columns: ['Item ID', 'Name', 'Archived', 'Ecom Visibility', 'Categories'],
      rows
    })
  }

  // ---- 5. Items with ecom_visibility = UNAVAILABLE / UNINDEXED -------------
  {
    const rows: IssueRow[] = items
      .filter((i) => i.ecomVisibility === 'UNAVAILABLE' || i.ecomVisibility === 'UNINDEXED')
      .map((i) => ({
        itemId: i.id,
        name: i.name,
        details: {
          itemId: i.id,
          name: truncate(i.name, 50),
          ecomVisibility: i.ecomVisibility ?? '<unset>',
          archived: String(i.isArchived),
          variations: String(i.variations.length),
          categories:
            i.categoryIds.map((cid) => categoryById.get(cid)?.name ?? '<unresolved>').join(', ') ||
            '<none>'
        }
      }))
    sections.push({
      num: 5,
      title: 'Items with `ecom_visibility` UNAVAILABLE or UNINDEXED',
      description:
        "`UNAVAILABLE` items are explicitly hidden from the storefront; `UNINDEXED` items don't appear in search. Both states are likely operator intent but worth verifying — every flagged item is one the customer cannot find.",
      totalDenominator: items.length,
      totalDenominatorLabel: 'items',
      columns: ['Item ID', 'Name', 'Ecom Visibility', 'Archived', 'Variations', 'Categories'],
      rows
    })
  }

  // ---- 6. Items with isArchived = true --------------------------------------
  {
    const rows: IssueRow[] = items
      .filter((i) => i.isArchived)
      .map((i) => ({
        itemId: i.id,
        name: i.name,
        details: {
          itemId: i.id,
          name: truncate(i.name, 50),
          ecomVisibility: i.ecomVisibility ?? '<unset>',
          variations: String(i.variations.length),
          categories:
            i.categoryIds.map((cid) => categoryById.get(cid)?.name ?? '<unresolved>').join(', ') ||
            '<none>'
        }
      }))
    sections.push({
      num: 6,
      title: 'Items with `isArchived: true`',
      description:
        "Items marked archived in Square. They're hidden from new sales but kept for historical reporting. Worth confirming each is intentional — accidental archives hide products from customers silently.",
      totalDenominator: items.length,
      totalDenominatorLabel: 'items',
      columns: ['Item ID', 'Name', 'Ecom Visibility', 'Variations', 'Categories'],
      rows
    })
  }

  // ---- 7. Placeholder pricing (VARIABLE_PRICING + no price + name "Regular")
  {
    const rows: IssueRow[] = []
    for (const i of items) {
      for (const v of i.variations) {
        const isVariable = v.pricingType === 'VARIABLE_PRICING'
        const hasNoPrice = v.priceAmount === undefined || v.priceAmount === 0
        if (isVariable && hasNoPrice) {
          rows.push({
            itemId: i.id,
            name: i.name,
            details: {
              itemId: i.id,
              itemName: truncate(i.name, 40),
              variationId: v.id,
              variationName: v.name || '<unnamed>',
              pricingType: v.pricingType ?? '<unset>',
              priceAmount: fmtCents(v.priceAmount),
              isRegularName: String(v.name === 'Regular')
            }
          })
        }
      }
    }
    // Strict spec: VARIABLE_PRICING + no price + name "Regular". Loose
    // (audit-only): any VARIABLE_PRICING + no price. Both flagged; strict
    // matches are subset.
    sections.push({
      num: 7,
      title: 'Placeholder pricing (VARIABLE_PRICING + no price set)',
      description:
        'Variations with `pricingType=VARIABLE_PRICING` and no `priceMoney.amount`. The spec\'s strict pattern (variation name "Regular") is highlighted in the `isRegularName` column. These would charge $0 if added to a cart unaltered.',
      totalDenominator: items.reduce((sum, i) => sum + i.variations.length, 0),
      totalDenominatorLabel: 'variations',
      columns: [
        'Item ID',
        'Item Name',
        'Variation ID',
        'Variation Name',
        'Pricing Type',
        'Price',
        'Is "Regular"'
      ],
      rows
    })
  }

  // ---- 8. Categories with zero items ----------------------------------------
  {
    const itemCountByCat = new Map<string, number>()
    for (const i of items) {
      for (const cid of i.categoryIds) {
        itemCountByCat.set(cid, (itemCountByCat.get(cid) ?? 0) + 1)
      }
    }
    const rows: IssueRow[] = categories
      .filter((c) => (itemCountByCat.get(c.id) ?? 0) === 0)
      .map((c) => ({
        details: {
          categoryId: c.id,
          name: c.name,
          parent: c.parentId ? (categoryById.get(c.parentId)?.name ?? '<unresolved>') : '<root>',
          isTopLevel: String(c.isTopLevel)
        }
      }))
    sections.push({
      num: 8,
      title: 'Categories with zero items',
      description:
        'Categories not referenced by any item via `categoryId`, `categories[]`, or `reportingCategory`. Likely candidates for deletion, BUT some may be intentional parent containers (e.g., "Anime" with sub-categories).',
      totalDenominator: categories.length,
      totalDenominatorLabel: 'categories',
      columns: ['Category ID', 'Name', 'Parent', 'Is Top-Level'],
      rows
    })
  }

  // ---- 9. Categories with weird casing --------------------------------------
  {
    const rows: IssueRow[] = []
    for (const c of categories) {
      const n = c.name
      if (!n) continue
      const firstChar = n.charAt(0)
      const isLowerStart =
        firstChar === firstChar.toLowerCase() && firstChar !== firstChar.toUpperCase()
      const allLower = n === n.toLowerCase() && /[a-z]/.test(n)
      const allUpper = n === n.toUpperCase() && /[A-Z]/.test(n) && n.length > 3
      const hasTrim = n !== n.trim()
      if (isLowerStart || allLower || allUpper || hasTrim) {
        const reasons = [
          isLowerStart && 'starts with lowercase',
          allLower && 'all lowercase',
          allUpper && 'all uppercase',
          hasTrim && 'leading/trailing whitespace'
        ]
          .filter(Boolean)
          .join('; ')
        rows.push({
          details: {
            categoryId: c.id,
            name: JSON.stringify(n),
            parent: c.parentId ? (categoryById.get(c.parentId)?.name ?? '<unresolved>') : '<root>',
            reasons
          }
        })
      }
    }
    sections.push({
      num: 9,
      title: 'Categories with weird casing',
      description:
        'Category names that look misclassified (e.g., lowercase like `portrait` — possibly intended as a tag, not a category) or that have whitespace artifacts.',
      totalDenominator: categories.length,
      totalDenominatorLabel: 'categories',
      columns: ['Category ID', 'Name', 'Parent', 'Reason'],
      rows
    })
  }

  // ---- 10. Duplicate / near-duplicate item names ---------------------------
  {
    // Normalize: lowercase, strip punctuation, collapse whitespace.
    const norm = (s: string): string =>
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    const byNorm = new Map<string, Item[]>()
    for (const i of items) {
      const k = norm(i.name)
      if (!k) continue
      const arr = byNorm.get(k) ?? []
      arr.push(i)
      byNorm.set(k, arr)
    }
    const rows: IssueRow[] = []
    for (const [k, grp] of byNorm) {
      if (grp.length < 2) continue
      for (const i of grp) {
        rows.push({
          itemId: i.id,
          name: i.name,
          details: {
            itemId: i.id,
            name: truncate(i.name, 40),
            normalized: k,
            groupSize: String(grp.length),
            archived: String(i.isArchived),
            ecomVisibility: i.ecomVisibility ?? '<unset>',
            categories: i.categoryIds
              .map((cid) => categoryById.get(cid)?.name ?? '<unresolved>')
              .join(', ')
          }
        })
      }
    }
    sections.push({
      num: 10,
      title: 'Duplicate or near-duplicate item names',
      description:
        'Items whose names normalize identically (case-insensitive, punctuation-stripped, whitespace-collapsed). Each row in a group is shown so you can see which one to keep.',
      totalDenominator: items.length,
      totalDenominatorLabel: 'items',
      columns: [
        'Item ID',
        'Name',
        'Normalized',
        'Group Size',
        'Archived',
        'Ecom Visibility',
        'Categories'
      ],
      rows
    })
  }

  // ---- 11. Items missing artist info ---------------------------------------
  {
    // No `artist` custom attribute exists yet. The "Artist" category and
    // "Merc Da Artist" sub-category exist but are half-built. Heuristics:
    //   - Item is NOT in any sub-category of "Artist"
    //   - AND no description text matches known artist signals
    // We surface candidates only — decisions in Phase C / D.
    const artistRootCat = catByName.get('Artist')
    const artistSubcatIds = new Set<string>()
    if (artistRootCat) {
      artistSubcatIds.add(artistRootCat.id)
      for (const c of categories) {
        if (c.parentId === artistRootCat.id) artistSubcatIds.add(c.id)
      }
    }

    const rows: IssueRow[] = items
      .filter((i) => {
        if (i.categoryIds.some((cid) => artistSubcatIds.has(cid))) return false
        return true
      })
      .map((i) => ({
        itemId: i.id,
        name: i.name,
        details: {
          itemId: i.id,
          name: truncate(i.name, 40),
          categories:
            i.categoryIds.map((cid) => categoryById.get(cid)?.name ?? '<unresolved>').join(', ') ||
            '<none>',
          descPreview: truncate(i.description, 50)
        }
      }))
    sections.push({
      num: 11,
      title: 'Items missing artist info',
      description:
        "No `artist` custom attribute exists in production yet. The only artist taxonomy today is the half-built `Artist` category with one sub-category (`Merc Da Artist`). Items below are NOT under the `Artist` category tree and therefore have no recorded artist anywhere. This is the universe of items Phase D's `artist` attribute would need to fill in — decisions belong to the user.",
      totalDenominator: items.length,
      totalDenominatorLabel: 'items',
      columns: ['Item ID', 'Name', 'Current Categories', 'Description Preview'],
      rows
    })
  }

  // ---- 12. Items with placeholder description text -------------------------
  {
    const placeholderPatterns: { pattern: RegExp; reason: string }[] = [
      { pattern: /lorem ipsum/i, reason: 'contains "Lorem ipsum"' },
      { pattern: /\bplaceholder\b/i, reason: 'contains "placeholder"' },
      { pattern: /\btbd\b/i, reason: 'contains "TBD"' },
      { pattern: /\btodo\b/i, reason: 'contains "TODO"' },
      { pattern: /\bxxx\b/i, reason: 'contains "xxx"' },
      { pattern: /\bfixme\b/i, reason: 'contains "FIXME"' },
      { pattern: /^description$/i, reason: 'literally just "description"' },
      { pattern: /^test$/i, reason: 'literally just "test"' }
    ]
    const rows: IssueRow[] = []
    for (const i of items) {
      const d = (i.description || '').trim()
      if (!d) continue
      const hits = placeholderPatterns.filter((p) => p.pattern.test(d))
      if (hits.length > 0) {
        rows.push({
          itemId: i.id,
          name: i.name,
          details: {
            itemId: i.id,
            name: truncate(i.name, 40),
            reasons: hits.map((h) => h.reason).join('; '),
            descPreview: truncate(d, 80)
          }
        })
      }
    }
    sections.push({
      num: 12,
      title: 'Items with placeholder description text',
      description:
        'Descriptions containing telltale placeholder strings ("Lorem ipsum", "TBD", "TODO", "placeholder", "FIXME", etc.). These almost certainly slipped through copy-editing.',
      totalDenominator: items.length,
      totalDenominatorLabel: 'items',
      columns: ['Item ID', 'Name', 'Reason(s)', 'Description Preview'],
      rows
    })
  }

  // ---- 13. Image objects with broken URLs ----------------------------------
  {
    const rows: IssueRow[] = []
    if (imageCheckSkipped) {
      // We still produce the section (with note) so the report shape is stable.
    } else {
      for (const im of images) {
        const err = brokenImageUrls.get(im.id)
        if (err !== undefined) {
          rows.push({
            details: {
              imageId: im.id,
              name: truncate(im.name ?? '', 40),
              url: im.url ?? '<unset>',
              error: err
            }
          })
        }
      }
    }
    sections.push({
      num: 13,
      title: 'IMAGE objects with broken URLs',
      description: imageCheckSkipped
        ? 'HEAD-check skipped via `--no-check-urls`. Re-run without that flag to populate this section.'
        : `HEAD-requested every IMAGE.imageData.url. Any URL returning a non-2xx response, network error, or missing entirely is flagged here. (${images.length} total IMAGE objects checked.)`,
      totalDenominator: images.length,
      totalDenominatorLabel: 'IMAGE objects',
      columns: ['Image ID', 'Name', 'URL', 'Error'],
      rows
    })
  }

  // ---- 14. Orphaned IMAGE objects ------------------------------------------
  {
    const referencedImageIds = new Set<string>()
    for (const i of items) {
      for (const id of i.imageIds) referencedImageIds.add(id)
      for (const v of i.variations) for (const id of v.imageIds) referencedImageIds.add(id)
    }
    const rows: IssueRow[] = images
      .filter((im) => !referencedImageIds.has(im.id))
      .map((im) => ({
        details: {
          imageId: im.id,
          name: truncate(im.name ?? '', 50),
          url: im.url ? truncate(im.url, 80) : '<unset>'
        }
      }))
    sections.push({
      num: 14,
      title: 'Orphaned IMAGE objects (referenced by no item)',
      description: `IMAGE objects in the catalog that no ITEM (or ITEM_VARIATION) references through \`imageIds\`. Distinct image IDs referenced in this snapshot: ${referencedImageIds.size}. Production currently has many leftover images from prior LitCommerce / Square Online operations.`,
      totalDenominator: images.length,
      totalDenominatorLabel: 'IMAGE objects',
      columns: ['Image ID', 'Name', 'URL Preview'],
      rows
    })
  }

  // ---- 15. Orphaned ITEM_VARIATIONs (parent deleted) -----------------------
  {
    // Variations live nested under their parent ITEM in this snapshot.
    // An "orphan" here would be a nested variation whose `itemVariationData.itemId`
    // points at a non-existent ITEM in the snapshot. With nested storage this
    // is rare but worth verifying.
    const allItemIds = new Set(items.map((i) => i.id))
    const rows: IssueRow[] = []
    for (const i of items) {
      for (const v of i.variations) {
        if (v.itemId && !allItemIds.has(v.itemId)) {
          rows.push({
            details: {
              parentRef: v.itemId,
              actualParent: i.id,
              variationId: v.id,
              variationName: truncate(v.name, 40),
              itemName: truncate(i.name, 40)
            }
          })
        }
      }
    }
    const totalVariations = items.reduce((s, i) => s + i.variations.length, 0)
    sections.push({
      num: 15,
      title: 'Orphaned ITEM_VARIATIONs (parent deleted)',
      description:
        'Variations whose `itemVariationData.itemId` points at an ITEM not in this snapshot. Nested storage makes literal orphans rare; this also flags variations whose `itemId` field disagrees with the ITEM they are nested in (catalog-integrity bug).',
      totalDenominator: totalVariations,
      totalDenominatorLabel: 'variations',
      columns: [
        'Parent Ref (in variation)',
        'Actual Parent (in snapshot)',
        'Variation ID',
        'Variation Name',
        'Item Name'
      ],
      rows
    })
  }

  // ---- 16. Unused custom attribute definitions -----------------------------
  {
    // Build a set of custom-attribute slot keys actually used. Walk each
    // item's customAttributeValues. In this snapshot, NO item uses any
    // custom attribute — so all 5 definitions will appear here.
    const usedKeys = new Set<string>()
    for (const o of snap.objects) {
      if (o.type !== 'ITEM') continue
      const cav = o.customAttributeValues
      if (!cav || typeof cav !== 'object') continue
      for (const k of Object.keys(cav)) usedKeys.add(k)
      // Also walk variations.
      for (const v of o.itemData?.variations ?? []) {
        const vcav = v.customAttributeValues
        if (vcav && typeof vcav === 'object') {
          for (const k of Object.keys(vcav)) usedKeys.add(k)
        }
      }
    }

    const rows: IssueRow[] = customDefs
      .filter((d) => !usedKeys.has(d.key))
      .map((d) => ({
        details: {
          definitionId: d.id,
          key: d.key,
          name: d.name,
          type: d.type,
          allowedObjectTypes: d.allowedObjectTypes.join(', '),
          source: d.sourceApplicationName || '<unknown>',
          riskNote:
            d.sourceApplicationName === 'Square Online Store'
              ? 'system-managed — deleting is risky'
              : 'staff-created — safe to delete if truly unused'
        }
      }))
    sections.push({
      num: 16,
      title: 'Unused custom attribute definitions',
      description: `Custom attribute definitions where no ITEM or ITEM_VARIATION sets a value. Items used keys observed in snapshot: ${[...usedKeys].join(', ') || '<none>'}. Risk column distinguishes Square-system definitions (don't delete) from staff-created ones.`,
      totalDenominator: customDefs.length,
      totalDenominatorLabel: 'definitions',
      columns: ['Definition ID', 'Key', 'Name', 'Type', 'Allowed Types', 'Source', 'Risk Note'],
      rows
    })
  }

  // ---- 17. Media/Size custom-attribute conflict with ITEM_OPTION ----------
  {
    const optionNames = new Map<string, string>()
    for (const io of itemOptions) optionNames.set(io.name, io.id)
    const conflicts = customDefs.filter((d) => optionNames.has(d.name))
    const rows: IssueRow[] = conflicts.map((d) => ({
      details: {
        attributeDefId: d.id,
        attributeKey: d.key,
        attributeName: d.name,
        attributeSource: d.sourceApplicationName || '<unknown>',
        conflictingItemOptionId: optionNames.get(d.name) ?? '<unknown>',
        recommendation:
          'ITEM_OPTION is the canonical mechanism for variant axes; the custom-attribute definition is dead weight.'
      }
    }))
    sections.push({
      num: 17,
      title: '`Media` / `Size` custom attributes conflicting with ITEM_OPTIONs',
      description:
        'There are CUSTOM_ATTRIBUTE_DEFINITIONs with the same name as existing ITEM_OPTIONs. Variant behavior is happening via ITEM_OPTION + ITEM_VARIATION, not via these attributes, so the attribute definitions are vestigial. Listed individually below.',
      totalDenominator: customDefs.length,
      totalDenominatorLabel: 'custom attribute definitions',
      columns: [
        'Attribute Def ID',
        'Attribute Key',
        'Attribute Name',
        'Source',
        'Conflicting ITEM_OPTION ID',
        'Recommendation'
      ],
      rows
    })
  }

  return sections
}

// -- HEAD-check broken image URLs -------------------------------------------

async function headCheckImages(images: ImageObj[], concurrency = 20): Promise<Map<string, string>> {
  // Returns map of imageId → error string for those that failed.
  const broken = new Map<string, string>()
  let next = 0

  async function worker(): Promise<void> {
    while (true) {
      const i = next++
      if (i >= images.length) return
      const im = images[i]
      if (!im.url) {
        broken.set(im.id, 'no URL on imageData')
        continue
      }
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 6000)
        const res = await fetch(im.url, { method: 'HEAD', signal: controller.signal })
        clearTimeout(timer)
        if (!res.ok) broken.set(im.id, `HTTP ${res.status}`)
      } catch (err) {
        const msg = (err as Error)?.message ?? String(err)
        broken.set(im.id, `fetch error: ${truncate(msg, 80)}`)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return broken
}

// -- Report rendering -------------------------------------------------------

function renderSection(s: IssueSection): string {
  const lines: string[] = []
  lines.push(`## ${s.num}. ${s.title}`)
  lines.push('')
  lines.push(`**Found ${s.rows.length} of ${s.totalDenominator} ${s.totalDenominatorLabel}.**`)
  lines.push('')
  lines.push(s.description)
  if (s.extra) {
    lines.push('')
    lines.push(s.extra)
  }
  lines.push('')

  if (s.rows.length === 0) {
    lines.push('_No issues found._')
    lines.push('')
    return lines.join('\n')
  }

  // Render table. Column order is dictated by s.columns; the corresponding
  // detail key is inferred from a header→key map below — but we built rows
  // with arbitrary keys, so we map column index → row.details key in order.
  // Each row's `details` is ordered the same way we built it; iterate keys
  // from the first row to get column order, then render.
  const firstKeys = Object.keys(s.rows[0].details)
  // Sanity: columns length should match firstKeys length.
  const headers = s.columns.length === firstKeys.length ? s.columns : firstKeys
  lines.push(`| ${headers.join(' | ')} |`)
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`)
  for (const r of s.rows) {
    const cells = firstKeys.map((k) => escapeMd(r.details[k] ?? ''))
    lines.push(`| ${cells.join(' | ')} |`)
  }
  lines.push('')
  return lines.join('\n')
}

function renderReport(
  snap: Snapshot,
  sections: IssueSection[],
  startedAt: Date,
  finishedAt: Date,
  imageCheckSkipped: boolean
): string {
  const lines: string[] = []
  lines.push('# Square production catalog audit')
  lines.push('')
  lines.push(`**Source snapshot:** \`${SNAPSHOT_FILE}\`  `)
  lines.push(`**Snapshot taken at:** ${snap.takenAt}  `)
  lines.push(`**Source env:** ${snap.source.env}  `)
  lines.push(`**Audit generated at:** ${finishedAt.toISOString()}  `)
  lines.push(
    `**Audit runtime:** ${((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(2)}s`
  )
  if (imageCheckSkipped) {
    lines.push('')
    lines.push(
      '> ⚠️ Image URL HEAD-checks were skipped (`--no-check-urls`). Section 13 will be empty.'
    )
  }
  lines.push('')
  lines.push(
    'Read-only audit of the production Square catalog, generated from the snapshot listed above. No changes were made to Square. The 17 sections below mirror the categories defined in `square-cleanup-handoff.md` (Phase B).'
  )
  lines.push('')

  // Headline summary table.
  lines.push('## Summary')
  lines.push('')
  lines.push('| # | Issue | Count | of | Total |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const s of sections) {
    lines.push(
      `| ${s.num} | ${escapeMd(s.title)} | ${s.rows.length} | / | ${s.totalDenominator} ${s.totalDenominatorLabel} |`
    )
  }
  lines.push('')

  // Catalog inventory.
  lines.push('## Catalog inventory (from snapshot)')
  lines.push('')
  lines.push('| Type | Count |')
  lines.push('| --- | --- |')
  for (const [type, count] of Object.entries(snap.counts)) {
    lines.push(`| ${type} | ${count} |`)
  }
  lines.push('')

  // Sections.
  for (const s of sections) {
    lines.push(renderSection(s))
  }

  // Footer.
  lines.push('---')
  lines.push('')
  lines.push('Generated by `pnpm sq:audit` (see `scripts/square-cleanup/audit.ts`).')
  lines.push('')
  return lines.join('\n')
}

// -- Main --------------------------------------------------------------------

async function main(): Promise<void> {
  const startedAt = new Date()
  console.log(`Reading snapshot: ${SNAPSHOT_FILE}`)
  const raw = await readFile(SNAPSHOT_FILE!, 'utf-8')
  const snap = JSON.parse(raw) as Snapshot
  console.log(`  taken at: ${snap.takenAt}`)
  console.log(`  source env: ${snap.source.env}`)
  console.log(`  objects: ${snap.objects.length}`)

  // Pre-extract images for HEAD-check.
  const images: ImageObj[] = []
  for (const o of snap.objects) {
    if (o.type === 'IMAGE') {
      const im = o.imageData ?? {}
      images.push({
        id: o.id,
        name: typeof im.name === 'string' ? im.name : '',
        url: typeof im.url === 'string' ? im.url : ''
      })
    }
  }

  let broken: Map<string, string> = new Map()
  if (!NO_CHECK_URLS && images.length > 0) {
    console.log(`HEAD-checking ${images.length} IMAGE URLs (concurrency 20)...`)
    const t0 = Date.now()
    broken = await headCheckImages(images, 20)
    const dt = ((Date.now() - t0) / 1000).toFixed(2)
    console.log(`  done in ${dt}s — ${broken.size} broken`)
  } else if (NO_CHECK_URLS) {
    console.log('Skipping image HEAD-checks (--no-check-urls).')
  }

  const sections = buildReport(snap, broken, NO_CHECK_URLS)
  const finishedAt = new Date()
  const markdown = renderReport(snap, sections, startedAt, finishedAt, NO_CHECK_URLS)

  await writeFile(path.resolve(OUT_FILE), markdown, 'utf-8')
  console.log(`\nReport written: ${OUT_FILE}`)
  console.log(`Total runtime: ${((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(2)}s`)

  // Brief in-terminal summary.
  console.log('\nHeadline counts:')
  for (const s of sections) {
    console.log(
      `  ${String(s.num).padStart(2)}. ${s.title.padEnd(60)} ${s.rows.length} / ${s.totalDenominator}`
    )
  }
}

main().catch((err) => {
  console.error('audit failed:', err)
  process.exit(1)
})
