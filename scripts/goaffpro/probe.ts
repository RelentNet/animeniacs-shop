#!/usr/bin/env tsx
/**
 * GoAffPro API probe — read-only.
 *
 * Mirrors the spirit of scripts/square-cleanup/probe.ts: hit a handful of
 * endpoints, dump the response shapes, summarize counts and field
 * distribution, save a JSON snapshot for archival.
 *
 * Auth (confirmed by curl prior to this probe):
 *   - Admin endpoints: header `x-goaffpro-access-token: <admin token>`
 *   - Public endpoints: header `x-goaffpro-public-token: <public token>`
 *
 * Tokens come from .env.local:
 *   - GOAFFPRO_ADMIN_API_KEY
 *   - GOAFFPRO_PUBLIC_TOKEN
 *
 * Usage:
 *   pnpm goaffpro:probe
 *
 * Output:
 *   /tmp/goaffpro-snapshot-<UTC-timestamp>.json
 *
 * NOT a permanent tool — kept in-tree as a record of how the probe was
 * done, paired with docs/superpowers/specs/reference/goaffpro-api-probes.md.
 */

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config as loadDotenv } from 'dotenv'

loadDotenv({ path: '.env.local', override: false })

const API_BASE = 'https://api.goaffpro.com/v1'

/**
 * GoAffPro list endpoints return EMPTY OBJECTS unless you tell them which
 * fields to include via `?fields=...`. Discovered during the first probe
 * run — the list endpoint without `fields` returned 195 `{}` entries.
 *
 * This is a deliberately wide field list: anything plausibly on the
 * affiliate object based on GoAffPro's docs + observed embedded affiliate
 * shapes (from /admin/coupons response). Fields that don't exist are
 * silently dropped from the response, so this is safe to over-request.
 */
const AFFILIATE_FIELDS = [
  // Identity
  'id',
  'name',
  'first_name',
  'last_name',
  'email',
  'phone',
  'website',
  'company',
  // Status
  'status',
  'account_status',
  'is_active',
  // Joinable identifiers
  'ref_code',
  'coupon_code',
  // Profile
  'avatar',
  'profile_image',
  'bio',
  'description',
  // Address
  'country',
  'city',
  'state',
  'zip',
  'address',
  // Social
  'instagram',
  'twitter',
  'facebook',
  'youtube',
  'tiktok',
  'social_media',
  // Segmentation
  'tags',
  'tag_id',
  'tag_ids',
  'group_id',
  'group',
  'group_name',
  'label',
  'role',
  'type',
  'is_artist',
  // Hierarchy
  'parent_id',
  'sub_account',
  'referrer_id',
  // Metrics
  'total_sales',
  'total_commission',
  'unpaid_commission',
  'total_paid',
  'total_orders',
  'total_clicks',
  'total_visitors',
  'conversion_rate',
  'balance',
  // Payments
  'paypal_email',
  'payment_method',
  // Custom fields
  'custom_fields',
  'metadata',
  'notes',
  // Misc
  'locale',
  'timezone',
  'signup_ip',
  'signup_date',
  'created_at',
  'updated_at',
  'last_login'
].join(',')

const ADMIN_TOKEN = process.env.GOAFFPRO_ADMIN_API_KEY
const PUBLIC_TOKEN = process.env.GOAFFPRO_PUBLIC_TOKEN

if (!ADMIN_TOKEN) {
  console.error('GOAFFPRO_ADMIN_API_KEY is not set in .env.local.')
  process.exit(2)
}

interface FetchResult {
  endpoint: string
  status: number
  ok: boolean
  body: unknown
  error?: string
}

