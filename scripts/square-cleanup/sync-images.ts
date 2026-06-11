#!/usr/bin/env tsx
/**
 * Copies product images from the PRODUCTION Square catalog into the SANDBOX
 * Square catalog, attaching each image to the matching sandbox ITEM.
 *
 * Why this exists:
 *   The sandbox was seeded from production via `mirror.ts`, but that path
 *   cannot create IMAGE objects — Square requires the image *binary* via the
 *   multipart CreateCatalogImage endpoint, which batchUpsert can't do. So the
 *   mirror scrubbed every image reference (see lib.ts `scrubUnresolvedTempRefs`)
 *   and sandbox items ended up with no imagery. The dev site
 *   (dev.animeniacs.shop) reads the SANDBOX catalog, so /shop + product pages
 *   show no images. This script fills that gap.
 *
 * What it does:
 *   1. Reads every ITEM + IMAGE from PRODUCTION (READ-ONLY).
 *   2. Reads every ITEM from SANDBOX.
 *   3. Matches prod items → sandbox items by a stable key (primary variation
 *      SKU, falling back to exact item name). Ambiguous (duplicate-key) and
 *      unmatched items are reported and skipped — never guessed.
 *   4. For each matched sandbox item that has NO images yet (idempotent), it
 *      fetches each prod image's presigned URL and uploads the bytes to the
 *      SANDBOX via CreateCatalogImage, attaching to the sandbox item. The
 *      first image is marked primary.
 *
 * Safety:
 *   - PRODUCTION is opened ONLY for reads (`buildClient('production')`). No
 *     create/update/delete is ever issued against the prod client.
 *   - All writes go to the SANDBOX (`buildClient('sandbox')`).
 *   - Dry-run by default. Pass --apply to actually upload.
 *
 * Usage:
 *   pnpm sq:sync-images            # dry run — prints the match + upload plan
 *   pnpm sq:sync-images --apply    # uploads images into the sandbox
 */

import { type CatalogObject, type SquareEnv, buildClient, chunk, listAll, sleep } from './lib'

const APPLY = process.argv.includes('--apply')

// ---------- Types ----------

interface ProdImage {
  imageId: string
  url: string
  name?: string
  caption?: string
}

interface ProdItemImages {
  itemId: string
  itemName: string
  /** Primary variation SKU, if any — preferred match key. */
  sku?: string
  /** Ordered, resolved images (only those with a fetchable URL). */
  images: ProdImage[]
}

interface SandboxItem {
  itemId: string
  itemName: string
  sku?: string
  hasImages: boolean
}

interface PlannedUpload {
  prod: ProdItemImages
  sandboxItemId: string
  sandboxItemName: string
  matchedBy: 'sku' | 'name'
}

// ---------- Helpers ----------

/** Primary variation SKU of an ITEM, if present (first variation wins). */
function primarySku(item: CatalogObject): string | undefined {
  const variations = item.itemData?.variations as
    | Array<{ itemVariationData?: { sku?: string } }>
    | undefined
  const sku = variations?.[0]?.itemVariationData?.sku
  return typeof sku === 'string' && sku.trim().length > 0 ? sku.trim() : undefined
}

/** Build a Map<key, items[]> so we can detect ambiguous duplicate keys. */
function indexBy<T>(items: T[], keyOf: (item: T) => string | undefined): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    if (!key) continue
    const list = out.get(key)
    if (list) list.push(item)
    else out.set(key, [item])
  }
  return out
}

// ---------- Read: production ----------

async function readProduction(): Promise<ProdItemImages[]> {
  // READ-ONLY production client. Never used for writes.
  const prod = buildClient('production')

  console.log('Reading PRODUCTION catalog (read-only)...')
  const [items, images] = await Promise.all([listAll(prod, 'ITEM'), listAll(prod, 'IMAGE')])
  console.log(`  prod ITEMs:  ${items.length}`)
  console.log(`  prod IMAGEs: ${images.length}`)

  // Resolve imageId → {url, name, caption}. The IMAGE object's
  // imageData.url is the presigned/served URL we fetch bytes from.
  const imageById = new Map<string, ProdImage>()
  for (const img of images) {
    const data = img.imageData as { url?: string; name?: string; caption?: string } | undefined
    if (!data?.url) continue
    imageById.set(img.id, {
      imageId: img.id,
      url: data.url,
      name: data.name ?? undefined,
      caption: data.caption ?? undefined
    })
  }

  const result: ProdItemImages[] = []
  for (const item of items) {
    const imageIds = (item.itemData?.imageIds as string[] | undefined) ?? []
    if (imageIds.length === 0) continue

    const resolved: ProdImage[] = []
    for (const id of imageIds) {
      const img = imageById.get(id)
      if (img) resolved.push(img)
      else console.warn(`  warn: prod item "${item.itemData?.name}" references missing IMAGE ${id}`)
    }
    if (resolved.length === 0) continue

    result.push({
      itemId: item.id,
      itemName: (item.itemData?.name as string) ?? '(unnamed)',
      sku: primarySku(item),
      images: resolved
    })
  }

  return result
}

