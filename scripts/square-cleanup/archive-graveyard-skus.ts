#!/usr/bin/env tsx
/**
 * Archive the 30 graveyard-SKU placeholder items left over from the
 * Phase B production catalog audit (Pattern 1).
 *
 * Graveyard SKUs are artist-named placeholder items:
 *   - generic names like "Bxnny.Arts Acrylic", "Saru Print",
 *     "MercDaArtist Prints", "Doodlebob Acrylic", etc.
 *   - zero images
 *   - zero description (descriptionPlaintext.length === 0)
 *   - zero categories assigned
 *   - typically a single placeholder variation
 *
 * Once real items carry the appropriate Artist > X sub-category
 * (Plan C.3), these placeholders are redundant. This script archives
 * them via `item_data.is_archived = true` (UpsertCatalogObject) —
 * the operation is idempotent (re-archiving an archived item is a
 * no-op) and reversible (un-archive via the Square dashboard).
 *
 * Safety properties:
 *   - Read-from-live: the "what to archive" list is recomputed from
 *     the live Square API on every run. Snapshots are not consulted
 *     at runtime — they would race with anyone editing in the
 *     dashboard.
 *   - Dry-run by default; --apply required to commit writes.
 *   - Production guard: refuses to apply to production without
 *     --i-mean-it and the typed confirmation phrase.
 *   - Audit log: every API call written to
 *     cleanup-audit/archive-graveyard-<env>-<stamp>.jsonl
 *   - Idempotent: archiving an already-archived item returns success.
 *
 * Usage:
 *   pnpm sq:archive-graveyard <env>                       (dry run)
 *   pnpm sq:archive-graveyard sandbox --apply             (commit; sandbox)
 *   pnpm sq:archive-graveyard production --apply --i-mean-it --confirm "YES I MEAN IT"
 *
 * Exit codes:
 *   0  success (dry-run or apply with all ok)
 *   1  partial failure mid-apply (audit log shows where)
 *   2  bad CLI args / refused to run
 */

import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { SquareClient } from 'square'
import { type CatalogObject, type SquareEnv, buildClient, listAll, sleep } from './lib'

const PRODUCTION_CONFIRMATION_PHRASE = 'YES I MEAN IT'

interface PlannedArchive {
  objectId: string
  name: string
  reason: string
  signals: {
    imgCount: number
    descLen: number
    catCount: number
    variationCount: number
    nameMatchesPattern: boolean
  }
}

interface AuditEntry {
  ts: string
  env: SquareEnv
  applied: boolean
  op: PlannedArchive
  result: 'ok' | 'error'
  errorMessage?: string
  errorBody?: unknown
}

// ---------- CLI parsing ----------

interface CliOpts {
  env: SquareEnv
  apply: boolean
  productionConfirmation: string | undefined
  iMeanIt: boolean
}

function parseCli(): CliOpts {
  const args = process.argv.slice(2)
  if (args.length < 1) usage('missing <env>')

  const envArg = args[0]
  if (envArg !== 'sandbox' && envArg !== 'production') {
    usage(`invalid env: ${envArg}`)
  }

  const apply = args.includes('--apply')
  const iMeanIt = args.includes('--i-mean-it')

  const confirmIdx = args.indexOf('--confirm')
  const productionConfirmation =
    confirmIdx >= 0 && confirmIdx + 1 < args.length ? args[confirmIdx + 1] : undefined

  return { env: envArg as SquareEnv, apply, productionConfirmation, iMeanIt }
}

function usage(why: string): never {
  console.error(
    [
      `pnpm sq:archive-graveyard error: ${why}`,
      '',
      'Usage:',
      '  pnpm sq:archive-graveyard <sandbox|production>                          (dry run)',
      '  pnpm sq:archive-graveyard sandbox --apply                               (commit; sandbox)',
      '  pnpm sq:archive-graveyard production --apply --i-mean-it --confirm "YES I MEAN IT"'
    ].join('\n')
  )
  process.exit(2)
}