async function fetchAdmin(endpoint: string): Promise<FetchResult> {
  const url = `${API_BASE}${endpoint}`
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-goaffpro-access-token': ADMIN_TOKEN!,
        Accept: 'application/json'
      }
    })
    let body: unknown
    const text = await res.text()
    try {
      body = JSON.parse(text)
    } catch {
      body = { _rawText: text.slice(0, 500) }
    }
    return { endpoint, status: res.status, ok: res.ok, body }
  } catch (err) {
    return {
      endpoint,
      status: 0,
      ok: false,
      body: null,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

async function fetchPublic(endpoint: string): Promise<FetchResult> {
  if (!PUBLIC_TOKEN) {
    return {
      endpoint,
      status: 0,
      ok: false,
      body: null,
      error: 'GOAFFPRO_PUBLIC_TOKEN not set; skipping public-endpoint probe'
    }
  }
  const url = `${API_BASE}${endpoint}`
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-goaffpro-public-token': PUBLIC_TOKEN,
        Accept: 'application/json'
      }
    })
    let body: unknown
    const text = await res.text()
    try {
      body = JSON.parse(text)
    } catch {
      body = { _rawText: text.slice(0, 500) }
    }
    return { endpoint, status: res.status, ok: res.ok, body }
  } catch (err) {
    return {
      endpoint,
      status: 0,
      ok: false,
      body: null,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

/** Flatten an object's leaf paths to "a.b.c = type|value" for schema docs. */
function summarizeKeys(obj: unknown, prefix = '', depth = 0, maxDepth = 4): string[] {
  if (depth > maxDepth) return [`${prefix} <truncated depth>`]
  if (obj === null) return [`${prefix} = null`]
  if (typeof obj !== 'object') {
    const val =
      typeof obj === 'string' && (obj as string).length > 60
        ? `${(obj as string).slice(0, 60)}…`
        : obj
    return [`${prefix} = ${JSON.stringify(val)}`]
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return [`${prefix} = [] (empty)`]
    return [
      `${prefix}[] (len=${obj.length})`,
      ...summarizeKeys(obj[0], `${prefix}[0]`, depth + 1, maxDepth)
    ]
  }
  const out: string[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const childPrefix = prefix ? `${prefix}.${k}` : k
    out.push(...summarizeKeys(v, childPrefix, depth + 1, maxDepth))
  }
  return out
}

/** Top-level union of keys that ever appear across the affiliates list. */
function unionKeys(items: Array<Record<string, unknown>>): string[] {
  const set = new Set<string>()
  for (const a of items) {
    for (const k of Object.keys(a)) set.add(k)
  }
  return [...set].sort()
}

/** "Fill rate" — for each key, how many affiliates have a non-empty value. */
function fieldFillRates(
  items: Array<Record<string, unknown>>,
  keys: string[]
): Record<string, { set: number; empty: number; pct: string }> {
  const out: Record<string, { set: number; empty: number; pct: string }> = {}
  for (const k of keys) {
    let set = 0
    let empty = 0
    for (const a of items) {
      const v = a[k]
      const isEmpty =
        v === null ||
        v === undefined ||
        v === '' ||
        (Array.isArray(v) && v.length === 0) ||
        (typeof v === 'object' && v !== null && Object.keys(v).length === 0)
      if (isEmpty) empty++
      else set++
    }
    const total = set + empty
    const pct = total === 0 ? '0%' : `${Math.round((set / total) * 100)}%`
    out[k] = { set, empty, pct }
  }
  return out
}

/** Tally distinct string values for a given key (with cutoff for cardinality). */
function tally(
  items: Array<Record<string, unknown>>,
  key: string,
  topN = 20
): { distinct: number; top: Array<[string, number]> } {
  const counts: Record<string, number> = {}
  for (const a of items) {
    const v = a[key]
    if (v === null || v === undefined || v === '') continue
    const k = typeof v === 'string' ? v : JSON.stringify(v)
    counts[k] = (counts[k] ?? 0) + 1
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return { distinct: entries.length, top: entries.slice(0, topN) }
}

function header(text: string): void {
  console.log(`\n=== ${text} ===`)
}

interface AffiliatesListResponse {
  affiliates?: Array<Record<string, unknown>>
  total?: number
  [k: string]: unknown
}

async function main(): Promise<void> {
  console.log('GoAffPro probe — read-only')
  console.log(`API base: ${API_BASE}`)
  console.log(`Admin token present: ${ADMIN_TOKEN ? 'yes' : 'no'}`)
  console.log(`Public token present: ${PUBLIC_TOKEN ? 'yes' : 'no'}`)

  // --- 1. Confirm admin auth header on /admin/affiliates ---
  // First the bare endpoint (no fields=) to document the empty-object quirk,
  // then again with fields= to actually get data.
  header('1a. Admin auth header probe — GET /admin/affiliates (no fields)')
  const bareRes = await fetchAdmin('/admin/affiliates?limit=1')
  console.log(`  status: ${bareRes.status} ok=${bareRes.ok}`)
  console.log(
    `  first item: ${JSON.stringify(((bareRes.body as AffiliatesListResponse)?.affiliates ?? [])[0] ?? null)}`
  )
  console.log(`  ^^^ note: bare endpoint returns {} per item — fields= is mandatory`)

  header('1b. Admin auth header probe — GET /admin/affiliates?fields=...')
  const listRes = await fetchAdmin(`/admin/affiliates?fields=${AFFILIATE_FIELDS}`)
  console.log(`  status: ${listRes.status} ok=${listRes.ok}`)

  if (!listRes.ok) {
    console.error('  Admin endpoint did NOT return 200. Body:')
    console.error(JSON.stringify(listRes.body, null, 2).slice(0, 800))
    process.exit(1)
  }

  // Show envelope keys so we know if there's a `total`, pagination, etc.
  const envelopeKeys = Object.keys(listRes.body as Record<string, unknown>)
  console.log(`  envelope keys: ${envelopeKeys.join(', ')}`)

  const listBody = listRes.body as AffiliatesListResponse
  let affiliates = listBody.affiliates ?? []
  console.log(`  affiliates in first response: ${affiliates.length}`)
  if (typeof listBody.total === 'number') {
    console.log(`  envelope.total: ${listBody.total}`)
  }

  // --- 2. Pagination — fetch all pages if needed ---
  // GoAffPro typically supports limit/offset on list endpoints. Try a large
  // limit first; if the count is still less than envelope.total, page through.
  // GoAffPro returns `total_results` (not `total`) on the affiliates list.
  const totalCount =
    typeof listBody.total === 'number'
      ? listBody.total
      : typeof (listBody as Record<string, unknown>).total_results === 'number'
        ? ((listBody as Record<string, unknown>).total_results as number)
        : undefined
  console.log(`  envelope total_results: ${totalCount ?? '<absent>'}`)

  if (typeof totalCount === 'number' && affiliates.length < totalCount) {
    header('2. Paginating — fetching remaining affiliates')
    const limit = 250
    const all: Array<Record<string, unknown>> = [...affiliates]
    let offset = affiliates.length
    while (offset < totalCount) {
      const pageRes = await fetchAdmin(
        `/admin/affiliates?limit=${limit}&offset=${offset}&fields=${AFFILIATE_FIELDS}`
      )
      if (!pageRes.ok) {
        console.warn(`  pagination stopped: status ${pageRes.status} at offset ${offset}`)
        break
      }
      const pageBody = pageRes.body as AffiliatesListResponse
      const pageItems = pageBody.affiliates ?? []
      console.log(`  offset=${offset} -> got ${pageItems.length}`)
      if (pageItems.length === 0) break
      all.push(...pageItems)
      offset += pageItems.length
      if (pageItems.length < limit) break
    }
    affiliates = all
    console.log(`  total fetched: ${affiliates.length}`)
  } else {
    // Try once with a high limit just in case totalCount is missing.
    const bigRes = await fetchAdmin(`/admin/affiliates?limit=500&fields=${AFFILIATE_FIELDS}`)
    if (bigRes.ok) {
      const bigBody = bigRes.body as AffiliatesListResponse
      const big = bigBody.affiliates ?? []
      if (big.length > affiliates.length) {
        console.log(`  bumped affiliates with limit=500: ${big.length}`)
        affiliates = big
      }
    }
  }

  // --- 3. Dump first full affiliate so we can see every field ---
  header('3. First affiliate — full object (so every field is visible)')
  if (affiliates[0]) {
    console.log(JSON.stringify(affiliates[0], null, 2))
  } else {
    console.log('  (no affiliates returned)')
  }

  // --- 4. Schema: union of keys + fill rate ---
  header('4. Affiliate schema — union of top-level keys + fill rate')
  const keys = unionKeys(affiliates)
  console.log(`  ${keys.length} distinct top-level keys across ${affiliates.length} affiliates:`)
  console.log(`  ${keys.join(', ')}`)
  const fill = fieldFillRates(affiliates, keys)
  console.log('\n  fill rate by key (set / empty / pct populated):')
  for (const k of keys) {
    const { set, empty, pct } = fill[k]
    console.log(
      `    ${k.padEnd(28)} set=${String(set).padStart(4)} empty=${String(empty).padStart(4)} (${pct})`
    )
  }

  // --- 5. Label / type distribution ---
  // GoAffPro affiliates can carry a `label`, `tags`, `tag_id`, or similar
  // grouping marker. We don't know which one is present until we see the
  // schema, so iterate over every plausible key and tally it.
  header('5. Label / type / tag distribution')
  const labelLikeKeys = keys.filter((k) =>
    /^(label|tag|tags|tag_id|tag_ids|status|account_status|type|group|category|role)$/i.test(k)
  )
  for (const k of labelLikeKeys) {
    const t = tally(affiliates, k)
    console.log(`\n  --- ${k} (distinct=${t.distinct}) ---`)
    for (const [val, count] of t.top) {
      console.log(`    ${count.toString().padStart(4)}  ${val.slice(0, 80)}`)
    }
  }
  if (labelLikeKeys.length === 0) {
    console.log('  (no obvious label/tag/type keys found at top level — check the dump)')
  }

  // --- 6. Profile / social / custom-field presence ---
  header('6. Profile / social / custom-field presence')
  const profileLikeKeys = keys.filter((k) =>
    /(profile|image|avatar|photo|bio|description|first_name|last_name|name|website|instagram|twitter|youtube|facebook|tiktok|social|custom|metadata|fields)/i.test(
      k
    )
  )
  for (const k of profileLikeKeys) {
    const f = fill[k]
    console.log(
      `  ${k.padEnd(28)} set=${String(f.set).padStart(4)} empty=${String(f.empty).padStart(4)} (${f.pct})`
    )
  }

  // --- 7. Slug / coupon code presence (this is the field that joins to Square) ---
  header('7. Joinable identifiers — what would Square reference?')
  const idKeys = keys.filter((k) =>
    /^(id|ref_code|refcode|referral_code|coupon|coupon_code|code|slug|username|handle|email)$/i.test(
      k
    )
  )
  for (const k of idKeys) {
    const t = tally(affiliates, k, 5)
    const f = fill[k]
    console.log(
      `\n  ${k}  (set=${f.set}/${affiliates.length}, distinct=${t.distinct}, sample: ${t.top
        .map(([v]) => v.slice(0, 40))
        .join(' | ')})`
    )
  }

  // --- 7b. Look for known artist names from the Square graveyard SKUs ---
  header('7b. Known artist names from Square graveyard SKUs (case-insensitive)')
  const knownArtists = ['bxnny', 'saru', 'merc', 'merc da artist', 'addham']
  for (const needle of knownArtists) {
    const matches = affiliates.filter((a) => {
      const name = (a.name as string | undefined)?.toLowerCase() ?? ''
      const fn = (a.first_name as string | undefined)?.toLowerCase() ?? ''
      const ln = (a.last_name as string | undefined)?.toLowerCase() ?? ''
      const ref = (a.ref_code as string | undefined)?.toLowerCase() ?? ''
      const n = needle.toLowerCase()
      return name.includes(n) || fn.includes(n) || ln.includes(n) || ref.includes(n)
    })
    console.log(`\n  needle="${needle}" -> ${matches.length} match(es)`)
    for (const m of matches.slice(0, 3)) {
      console.log(
        `    id=${m.id} name="${m.name}" ref_code="${m.ref_code}" status=${m.status} country=${m.country ?? '-'}`
      )
    }
  }

  // --- 7c. Show one record that has rich profile data set (avatar + bio/social) ---
  header('7c. Sample affiliate with the richest profile (avatar + ≥1 social link)')
  const rich = affiliates
    .map((a) => {
      let score = 0
      if (a.avatar || a.profile_image) score += 2
      if (a.bio || a.description) score += 2
      for (const k of ['instagram', 'twitter', 'facebook', 'youtube', 'tiktok']) {
        if (a[k]) score += 1
      }
      if (a.website) score += 1
      return { a, score }
    })
    .sort((x, y) => y.score - x.score)[0]
  if (rich) {
    console.log(`  score=${rich.score}`)
    console.log(JSON.stringify(rich.a, null, 2))
  }

  // --- 7d. Tag / group_id distribution (the actual segmentation mechanism) ---
  header('7d. Segmentation in production: tags + group_id usage')
  const withTags = affiliates.filter(
    (a) => Array.isArray(a.tags) && (a.tags as unknown[]).length > 0
  )
  const withGroup = affiliates.filter((a) => a.group_id !== null && a.group_id !== undefined)
  console.log(`  affiliates with non-empty tags[]: ${withTags.length} / ${affiliates.length}`)
  console.log(`  affiliates with group_id set:     ${withGroup.length} / ${affiliates.length}`)
  if (withTags[0]) {
    console.log(
      `  sample tags entry: id=${withTags[0].id} name="${withTags[0].name}" tags=${JSON.stringify(withTags[0].tags)}`
    )
  }
  if (withGroup[0]) {
    console.log(
      `  sample group entry: id=${withGroup[0].id} name="${withGroup[0].name}" group_id=${withGroup[0].group_id}`
    )
  }

  // --- 8. Detail endpoint — does /admin/affiliates/{id} return more fields than the list? ---
  header('8. Per-affiliate detail probe — GET /admin/affiliates/{id}')
  const sample = affiliates[0]
  const sampleId = sample?.id
  if (sampleId !== undefined) {
    // Detail endpoint may also need fields= — try without first to see if
    // it differs from the list quirk.
    const detailRes = await fetchAdmin(`/admin/affiliates/${sampleId}`)
    console.log(`  detail status: ${detailRes.status} ok=${detailRes.ok}`)
    if (detailRes.ok) {
      const detailBody = detailRes.body as Record<string, unknown>
      const detailEnvelopeKeys = Object.keys(detailBody)
      console.log(`  envelope keys: ${detailEnvelopeKeys.join(', ')}`)

      // The detail endpoint typically returns { affiliate: {...} } or the
      // affiliate object directly; try both.
      const detailAff = (detailBody.affiliate as Record<string, unknown> | undefined) ?? detailBody
      const detailKeys = Object.keys(detailAff).sort()
      const listKeys = Object.keys(sample).sort()
      const extraInDetail = detailKeys.filter((k) => !listKeys.includes(k))
      const missingFromDetail = listKeys.filter((k) => !detailKeys.includes(k))
      console.log(`  detail-only keys: ${extraInDetail.join(', ') || '(none)'}`)
      console.log(`  list-only keys:   ${missingFromDetail.join(', ') || '(none)'}`)
      console.log(`\n  detail object summary:`)
      console.log(summarizeKeys(detailAff, '', 0, 3).join('\n'))
    } else {
      console.log(`  body: ${JSON.stringify(detailRes.body).slice(0, 400)}`)
    }

    // Sanity: also fetch the same id with explicit fields= so we can compare.
    const detailRes2 = await fetchAdmin(`/admin/affiliates/${sampleId}?fields=${AFFILIATE_FIELDS}`)
    console.log(`\n  detail (with fields=...) status: ${detailRes2.status}`)
    if (detailRes2.ok) {
      console.log(
        `  body keys: ${Object.keys(detailRes2.body as Record<string, unknown>).join(', ')}`
      )
    }
  }

  // --- 9. Other potentially relevant admin endpoints (quick existence checks) ---
  // These are best-effort: GoAffPro's API surface includes settings, custom
  // fields, tracking links, products, coupons. We only care about the ones
  // that might link back to a Square product. Each call is a single GET.
  header('9. Other admin endpoints — quick probe (first 200 chars of body)')
  const otherEndpoints = [
    '/admin/settings',
    '/admin/custom_fields',
    '/admin/customfields',
    '/admin/fields',
    '/admin/groups',
    '/admin/affiliate_groups',
    '/admin/tags',
    '/admin/products',
    '/admin/coupons',
    '/admin/tracking_links',
    '/admin/dashboard'
  ]
  const otherResults: FetchResult[] = []
  for (const ep of otherEndpoints) {
    const r = await fetchAdmin(ep)
    otherResults.push(r)
    const preview =
      r.body === null
        ? '(no body)'
        : JSON.stringify(r.body, (_k, v) =>
            typeof v === 'string' && v.length > 80 ? `${v.slice(0, 80)}…` : v
          ).slice(0, 200)
    console.log(`  ${ep.padEnd(32)} ${r.status} ${preview}`)
  }

  // --- 10. Public token header probe ---
  header('10. Public token probe — GET /affiliate (storefront-style)')
  // Public token endpoints vary; /affiliate (singular) is the typical
  // storefront call to look up the current affiliate by their cookie.
  // Without a cookie this will likely 404 / 200-empty, but it confirms the
  // header is accepted.
  const pubProbes = ['/affiliate', '/storefront/affiliate']
  for (const ep of pubProbes) {
    const r = await fetchPublic(ep)
    console.log(`  ${ep.padEnd(32)} ${r.status} ${r.error ?? ''}`)
    if (r.status > 0 && r.body) {
      console.log(`    body: ${JSON.stringify(r.body).slice(0, 200)}`)
    }
  }

  // --- 11. Snapshot to disk for archival ---
  const snapshot = {
    fetchedAt: new Date().toISOString(),
    apiBase: API_BASE,
    affiliates,
    affiliateCount: affiliates.length,
    schema: {
      keys,
      fillRates: fill
    },
    detailProbe: sampleId !== undefined ? { id: sampleId } : null,
    otherEndpoints: otherResults.map((r) => ({
      endpoint: r.endpoint,
      status: r.status,
      ok: r.ok,
      bodyPreview:
        typeof r.body === 'object' && r.body !== null
          ? Object.keys(r.body as Record<string, unknown>).slice(0, 20)
          : null
    }))
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join('/tmp', `goaffpro-snapshot-${stamp}.json`)
  await writeFile(file, JSON.stringify(snapshot, null, 2))
  header('Snapshot written')
  console.log(`  ${file}`)
  console.log(`  (NOT committed — under /tmp; contains full affiliate PII)`)
}

main().catch((err) => {
  console.error('probe failed:', err)
  process.exit(1)
})