// ---------- Read: sandbox ----------

async function readSandbox(client: ReturnType<typeof buildClient>): Promise<SandboxItem[]> {
  console.log('Reading SANDBOX catalog...')
  const items = await listAll(client, 'ITEM')
  console.log(`  sandbox ITEMs: ${items.length}`)

  return items.map((item) => ({
    itemId: item.id,
    itemName: (item.itemData?.name as string) ?? '(unnamed)',
    sku: primarySku(item),
    hasImages: ((item.itemData?.imageIds as string[] | undefined) ?? []).length > 0
  }))
}

// ---------- Matching ----------

interface MatchResult {
  planned: PlannedUpload[]
  skippedAlreadyHadImages: PlannedUpload[]
  unmatched: ProdItemImages[]
  ambiguous: Array<{ prod: ProdItemImages; key: string; by: 'sku' | 'name'; candidates: string[] }>
}

function matchItems(prodItems: ProdItemImages[], sandboxItems: SandboxItem[]): MatchResult {
  const bySku = indexBy(sandboxItems, (s) => s.sku)
  const byName = indexBy(sandboxItems, (s) => s.itemName)

  const planned: PlannedUpload[] = []
  const skippedAlreadyHadImages: PlannedUpload[] = []
  const unmatched: ProdItemImages[] = []
  const ambiguous: MatchResult['ambiguous'] = []

  for (const prod of prodItems) {
    // Prefer SKU match.
    let candidates: SandboxItem[] | undefined
    let by: 'sku' | 'name' = 'sku'

    if (prod.sku) candidates = bySku.get(prod.sku)
    if (!candidates || candidates.length === 0) {
      // Fall back to exact item name.
      by = 'name'
      candidates = byName.get(prod.itemName)
    }

    if (!candidates || candidates.length === 0) {
      unmatched.push(prod)
      continue
    }
    if (candidates.length > 1) {
      ambiguous.push({
        prod,
        key: by === 'sku' ? (prod.sku as string) : prod.itemName,
        by,
        candidates: candidates.map((c) => c.itemId)
      })
      continue
    }

    const sandbox = candidates[0]
    const plan: PlannedUpload = {
      prod,
      sandboxItemId: sandbox.itemId,
      sandboxItemName: sandbox.itemName,
      matchedBy: by
    }
    // Idempotency: never re-upload onto an item that already has images.
    if (sandbox.hasImages) skippedAlreadyHadImages.push(plan)
    else planned.push(plan)
  }

  return { planned, skippedAlreadyHadImages, unmatched, ambiguous }
}

// ---------- Upload ----------

/**
 * Fetch a single prod image URL → Blob, then CreateCatalogImage onto the
 * sandbox item. Retries on 429 (rate limit) with exponential backoff.
 * Returns true on success.
 */
async function uploadImage(
  sandboxClient: ReturnType<typeof buildClient>,
  sandboxItemId: string,
  image: ProdImage,
  index: number
): Promise<boolean> {
  // Presigned prod URLs are account-scoped and expire — fetch right before
  // upload.
  const res = await fetch(image.url)
  if (!res.ok) {
    console.log(`      image ${index}: FETCH FAILED (${res.status})`)
    return false
  }
  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const bytes = await res.arrayBuffer()
  const blob = new Blob([bytes], { type: contentType })

  // Deterministic idempotency key per (sandboxItem, imageIndex) so retries
  // never create duplicates.
  const idempotencyKey = `sync-images-${sandboxItemId}-${index}`

  const maxAttempts = 5
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await sandboxClient.catalog.images.create({
        request: {
          idempotencyKey,
          objectId: sandboxItemId,
          isPrimary: index === 0,
          image: {
            type: 'IMAGE',
            id: '#temp_img',
            imageData: {
              name: image.name,
              caption: image.caption
            }
          } as never
        },
        imageFile: blob
      })
      return true
    } catch (err) {
      const e = err as { statusCode?: number; message?: string }
      const is429 = e.statusCode === 429
      if (is429 && attempt < maxAttempts) {
        const backoff = 500 * 2 ** (attempt - 1)
        console.log(`      image ${index}: 429 — backing off ${backoff}ms (attempt ${attempt})`)
        await sleep(backoff)
        continue
      }
      console.log(`      image ${index}: UPLOAD FAILED — ${e.message ?? 'unknown error'}`)
      return false
    }
  }
  return false
}