function guardProduction(opts: CliOpts): void {
  if (opts.env !== 'production' || !opts.apply) return
  if (!opts.iMeanIt) {
    console.error(
      [
        '',
        'Refusing to apply against PRODUCTION without --i-mean-it flag.',
        'This archives items in your live catalog. Add --i-mean-it to acknowledge.',
        ''
      ].join('\n')
    )
    process.exit(2)
  }
  if (opts.productionConfirmation !== PRODUCTION_CONFIRMATION_PHRASE) {
    console.error(
      [
        '',
        'Refusing to apply against PRODUCTION without confirmation phrase.',
        `Re-run with: --confirm "${PRODUCTION_CONFIRMATION_PHRASE}"`,
        ''
      ].join('\n')
    )
    process.exit(2)
  }
}

// ---------- Planner ----------

/**
 * Loose pattern: the name is "<ArtistName> <ProductType>" — where the
 * ProductType is one of "Print", "Prints", "Acrylic", "Acrylics".
 * Examples: "Bxnny.Arts print", "Saru Acrylic", "MercDaArtist Prints",
 * "OpalisArt Print", "Ani Acrylics ", "MemoryShop Acrylic ".
 *
 * Trailing spaces in some real-world names are tolerated.
 */
const GRAVEYARD_NAME_PATTERN = /\b(Prints?|Acrylics?)\s*$/i

/**
 * An item qualifies as a "graveyard SKU" if ALL of:
 *   - has zero images
 *   - has zero categories
 *   - has empty plaintext description
 *   - name matches the artist-name + product-type pattern
 *   - is not already archived
 *
 * The first three are the audit's Pattern 1 signature (placeholders
 * never fleshed out). The name pattern guards against a false positive
 * where a real item is temporarily un-categorized.
 */
function planArchives(items: CatalogObject[]): PlannedArchive[] {
  const ops: PlannedArchive[] = []

  for (const item of items) {
    if (item.itemData?.isArchived === true) continue

    const name: string = item.itemData?.name ?? ''
    const imgIds: string[] = item.itemData?.imageIds ?? []
    const cats: Array<{ id: string }> = item.itemData?.categories ?? []
    const desc: string = item.itemData?.descriptionPlaintext ?? item.itemData?.description ?? ''
    const variations: unknown[] = item.itemData?.variations ?? []

    const signals = {
      imgCount: imgIds.length,
      descLen: desc.trim().length,
      catCount: cats.length,
      variationCount: variations.length,
      nameMatchesPattern: GRAVEYARD_NAME_PATTERN.test(name.trim())
    }

    const isCandidate =
      signals.imgCount === 0 &&
      signals.descLen === 0 &&
      signals.catCount === 0 &&
      signals.nameMatchesPattern

    if (!isCandidate) continue

    ops.push({
      objectId: item.id,
      name,
      reason:
        'Pattern 1 placeholder: no images, no categories, no description, artist-name + product-type pattern',
      signals
    })
  }

  return ops
}

// ---------- Executor ----------

