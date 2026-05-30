#!/usr/bin/env tsx
/**
 * Un-archive the graveyard-SKU items that were archived by
 * `pnpm sq:archive-graveyard` on 2026-05-21.
 *
 * Context (2026-05-26):
 * The original archive operation was technically correct — every item
 * matched the Pattern 1 placeholder signature (no images, no description,
 * no categories, name = "<Artist> <Acrylic|Print>"). But intent-wise it
 * was wrong: those items are the per-artist in-person sales SKUs used
 * to ring up custom art at conventions that doesn't have its own listing.
 * They were never meant to be archived. This script restores them.
 *
 * Restoration mechanics:
 *   - Reads the per-environment archive audit log to get the list of
 *     object IDs that were archived. Same format the archive script
 *     wrote (cleanup-audit/archive-graveyard-<env>-<stamp>.jsonl).
 *   - For each id, fetches the current object from Square to get a
 *     fresh `version` (required for optimistic concurrency on upsert)
 *     and the current `itemData` (so we don't accidentally erase any
 *     fields by sending a thin payload).
 *   - Skips ids that are already un-archived (no-op).
 *   - Calls UpsertCatalogObject with `item_data.is_archived = false`.
 *
 * Safety properties (mirror of the archive script):
 *   - Dry-run by default; --apply required to commit writes.
 *   - Production guard: refuses to apply to production without
 *     --i-mean-it and the typed confirmation phrase.
 *   - Audit log: every API call written to
 *     cleanup-audit/unarchive-graveyard-<env>-<stamp>.jsonl
 *   - Idempotent: un-archiving an already-active item is a no-op.
 *   - Source log argument lets you point at the EXACT audit log to
 *     reverse, so we never accidentally reverse the wrong run.
 *
 * Usage:
 *   pnpm sq:unarchive-graveyard sandbox \
 *     --from cleanup-audit/archive-graveyard-sandbox-2026-05-21T22-04-55-669Z.jsonl
 *   # ↑ dry-run; shows what WOULD be un-archived
 *
 *   pnpm sq:unarchive-graveyard sandbox \
 *     --from cleanup-audit/archive-graveyard-sandbox-2026-05-21T22-04-55-669Z.jsonl \
 *     --apply
 *   # ↑ sandbox apply
 *
 *   pnpm sq:unarchive-graveyard production \
 *     --from cleanup-audit/archive-graveyard-production-2026-05-21T22-05-36-819Z.jsonl \
 *     --apply --i-mean-it --confirm "YES I MEAN IT"
 *   # ↑ production apply
 *
 * Exit codes:
 *   0  success (dry-run or apply with all ok)
 *   1  partial failure mid-apply (audit log shows where)
 *   2  bad CLI args / refused to run / source log missing
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { SquareClient } from 'square'
import { type CatalogObject, type SquareEnv, buildClient, sleep } from './lib'

const PRODUCTION_CONFIRMATION_PHRASE = 'YES I MEAN IT'

interface PlannedUnarchive {
  objectId: string
  /** Name captured from the archive audit log (for human-readable
   *  display only — the actual unarchive uses the LIVE itemData). */
  archivedAsName: string
  /** Name on the LIVE item at unarchive time. May differ if someone
   *  has edited the item in the dashboard since archive. */
  currentName: string
}

interface AuditEntry {
  ts: string
  env: SquareEnv
  applied: boolean
  op: PlannedUnarchive
  result: 'ok' | 'skipped' | 'error'
  reason?: string
  errorMessage?: string
  errorBody?: unknown
}

// ---------- CLI parsing ----------

interface CliOpts {
  env: SquareEnv
  apply: boolean
  productionConfirmation: string | undefined
  iMeanIt: boolean
  fromPath: string
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

  const fromIdx = args.indexOf('--from')
  if (fromIdx < 0 || fromIdx + 1 >= args.length) {
    usage('missing --from <archive-audit-log>')
  }
  const fromPath = args[fromIdx + 1]

  return { env: envArg as SquareEnv, apply, productionConfirmation, iMeanIt, fromPath }
}

