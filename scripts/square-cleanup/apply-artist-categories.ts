#!/usr/bin/env tsx
/**
 * SANDBOX-ONLY write: tag every catalog item with its artist's Square
 * sub-category, using the live WooCommerce store (animeniacs.shop) as the
 * source of truth for item -> artist.
 *
 * Run this AFTER `pnpm sq:mirror` (so sandbox has all the prod artist
 * sub-categories). Production is never touched. Reversible via re-mirror.
 *
 * Policy (per operator):
 *   - tag each item to its artist's EXISTING sandbox sub-category
 *   - DalynTnT: SKIP entirely (do not create, do not tag)
 *   - AMR: create a new sub-category under the Artist parent, then tag its items
 *
 *   Dry run: pnpm tsx --env-file=.env.local scripts/square-cleanup/apply-artist-categories.ts
 *   Apply:   pnpm tsx --env-file=.env.local scripts/square-cleanup/apply-artist-categories.ts --apply
 */
import { randomUUID } from 'node:crypto'
import { buildClient, listAll, type CatalogObject } from './lib'

const WOO = 'https://animeniacs.shop/wp-json/wc/store/v1/products'
const APPLY = process.argv.includes('--apply')

// WooCommerce categories that are product-type / genre / style — NOT artists.
const NON_ARTIST_WOO = new Set(
  [
    'Acrylic Wall Art',
    'Anime',
    'Video Games',
    'Comics',
    'Movies',
    'Acoustic Art Panels',
    'Ani-Customs',
    'DC',
    'Lit Box Frame',
    'Marvel',
    'portrait',
    'Landscape'
  ].map((s) => s.toLowerCase())
)

// Artists to skip entirely (no category, no tagging).
const SKIP_ARTISTS = new Set(['dalyntnt'])
// Artist categories to CREATE in sandbox (absent from prod, so not mirrored).
const CREATE_ARTISTS = ['AMR']

