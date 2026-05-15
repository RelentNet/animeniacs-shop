#!/usr/bin/env tsx
/**
 * Square production-account probe — read-only.
 *
 * Mirrors scripts/goaffpro/probe.ts in spirit: hits a curated set of
 * Square API endpoints to characterize what the production account can
 * and can't do today. Used to verify that the artist-commission +
 * inbound-affiliate design is implementable on the current account
 * before we commit to a build plan.
 *
 * Specifically answers:
 *   - Account status (ACTIVE / suspended / limited?)
 *   - Locations + their capabilities (CREDIT_CARD_PROCESSING, etc.)
 *   - Whether the APIs we need (Catalog, Orders, Order Custom Attributes,
 *     Discounts, Webhooks) actually return 200 against this account
 *   - Whether the Order Custom Attributes API works (the inbound-affiliate
 *     attribution mechanism) — this is the load-bearing one
 *   - Whether any endpoint returns MERCHANT_SUBSCRIPTION_NOT_FOUND
 *     (i.e. is gated by Square Plus/Premium for this account)
 *
 * Read-only. No writes. Hits production with SQUARE_PROD_ACCESS_TOKEN.
 *
 * Usage:
 *   pnpm sq:account-probe
 *
 * Output:
 *   /tmp/square-account-probe-<UTC-timestamp>.json
 *
 * Kept in-tree as a record paired with the GoAffPro probe; not a permanent
 * tool.
 */

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config as loadDotenv } from 'dotenv'

loadDotenv({ path: '.env.local', override: false })

const TOKEN = process.env.SQUARE_PROD_ACCESS_TOKEN
if (!TOKEN) {
  console.error('SQUARE_PROD_ACCESS_TOKEN is not set in .env.local.')
  process.exit(2)
}

const API_BASE = 'https://connect.squareup.com/v2'
const SQUARE_VERSION = '2025-01-23'

interface FetchResult {
  endpoint: string
  method: string
  status: number
  ok: boolean
  body: unknown
  /** Square error category if the response is 4xx/5xx with an `errors[]` envelope. */
  errorCategory?: string
  errorCode?: string
  errorDetail?: string
  /** Network-level error if the request never reached Square. */
  networkError?: string
}