// ---------- Report ----------

function reportPlan(env: SquareEnv, prodItems: ProdItemImages[], match: MatchResult): void {
  const totalImages = match.planned.reduce((n, p) => n + p.prod.images.length, 0)

  console.log('\n=== MATCH PLAN ===\n')
  console.log(`  prod items with images:     ${prodItems.length}`)
  console.log(`  matched → will upload:      ${match.planned.length} items (${totalImages} images)`)
  console.log(`  matched → already had imgs: ${match.skippedAlreadyHadImages.length} (skipped)`)
  console.log(`  unmatched prod items:       ${match.unmatched.length}`)
  console.log(`  ambiguous prod items:       ${match.ambiguous.length}`)

  if (match.planned.length > 0) {
    console.log('\n  To upload:')
    for (const p of match.planned) {
      console.log(
        `    [${p.matchedBy}] ${p.prod.itemName.padEnd(40)} → ${p.sandboxItemId}  (${p.prod.images.length} img)`
      )
    }
  }

  if (match.skippedAlreadyHadImages.length > 0) {
    console.log('\n  Skipped (sandbox item already has images):')
    for (const p of match.skippedAlreadyHadImages) {
      console.log(`    ${p.prod.itemName.padEnd(40)} → ${p.sandboxItemId}`)
    }
  }

  if (match.unmatched.length > 0) {
    console.log('\n  UNMATCHED prod items (no sandbox item by SKU or name) — NEEDS HUMAN:')
    for (const u of match.unmatched) {
      console.log(`    ${u.itemName.padEnd(40)} sku=${u.sku ?? '(none)'}  (${u.images.length} img)`)
    }
  }

  if (match.ambiguous.length > 0) {
    console.log('\n  AMBIGUOUS prod items (multiple sandbox candidates) — NEEDS HUMAN, skipped:')
    for (const a of match.ambiguous) {
      console.log(
        `    ${a.prod.itemName.padEnd(40)} ${a.by}="${a.key}" → candidates: ${a.candidates.join(', ')}`
      )
    }
  }
}

// ---------- Main ----------

async function main(): Promise<void> {
  console.log(`Square sync-images — mode=${APPLY ? 'APPLY' : 'dry-run'}`)
  console.log('PRODUCTION = read-only source · SANDBOX = write target\n')

  // Sandbox client is the ONLY client we ever write through.
  const sandboxClient = buildClient('sandbox')

  const prodItems = await readProduction()
  const sandboxItems = await readSandbox(sandboxClient)

  const match = matchItems(prodItems, sandboxItems)
  reportPlan('sandbox', prodItems, match)

  if (!APPLY) {
    console.log('\nDRY RUN — no images uploaded. Re-run with --apply to commit.')
    return
  }

  console.log('\n=== APPLYING (uploading to SANDBOX) ===')
  let uploaded = 0
  let failed = 0

  // Pace per item to respect Square rate limits.
  const itemChunks = chunk(match.planned, 5)
  for (const group of itemChunks) {
    for (const plan of group) {
      console.log(`  ${plan.sandboxItemName} → ${plan.sandboxItemId}`)
      for (let i = 0; i < plan.prod.images.length; i++) {
        const ok = await uploadImage(sandboxClient, plan.sandboxItemId, plan.prod.images[i], i)
        if (ok) {
          uploaded++
          console.log(`      image ${i}: uploaded${i === 0 ? ' (primary)' : ''}`)
        } else {
          failed++
        }
        await sleep(200)
      }
    }
    await sleep(500)
  }

  console.log('\n=== APPLY COMPLETE ===')
  console.log(`  images uploaded:        ${uploaded}`)
  console.log(`  images failed:          ${failed}`)
  console.log(`  items skipped (had img):${match.skippedAlreadyHadImages.length}`)
  console.log(`  unmatched prod items:   ${match.unmatched.length}`)
  console.log(`  ambiguous prod items:   ${match.ambiguous.length}`)
  if (failed > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error('\nsync-images failed:', err)
  process.exit(1)
})