function decode(s: string): string {
  return s
    .replace(/&#0?38;|&amp;/g, '&')
    .replace(/&#8217;|&#039;|&#39;/g, "'")
    .replace(/&#8211;|&#8212;/g, '-')
    .replace(/&quot;/g, '"')
    .replace(/&#8230;/g, '...')
}
function norm(s: string): string {
  return decode(s).toLowerCase().replace(/[^a-z0-9]/g, '')
}

interface WooProduct {
  name: string
  categories: { name: string }[]
}

async function fetchWoo(): Promise<WooProduct[]> {
  const out: WooProduct[] = []
  for (let page = 1; page < 20; page++) {
    const res = await fetch(`${WOO}?per_page=100&page=${page}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    if (!res.ok) break
    const batch = (await res.json()) as WooProduct[]
    if (!batch.length) break
    out.push(...batch)
    const totalPages = Number(res.headers.get('x-wp-totalpages') ?? '1')
    if (page >= totalPages) break
  }
  return out
}

function wooArtistOf(p: WooProduct): string | null {
  const arts = p.categories.map((c) => c.name).filter((n) => !NON_ARTIST_WOO.has(n.toLowerCase()))
  return arts[0] ?? null
}

interface Sub {
  id: string
  name: string
}

/** Resolve a Woo artist name to a sandbox sub-category (normalized substring). */
function resolveSub(wooArtist: string, subs: Sub[]): Sub | null {
  const wn = norm(wooArtist)
  return (
    subs.find((s) => {
      const sn = norm(s.name)
      return sn === wn || sn.includes(wn) || wn.includes(sn)
    }) ?? null
  )
}

function itemCategoryIds(it: CatalogObject): string[] {
  const cats = it.itemData?.categories
  return Array.isArray(cats) ? cats.map((c: { id: string }) => c.id).filter(Boolean) : []
}

async function main() {
  console.log(`ARTIST sandbox tagging — mode: ${APPLY ? 'APPLY (writes sandbox)' : 'DRY RUN'}\n`)

  const client = buildClient('sandbox')
  const cats = await listAll(client, 'CATEGORY')
  const allCats = cats.map((o) => ({
    id: o.id,
    name: o.categoryData?.name ?? '(unnamed)',
    parent: o.categoryData?.parentCategory?.id ?? null
  }))
  const artistParent = allCats.find((c) => c.name === 'Artist' && c.parent === null)
  if (!artistParent) throw new Error('No sandbox Artist parent category found.')
  let subs: Sub[] = allCats
    .filter((c) => c.parent === artistParent.id)
    .map((c) => ({ id: c.id, name: c.name }))

  console.log(`Sandbox Artist parent: ${artistParent.id}`)
  console.log(`Sandbox artist sub-categories present: ${subs.length}`)
  if (subs.length <= 1) {
    console.log(
      '\n!! Only the merc category is present. Run `pnpm sq:mirror` first so the\n' +
        '   other artist sub-categories exist, then re-run this script.'
    )
    if (!APPLY) return
  }

  // Create any missing CREATE_ARTISTS categories (AMR).
  for (const name of CREATE_ARTISTS) {
    if (resolveSub(name, subs)) {
      console.log(`  category "${name}" already exists — skipping create.`)
      continue
    }
    if (!APPLY) {
      console.log(`  [dry] would CREATE sandbox category "${name}" under Artist parent.`)
      subs = [...subs, { id: `#new_${norm(name)}`, name }]
      continue
    }
    const res = await client.catalog.batchUpsert({
      idempotencyKey: randomUUID(),
      batches: [
        {
          objects: [
            {
              type: 'CATEGORY',
              id: `#${norm(name)}`,
              categoryData: { name, parentCategory: { id: artistParent.id } }
            }
          ] as never
        }
      ]
    })
    // biome-ignore lint/suspicious/noExplicitAny: SDK union
    const mappings: any[] = (res as any).idMappings ?? []
    const realId = mappings[0]?.objectId
    if (!realId) throw new Error(`Failed to create category ${name}`)
    console.log(`  CREATED category "${name}" -> ${realId}`)
    subs = [...subs, { id: realId, name }]
  }

  // Woo: artwork name -> artist.
  const products = await fetchWoo()
  const wooArtistByName = new Map<string, string>()
  for (const p of products) {
    const a = wooArtistOf(p)
    if (a) wooArtistByName.set(norm(p.name), a)
  }
  console.log(`\nWoo products: ${products.length}, with an artist: ${wooArtistByName.size}`)

  // Items.
  const items = await listAll(client, 'ITEM')

  // Decide artist per item: Woo name match, else "<artist> prints/acrylic" template.
  const TEMPLATE_RE = /\b(prints?|acrylics?)\b/i
  const plan = new Map<string, CatalogObject[]>() // subId -> items to tag
  const skipped: string[] = []
  const unresolved: string[] = []

  for (const it of items) {
    const name = it.itemData?.name ?? ''
    const n = norm(name)
    let wooArtist = wooArtistByName.get(n) ?? null

    if (!wooArtist && TEMPLATE_RE.test(name)) {
      // strip the product-type word and match the remainder to an artist name
      const base = norm(name.replace(TEMPLATE_RE, ''))
      const hit = subs.find((s) => {
        const sn = norm(s.name)
        return base.length >= 3 && (sn.includes(base) || base.includes(sn))
      })
      if (hit) wooArtist = hit.name
      else if (/dalyn/i.test(name)) wooArtist = 'DalynTnT'
    }

    if (!wooArtist) {
      unresolved.push(name)
      continue
    }
    if (SKIP_ARTISTS.has(norm(wooArtist))) {
      skipped.push(`${name} (${wooArtist})`)
      continue
    }
    const sub = resolveSub(wooArtist, subs)
    if (!sub) {
      unresolved.push(`${name}  [artist "${wooArtist}" has no sandbox category]`)
      continue
    }
    if (itemCategoryIds(it).includes(sub.id)) continue // already tagged
    const arr = plan.get(sub.id) ?? []
    arr.push(it)
    plan.set(sub.id, arr)
  }

  // Report plan.
  const subById = new Map(subs.map((s) => [s.id, s.name]))
  console.log('\n## Tagging plan (items to add per artist sub-category)\n')
  let total = 0
  for (const [subId, list] of [...plan.entries()].sort(
    (a, b) => (subById.get(a[0]) ?? '').localeCompare(subById.get(b[0]) ?? '')
  )) {
    console.log(`  ${String(list.length).padStart(3)}  ${subById.get(subId)}  [${subId}]`)
    total += list.length
  }
  console.log(`\n  total items to tag: ${total}`)
  console.log(`  skipped (DalynTnT): ${skipped.length}`)
  console.log(`  unresolved (no artist / needs review): ${unresolved.length}`)
  for (const u of unresolved) console.log(`     ? ${u}`)

  if (!APPLY) {
    console.log('\n(DRY RUN — no writes. Re-run with --apply.)')
    return
  }

  // Apply: append category to each item and upsert (preserve version + variations).
  const toUpsert: CatalogObject[] = []
  for (const [subId, list] of plan) {
    for (const it of list) {
      const existing = Array.isArray(it.itemData.categories) ? it.itemData.categories : []
      it.itemData.categories = [...existing, { id: subId }]
      toUpsert.push(it)
    }
  }
  for (let i = 0; i < toUpsert.length; i += 50) {
    const chunk = toUpsert.slice(i, i + 50)
    await client.catalog.batchUpsert({
      idempotencyKey: randomUUID(),
      batches: [{ objects: chunk as never }]
    })
    console.log(`  upserted ${Math.min(i + 50, toUpsert.length)}/${toUpsert.length}`)
  }

  // Verify each artist category via the page's exact query.
  console.log('\n## VERIFY — searchItems(categoryIds=[sub]) per artist\n')
  for (const s of subs.sort((a, b) => a.name.localeCompare(b.name))) {
    const search = await client.catalog.searchItems({ categoryIds: [s.id], limit: 100 })
    // biome-ignore lint/suspicious/noExplicitAny: SDK union
    const found: any[] = (search as any).items ?? []
    const active = found.filter((it) => it.itemData?.isArchived !== true)
    console.log(`  ${String(active.length).padStart(3)}  ${s.name}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