function usage(why: string): never {
  console.error(
    [
      `pnpm sq:unarchive-graveyard error: ${why}`,
      '',
      'Usage:',
      '  pnpm sq:unarchive-graveyard <sandbox|production> --from <log.jsonl>             (dry run)',
      '  pnpm sq:unarchive-graveyard sandbox --from <log.jsonl> --apply                   (commit; sandbox)',
      '  pnpm sq:unarchive-graveyard production --from <log.jsonl> --apply --i-mean-it --confirm "YES I MEAN IT"',
      '',
      'The --from log must be a `cleanup-audit/archive-graveyard-<env>-*.jsonl` file.',
      'Object IDs are read from `op.objectId` of each line where result === "ok".'
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
        'This un-archives items in your live catalog. Add --i-mean-it to acknowledge.',
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

// ---------- Source-log parser ----------

interface SourceLine {
  ts?: string
  env?: SquareEnv
  applied?: boolean
  result?: string
  op?: { objectId?: string; name?: string }
}

/**
 * Read the original archive audit log and extract every (objectId, name)
 * for which the archive `result === 'ok'`. Lines with other results
 * (`error`, etc.) are skipped — those items were never archived.
 *
 * Throws if the log's `env` doesn't match the env we're about to write
 * to (cross-env reverses are almost certainly a mistake).
 */
async function readSourceLog(
  fromPath: string,
  expectedEnv: SquareEnv
): Promise<Array<{ objectId: string; archivedAsName: string }>> {
  let raw: string
  try {
    raw = await readFile(fromPath, 'utf8')
  } catch (err) {
    console.error(`\nCould not read --from log: ${fromPath}\n${(err as Error).message}`)
    process.exit(2)
  }

  const lines = raw.split('\n').filter((l) => l.trim().length > 0)
  const targets: Array<{ objectId: string; archivedAsName: string }> = []

  for (const line of lines) {
    let parsed: SourceLine
    try {
      parsed = JSON.parse(line) as SourceLine
    } catch {
      console.error(`Skipping unparseable line: ${line.slice(0, 80)}`)
      continue
    }

    if (parsed.env && parsed.env !== expectedEnv) {
      console.error(
        `\nRefusing to reverse a log from env "${parsed.env}" while running for "${expectedEnv}".`
      )
      console.error('If this is intentional, use the matching env or split the log.')
      process.exit(2)
    }

    if (parsed.result !== 'ok') continue

    const objectId = parsed.op?.objectId
    const name = parsed.op?.name ?? '(unnamed)'
    if (typeof objectId === 'string' && objectId.length > 0) {
      targets.push({ objectId, archivedAsName: name })
    }
  }

  return targets
}

// ---------- Live item fetcher ----------

/**
 * Square's BatchRetrieveCatalogObjects accepts up to 1000 ids per call;
 * we chunk at 100 to be friendly. Returns a map id → CatalogObject. Items
 * that no longer exist (deleted from Square) are simply absent from the
 * map; the caller flags those as skipped.
 */
async function fetchItemsByIds(
  client: SquareClient,
  ids: string[]
): Promise<Map<string, CatalogObject>> {
  const out = new Map<string, CatalogObject>()
  if (ids.length === 0) return out

  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))

  for (const chunk of chunks) {
    const resp = (await client.catalog.batchGet({
      objectIds: chunk,
      includeRelatedObjects: false
    })) as { objects?: CatalogObject[] }
    const objects = resp.objects ?? []
    for (const obj of objects) {
      if (obj && typeof obj.id === 'string') {
        out.set(obj.id, obj as CatalogObject)
      }
    }
    await sleep(100)
  }

  return out
}

// ---------- Executor ----------

async function executeOps(
  client: SquareClient,
  ops: PlannedUnarchive[],
  itemsById: Map<string, CatalogObject>,
  env: SquareEnv,
  auditPath: string
): Promise<{ ok: number; skipped: number; failed: number }> {
  let ok = 0
  let skipped = 0
  let failed = 0

  console.log(`\nUn-archiving ${ops.length} ITEM(s)...`)
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    const item = itemsById.get(op.objectId)
    process.stdout.write(`  [${i + 1}/${ops.length}] ${op.archivedAsName.padEnd(34)} `)

    if (!item) {
      console.log('SKIP — item not found (may have been deleted)')
      await writeAudit(auditPath, {
        ts: new Date().toISOString(),
        env,
        applied: true,
        op,
        result: 'skipped',
        reason: 'item not found in live catalog'
      })
      skipped += 1
      continue
    }

    if (item.itemData?.isArchived !== true) {
      console.log('SKIP — already active')
      await writeAudit(auditPath, {
        ts: new Date().toISOString(),
        env,
        applied: true,
        op,
        result: 'skipped',
        reason: 'item is already not archived'
      })
      skipped += 1
      continue
    }

    // Build the un-archive payload. Preserve the existing itemData
    // fully (so we don't accidentally erase any fields Square would
    // interpret as deletions) and flip isArchived to false.
    const upsertObject: Record<string, unknown> = {
      type: 'ITEM',
      id: item.id,
      version: item.version,
      itemData: {
        ...item.itemData,
        isArchived: false
      }
    }

    try {
      await client.catalog.object.upsert({
        idempotencyKey: `unarchive-graveyard-${item.id}-${Date.now()}`,
        object: upsertObject as never
      })
      console.log('restored')
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

    if (i < ops.length - 1) await sleep(150)
  }

  return { ok, skipped, failed }
}

async function writeAudit(auditPath: string, entry: AuditEntry): Promise<void> {
  await appendFile(auditPath, `${JSON.stringify(entry)}\n`)
}

// ---------- Dry-run reporter ----------

function reportDryRun(ops: PlannedUnarchive[], env: SquareEnv): void {
  console.log(`\n=== Dry-run plan (${env}) ===\n`)
  console.log(`Total items to un-archive: ${ops.length}`)

  if (ops.length === 0) {
    console.log('\nNothing to do. No object IDs found in source log.')
    return
  }

  console.log('')
  console.log(`  ${'ID'.padEnd(28)} ${'ARCHIVED AS'.padEnd(34)} CURRENT NAME`)
  for (const op of ops) {
    console.log(`  ${op.objectId.padEnd(28)} ${op.archivedAsName.padEnd(34)} ${op.currentName}`)
  }

  console.log('\nRe-run with --apply to un-archive. Catalog is unchanged so far.')
}

// ---------- Main ----------

async function main(): Promise<void> {
  const opts = parseCli()
  guardProduction(opts)

  console.log(
    `Square unarchive-graveyard — env=${opts.env} mode=${opts.apply ? 'APPLY' : 'dry-run'}`
  )
  console.log(`Source log: ${opts.fromPath}`)

  // Resolve --from to absolute path so the env-mismatch error message
  // shows something meaningful.
  const fromAbs = path.resolve(opts.fromPath)
  const targets = await readSourceLog(fromAbs, opts.env)
  console.log(`\n  ${targets.length} object IDs in source log (where result === ok)`)

  if (targets.length === 0) {
    console.log('Nothing to do.')
    return
  }

  console.log('\nFetching live catalog state for those IDs...')
  const client = buildClient(opts.env)
  const itemsById = await fetchItemsByIds(
    client,
    targets.map((t) => t.objectId)
  )
  console.log(`  ${itemsById.size} of ${targets.length} found in live catalog`)

  const ops: PlannedUnarchive[] = targets.map((t) => ({
    objectId: t.objectId,
    archivedAsName: t.archivedAsName,
    currentName: itemsById.get(t.objectId)?.itemData?.name ?? '(not found)'
  }))

  reportDryRun(ops, opts.env)

  if (!opts.apply) return

  // Prep audit log.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const auditDir = path.resolve('cleanup-audit')
  await mkdir(auditDir, { recursive: true })
  const auditPath = path.join(auditDir, `unarchive-graveyard-${opts.env}-${stamp}.jsonl`)
  console.log(`\nAudit log: ${auditPath}`)

  const { ok, skipped, failed } = await executeOps(client, ops, itemsById, opts.env, auditPath)

  console.log(`\n=== Apply complete (${opts.env}) ===`)
  console.log(`  ok:      ${ok}`)
  console.log(`  skipped: ${skipped}`)
  console.log(`  failed:  ${failed}`)
  console.log(`  total:   ${ops.length}`)
  console.log(`  audit:   ${auditPath}`)

  if (failed > 0) {
    console.log('\nSome un-archives failed. See audit log for details.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('\nunarchive-graveyard failed:', err)
  process.exit(1)
})