async function executeOps(
  client: SquareClient,
  ops: PlannedArchive[],
  // Fresh copy of each item we'll archive, indexed by id. We need the
  // current `version` field for UpsertCatalogObject's optimistic
  // concurrency check.
  itemsById: Map<string, CatalogObject>,
  env: SquareEnv,
  auditPath: string
): Promise<{ ok: number; failed: number }> {
  let ok = 0
  let failed = 0

  console.log(`\nArchiving ${ops.length} ITEM(s)...`)
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    const item = itemsById.get(op.objectId)
    process.stdout.write(`  [${i + 1}/${ops.length}] ${op.name.padEnd(34)} `)

    if (!item) {
      console.log('SKIP — item disappeared between plan and apply')
      await writeAudit(auditPath, {
        ts: new Date().toISOString(),
        env,
        applied: true,
        op,
        result: 'error',
        errorMessage: 'item disappeared between plan and apply'
      })
      failed += 1
      continue
    }

    // Build a minimal upsert payload: include the original itemData so
    // Square doesn't interpret missing fields as deletions, and flip
    // is_archived to true. `version` is required for optimistic
    // concurrency on existing items.
    const upsertObject: Record<string, unknown> = {
      type: 'ITEM',
      id: item.id,
      version: item.version,
      itemData: {
        ...item.itemData,
        isArchived: true
      }
    }

    try {
      await client.catalog.object.upsert({
        idempotencyKey: `archive-graveyard-${item.id}-${Date.now()}`,
        object: upsertObject as never
      })
      console.log('archived')
      await writeAudit(auditPath, {
        ts: new Date().toISOString(),
        env,
        applied: true,
        op,
        result: 'ok'
      })
      ok += 1
    } catch (err) {
      const e = err as { message?: string; body?: unknown; errors?: unknown }
      console.log(`FAILED — ${e.message ?? 'unknown error'}`)
      await writeAudit(auditPath, {
        ts: new Date().toISOString(),
        env,
        applied: true,
        op,
        result: 'error',
        errorMessage: e.message,
        errorBody: e.errors ?? e.body
      })
      failed += 1
    }

    // Gentle rate-limit pacing.
    if (i < ops.length - 1) await sleep(150)
  }

  return { ok, failed }
}

async function writeAudit(auditPath: string, entry: AuditEntry): Promise<void> {
  await appendFile(auditPath, `${JSON.stringify(entry)}\n`)
}

// ---------- Dry-run reporter ----------

function reportDryRun(ops: PlannedArchive[], env: SquareEnv): void {
  console.log(`\n=== Dry-run plan (${env}) ===\n`)
  console.log(`Total items to archive: ${ops.length}`)

  if (ops.length === 0) {
    console.log('\nNothing to do. No graveyard SKUs detected in the live catalog.')
    return
  }

  console.log('')
  console.log(`  ${'ID'.padEnd(28)} ${'NAME'.padEnd(34)} signals`)
  for (const op of ops) {
    const s = op.signals
    const sig = `imgs=${s.imgCount} cats=${s.catCount} desc=${s.descLen} vars=${s.variationCount}`
    console.log(`  ${op.objectId.padEnd(28)} ${op.name.padEnd(34)} ${sig}`)
  }

  console.log('\nRe-run with --apply to archive. Catalog is unchanged so far.')
}

// ---------- Main ----------

async function main(): Promise<void> {
  const opts = parseCli()
  guardProduction(opts)

  console.log(`Square archive-graveyard — env=${opts.env} mode=${opts.apply ? 'APPLY' : 'dry-run'}`)

  const client = buildClient(opts.env)

  console.log('\nFetching live ITEM list...')
  const items = await listAll(client, 'ITEM')
  console.log(`  ${items.length} ITEMs (including archived)`)

  const ops = planArchives(items)
  reportDryRun(ops, opts.env)

  if (!opts.apply) {
    return
  }

  if (ops.length === 0) {
    console.log('Nothing to apply. Exiting.')
    return
  }

  // Prep audit log.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const auditDir = path.resolve('cleanup-audit')
  await mkdir(auditDir, { recursive: true })
  const auditPath = path.join(auditDir, `archive-graveyard-${opts.env}-${stamp}.jsonl`)
  console.log(`\nAudit log: ${auditPath}`)

  // Index items by id so the executor can read `version` per item.
  const itemsById = new Map<string, CatalogObject>()
  for (const it of items) itemsById.set(it.id, it)

  const { ok, failed } = await executeOps(client, ops, itemsById, opts.env, auditPath)

  console.log(`\n=== Apply complete (${opts.env}) ===`)
  console.log(`  ok:     ${ok}`)
  console.log(`  failed: ${failed}`)
  console.log(`  total:  ${ops.length}`)
  console.log(`  audit:  ${auditPath}`)

  if (failed > 0) {
    console.log('\nSome archives failed. See audit log for details.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('\narchive-graveyard failed:', err)
  process.exit(1)
})