async function call(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown
): Promise<FetchResult> {
  const url = `${API_BASE}${endpoint}`
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN!}`,
        'Square-Version': SQUARE_VERSION,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    })
    const text = await res.text()
    let parsed: unknown
    try {
      parsed = text ? JSON.parse(text) : {}
    } catch {
      parsed = { _rawText: text.slice(0, 500) }
    }
    const result: FetchResult = {
      endpoint,
      method,
      status: res.status,
      ok: res.ok,
      body: parsed
    }
    // Square's standard error envelope is `{ errors: [{ category, code, detail }] }`.
    if (!res.ok && parsed && typeof parsed === 'object') {
      const errors = (parsed as { errors?: unknown }).errors
      if (Array.isArray(errors) && errors.length > 0) {
        const first = errors[0] as Record<string, unknown>
        result.errorCategory = typeof first.category === 'string' ? first.category : undefined
        result.errorCode = typeof first.code === 'string' ? first.code : undefined
        result.errorDetail = typeof first.detail === 'string' ? first.detail : undefined
      }
    }
    return result
  } catch (err) {
    return {
      endpoint,
      method,
      status: 0,
      ok: false,
      body: null,
      networkError: err instanceof Error ? err.message : String(err)
    }
  }
}

function header(text: string): void {
  console.log(`\n=== ${text} ===`)
}

/** Pretty-print a successful response body, truncated to keep stdout sane. */
function show(body: unknown, max = 2000): string {
  const s = JSON.stringify(body, null, 2)
  return s.length > max ? `${s.slice(0, max)}\n  …(truncated, full body in snapshot file)` : s
}

interface ProbeOutcome {
  endpoint: string
  result: 'ok' | 'gated' | 'error' | 'network-error'
  status: number
  detail?: string
}

function classify(r: FetchResult): ProbeOutcome {
  if (r.networkError) {
    return {
      endpoint: r.endpoint,
      result: 'network-error',
      status: 0,
      detail: r.networkError
    }
  }
  if (r.ok) {
    return { endpoint: r.endpoint, result: 'ok', status: r.status }
  }
  // The specific error category we care about most: subscription gating.
  if (r.errorCategory === 'MERCHANT_SUBSCRIPTION_ERROR') {
    return {
      endpoint: r.endpoint,
      result: 'gated',
      status: r.status,
      detail: `${r.errorCode}: ${r.errorDetail}`
    }
  }
  return {
    endpoint: r.endpoint,
    result: 'error',
    status: r.status,
    detail: `${r.errorCategory ?? '?'}/${r.errorCode ?? '?'}: ${r.errorDetail ?? ''}`
  }
}

async function main(): Promise<void> {
  console.log('Square production account probe — read-only')
  console.log(`API base: ${API_BASE}`)
  console.log(`Square-Version: ${SQUARE_VERSION}`)
  console.log(`Token: SQUARE_PROD_ACCESS_TOKEN (present)`)

  const allOutcomes: ProbeOutcome[] = []
  const allResults: Record<string, FetchResult> = {}

  // -----------------------------------------------------------------------
  // 1. Merchant + locations: who are we and what's our account state?
  // -----------------------------------------------------------------------
  header('1. /v2/merchants — account identity & status')
  const merchantsRes = await call('/merchants')
  allResults['/merchants'] = merchantsRes
  allOutcomes.push(classify(merchantsRes))
  console.log(`  status: ${merchantsRes.status} ok=${merchantsRes.ok}`)
  if (merchantsRes.ok) {
    console.log(show(merchantsRes.body, 1000))
  } else {
    console.log(`  error: ${merchantsRes.errorCategory}/${merchantsRes.errorCode}`)
    console.log(`  detail: ${merchantsRes.errorDetail}`)
  }

  header('2. /v2/locations — locations + capabilities')
  const locationsRes = await call('/locations')
  allResults['/locations'] = locationsRes
  allOutcomes.push(classify(locationsRes))
  console.log(`  status: ${locationsRes.status} ok=${locationsRes.ok}`)
  if (locationsRes.ok) {
    // Print abbreviated location info: name, country, currency, capabilities, status, type.
    const locations =
      (locationsRes.body as { locations?: Array<Record<string, unknown>> }).locations ?? []
    console.log(`  locations: ${locations.length}`)
    for (const loc of locations) {
      console.log(
        `    ${loc.id} :: ${loc.name} (${loc.country}/${loc.currency}, status=${loc.status}, type=${loc.type})`
      )
      const caps = (loc.capabilities as string[] | undefined) ?? []
      console.log(`      capabilities: [${caps.join(', ')}]`)
    }
  } else {
    console.log(`  error: ${locationsRes.errorCategory}/${locationsRes.errorCode}`)
  }

  // -----------------------------------------------------------------------
  // 2. The "load-bearing" APIs for the design we agreed on.
  //    Each one is read-only or "list with limit=1" so nothing changes.
  // -----------------------------------------------------------------------
  header('3. Catalog API — list catalog (limit=1, types=ITEM)')
  const catalogRes = await call('/catalog/list?types=ITEM&limit=1')
  allResults['/catalog/list'] = catalogRes
  allOutcomes.push(classify(catalogRes))
  console.log(`  status: ${catalogRes.status} ok=${catalogRes.ok}`)
  if (catalogRes.ok) {
    const objects = (catalogRes.body as { objects?: Array<Record<string, unknown>> }).objects ?? []
    console.log(`  returned: ${objects.length} object(s)`)
    if (objects[0]) {
      console.log(
        `  first item: id=${objects[0].id} type=${objects[0].type} version=${objects[0].version}`
      )
    }
  } else {
    console.log(
      `  error: ${catalogRes.errorCategory}/${catalogRes.errorCode}: ${catalogRes.errorDetail}`
    )
  }

  // Custom attribute definitions on CATALOG (this is where `artist` lives in
  // the design — confirms the API surface that creates and reads them works).
  header('4. Catalog custom attribute definitions — list (limit=10)')
  const cadefsRes = await call('/catalog/list?types=CUSTOM_ATTRIBUTE_DEFINITION&limit=10')
  allResults['/catalog/list?types=CUSTOM_ATTRIBUTE_DEFINITION'] = cadefsRes
  allOutcomes.push(classify(cadefsRes))
  console.log(`  status: ${cadefsRes.status} ok=${cadefsRes.ok}`)
  if (cadefsRes.ok) {
    const defs = (cadefsRes.body as { objects?: Array<Record<string, unknown>> }).objects ?? []
    console.log(`  existing definitions: ${defs.length}`)
    for (const d of defs) {
      const data = (d.custom_attribute_definition_data as Record<string, unknown>) ?? {}
      console.log(
        `    ${d.id} :: key="${data.key}" name="${data.name}" type=${data.type} allowed_object_types=${JSON.stringify(data.allowed_object_types)}`
      )
    }
  }

  // -----------------------------------------------------------------------
  // 3. Orders API — read-only search to confirm we can query orders.
  //    Use a tiny date window (last 24h) and limit=1 so we get either a
  //    real result or "no orders in window" without pulling history.
  // -----------------------------------------------------------------------
  header('5. Orders API — SearchOrders (last 24h, limit=1)')
  const now = new Date()
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const locationIds = (() => {
    const body = locationsRes.body as { locations?: Array<{ id?: string }> } | undefined
    return body?.locations?.map((l) => l.id).filter((x): x is string => !!x) ?? []
  })()
  if (locationIds.length === 0) {
    console.log('  skipping — no location IDs found in step 2')
    allOutcomes.push({
      endpoint: '/orders/search',
      result: 'error',
      status: 0,
      detail: 'no locations'
    })
  } else {
    const ordersRes = await call('/orders/search', 'POST', {
      location_ids: locationIds,
      query: {
        filter: {
          date_time_filter: {
            created_at: { start_at: dayAgo.toISOString(), end_at: now.toISOString() }
          }
        },
        sort: { sort_field: 'CREATED_AT', sort_order: 'DESC' }
      },
      limit: 1
    })
    allResults['/orders/search'] = ordersRes
    allOutcomes.push(classify(ordersRes))
    console.log(`  status: ${ordersRes.status} ok=${ordersRes.ok}`)
    if (ordersRes.ok) {
      const orders = (ordersRes.body as { orders?: Array<Record<string, unknown>> }).orders ?? []
      console.log(`  orders in last 24h: ${orders.length}`)
      if (orders[0]) {
        const o = orders[0]
        const liArr = (o.line_items as Array<Record<string, unknown>>) ?? []
        console.log(
          `  sample order: id=${o.id} state=${o.state} line_items=${liArr.length} total_money=${JSON.stringify(o.total_money)}`
        )
        // Show that a real line item has the fields the commission math needs.
        if (liArr[0]) {
          const li = liArr[0]
          console.log(
            `    sample line item: catalog_object_id=${li.catalog_object_id} gross=${JSON.stringify(li.gross_sales_money)} discount=${JSON.stringify(li.total_discount_money)} total=${JSON.stringify(li.total_money)}`
          )
        }
      } else {
        console.log(`  (no orders in the last 24h — expected for a quiet day, not an error)`)
      }
    } else {
      console.log(
        `  error: ${ordersRes.errorCategory}/${ordersRes.errorCode}: ${ordersRes.errorDetail}`
      )
    }
  }

  // -----------------------------------------------------------------------
  // 4. Order Custom Attributes API — the load-bearing one for inbound
  //    affiliate attribution. Just list any existing definitions so we
  //    confirm the API is reachable on this account (no writes).
  // -----------------------------------------------------------------------
  header('6. Order Custom Attributes API — list definitions')
  const oCustomDefsRes = await call('/orders/custom-attribute-definitions')
  allResults['/orders/custom-attribute-definitions'] = oCustomDefsRes
  allOutcomes.push(classify(oCustomDefsRes))
  console.log(`  status: ${oCustomDefsRes.status} ok=${oCustomDefsRes.ok}`)
  if (oCustomDefsRes.ok) {
    const defs =
      (oCustomDefsRes.body as { custom_attribute_definitions?: Array<Record<string, unknown>> })
        .custom_attribute_definitions ?? []
    console.log(`  existing order-level custom attribute definitions: ${defs.length}`)
    for (const d of defs) {
      console.log(
        `    key="${d.key}" visibility=${d.visibility} schema=${typeof d.schema === 'string' ? d.schema : JSON.stringify(d.schema).slice(0, 80)}`
      )
    }
  } else {
    console.log(
      `  error: ${oCustomDefsRes.errorCategory}/${oCustomDefsRes.errorCode}: ${oCustomDefsRes.errorDetail}`
    )
  }

  // -----------------------------------------------------------------------
  // 5. Discounts — already exist in production per the cleanup audit;
  //    confirm we can list them so the commission-report job can read
  //    `applied_discounts[]` on line items.
  // -----------------------------------------------------------------------
  header('7. Catalog API — list DISCOUNT objects (limit=5)')
  const discRes = await call('/catalog/list?types=DISCOUNT&limit=5')
  allResults['/catalog/list?types=DISCOUNT'] = discRes
  allOutcomes.push(classify(discRes))
  console.log(`  status: ${discRes.status} ok=${discRes.ok}`)
  if (discRes.ok) {
    const ds = (discRes.body as { objects?: Array<Record<string, unknown>> }).objects ?? []
    console.log(`  returned: ${ds.length}`)
    for (const d of ds) {
      const data = (d.discount_data as Record<string, unknown>) ?? {}
      console.log(
        `    ${d.id} :: ${data.name} type=${data.discount_type} percentage=${data.percentage} amount=${JSON.stringify(data.amount_money)}`
      )
    }
  } else {
    console.log(`  error: ${discRes.errorCategory}/${discRes.errorCode}`)
  }

  // -----------------------------------------------------------------------
  // 6. Webhooks — confirm we can see existing subscriptions so we know
  //    the webhooks plumbing is accessible. Read-only list.
  // -----------------------------------------------------------------------
  header('8. Webhook subscriptions — list')
  const webhookRes = await call('/webhooks/subscriptions')
  allResults['/webhooks/subscriptions'] = webhookRes
  allOutcomes.push(classify(webhookRes))
  console.log(`  status: ${webhookRes.status} ok=${webhookRes.ok}`)
  if (webhookRes.ok) {
    const subs =
      (webhookRes.body as { subscriptions?: Array<Record<string, unknown>> }).subscriptions ?? []
    console.log(`  existing webhook subscriptions: ${subs.length}`)
    for (const s of subs) {
      console.log(
        `    ${s.id} :: name="${s.name}" enabled=${s.enabled} url=${(s.notification_url as string | undefined)?.slice(0, 60)}…`
      )
      console.log(`      event_types: ${JSON.stringify(s.event_types)}`)
    }
  } else {
    console.log(`  error: ${webhookRes.errorCategory}/${webhookRes.errorCode}`)
  }

  // -----------------------------------------------------------------------
  // 7. Team Members API — used for `Payment.team_member_id` attribution at
  //    POS. Read-only list to confirm reachable. (We're NOT putting artists
  //    here, but the field is part of the Square data model we'll read.)
  // -----------------------------------------------------------------------
  header('9. Team members API — search (limit=1)')
  const teamRes = await call('/team-members/search', 'POST', { limit: 1 })
  allResults['/team-members/search'] = teamRes
  allOutcomes.push(classify(teamRes))
  console.log(`  status: ${teamRes.status} ok=${teamRes.ok}`)
  if (teamRes.ok) {
    const members =
      (teamRes.body as { team_members?: Array<Record<string, unknown>> }).team_members ?? []
    console.log(`  returned: ${members.length}`)
    if (members[0]) {
      const m = members[0]
      console.log(
        `  sample: id=${m.id} status=${m.status} email=${m.email_address ? '<present>' : '<absent>'}`
      )
    }
  } else {
    console.log(`  error: ${teamRes.errorCategory}/${teamRes.errorCode}: ${teamRes.errorDetail}`)
  }

  // -----------------------------------------------------------------------
  // 8. Subscriptions API (Square's "sell subscriptions TO YOUR customers"
  //    API — NOT a way to read your own Plus/Premium tier). Just confirms
  //    whether the endpoint is reachable on this account.
  // -----------------------------------------------------------------------
  header('10. Subscriptions API — SearchSubscriptions (limit=1)')
  if (locationIds.length === 0) {
    console.log('  skipping — no location IDs')
  } else {
    const subsRes = await call('/subscriptions/search', 'POST', {
      query: { filter: { location_ids: locationIds } },
      limit: 1
    })
    allResults['/subscriptions/search'] = subsRes
    allOutcomes.push(classify(subsRes))
    console.log(`  status: ${subsRes.status} ok=${subsRes.ok}`)
    if (subsRes.ok) {
      const subs =
        (subsRes.body as { subscriptions?: Array<Record<string, unknown>> }).subscriptions ?? []
      console.log(`  customer-facing subscriptions: ${subs.length}`)
    } else {
      console.log(`  error: ${subsRes.errorCategory}/${subsRes.errorCode}`)
    }
  }

  // -----------------------------------------------------------------------
  // 9. Negative check: try an Invoices API call that REQUIRES Invoices Plus.
  //    We expect MERCHANT_SUBSCRIPTION_NOT_FOUND if not subscribed. If this
  //    succeeds it tells us the account has Invoices Plus (irrelevant to our
  //    design but useful intel). Just listing existing invoices is free, so
  //    a list call won't trigger the subscription error. We're not using
  //    Invoices at all, so this is purely informational about gating.
  // -----------------------------------------------------------------------
  header('11. Invoices API — list (purely informational; we are NOT using this)')
  const invRes = await call(`/invoices?limit=1&location_id=${locationIds[0] ?? ''}`)
  allResults['/invoices'] = invRes
  allOutcomes.push(classify(invRes))
  console.log(`  status: ${invRes.status} ok=${invRes.ok}`)
  if (invRes.ok) {
    const inv = (invRes.body as { invoices?: Array<unknown> }).invoices ?? []
    console.log(`  invoices found: ${inv.length} (just a sanity check; we're not using Invoices)`)
  } else {
    console.log(`  error: ${invRes.errorCategory}/${invRes.errorCode}: ${invRes.errorDetail}`)
  }

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  header('SUMMARY')
  console.log(`Total endpoints probed: ${allOutcomes.length}`)
  const ok = allOutcomes.filter((o) => o.result === 'ok')
  const gated = allOutcomes.filter((o) => o.result === 'gated')
  const errored = allOutcomes.filter((o) => o.result === 'error')
  const network = allOutcomes.filter((o) => o.result === 'network-error')
  console.log(`  ✓ ok:           ${ok.length}`)
  console.log(`  ⛔ gated (sub):  ${gated.length}`)
  console.log(`  ✗ errored:      ${errored.length}`)
  console.log(`  💀 network err:  ${network.length}`)

  if (gated.length > 0) {
    console.log('\n  Subscription-gated endpoints (these would require Square Plus/Premium or')
    console.log('  another paid add-on for this account):')
    for (const g of gated) console.log(`    ${g.endpoint} — ${g.detail}`)
  }
  if (errored.length > 0) {
    console.log(
      '\n  Errored endpoints (non-subscription errors; could be permissions, scope, or data):'
    )
    for (const e of errored) console.log(`    ${e.endpoint} (${e.status}) — ${e.detail}`)
  }

  // What does this mean for the design? Match by endpoint *prefix* because
  // the catalog calls all include `?types=...` query strings in the recorded
  // endpoint string.
  const corePathPrefixes = [
    '/merchants',
    '/locations',
    '/catalog/list?types=ITEM',
    '/catalog/list?types=CUSTOM_ATTRIBUTE_DEFINITION',
    '/catalog/list?types=DISCOUNT',
    '/orders/search',
    '/orders/custom-attribute-definitions',
    '/webhooks/subscriptions',
    '/team-members/search'
  ]
  const matchesCore = (endpoint: string): boolean =>
    corePathPrefixes.some((p) => endpoint.startsWith(p))
  const coreOk = allOutcomes.filter((o) => matchesCore(o.endpoint) && o.result === 'ok')
  const coreBlocked = allOutcomes.filter((o) => matchesCore(o.endpoint) && o.result !== 'ok')
  console.log('\n  Design-readiness check:')
  console.log(`    core APIs working: ${coreOk.length} / ${corePathPrefixes.length}`)
  if (coreBlocked.length === 0) {
    console.log('    ✓ All APIs the design depends on are reachable on this account.')
    console.log('    No Square Plus/Premium upgrade is required to BUILD the design.')
    console.log(
      '    (Upgrades remain a separate business-economics decision about processing fees.)'
    )
  } else {
    console.log('    ⚠ Some load-bearing APIs are not reachable — see above.')
    for (const b of coreBlocked) console.log(`      - ${b.endpoint}: ${b.result} (${b.status})`)
  }

  // -----------------------------------------------------------------------
  // Snapshot — save the full payloads to a tmp file for archival / debugging.
  // -----------------------------------------------------------------------
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join('/tmp', `square-account-probe-${stamp}.json`)
  await writeFile(
    file,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        apiBase: API_BASE,
        squareVersion: SQUARE_VERSION,
        outcomes: allOutcomes,
        results: allResults
      },
      null,
      2
    )
  )
  console.log(`\nSnapshot: ${file}`)
  console.log(`(NOT committed — under /tmp; contains business-account data.)`)
}

main().catch((err) => {
  console.error('probe failed:', err)
  process.exit(1)
})
