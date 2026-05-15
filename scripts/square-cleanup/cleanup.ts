#!/usr/bin/env tsx
/**
 * Apply cleanup operations to a Square catalog.
 *
 * Phase 1 ruleset (the "easy automatic wins"):
 *   1. Delete orphan IMAGE objects (referenced by no ITEM).
 *   2. Delete IMAGE objects with no image URL (incomplete uploads).
 *   3. Delete the `Media` CUSTOM_ATTRIBUTE_DEFINITION
 *      (LitCommerce-created, unused, conflicts with the working
 *       Media ITEM_OPTION).
 *   4. Delete the `Size` CUSTOM_ATTRIBUTE_DEFINITION
 *      (same rationale as #3).
 *
 * Safety properties:
 *   - Read-from-live: every "what to delete" computation hits the live
 *     Square API. The Phase B snapshot is not authoritative for operations
 *     — it would race with anyone editing in the Square dashboard.
 *   - Dry-run by default; --apply required to commit writes.
 *   - Production guard: refuses to apply to production without a typed
 *     confirmation phrase (see PRODUCTION_CONFIRMATION_PHRASE below).
 *   - Audit log: every API call written to
 *     cleanup-audit-<timestamp>.jsonl in the repo root.
 *   - Idempotent: re-running after partial failure picks up where it left
 *     off because Square's delete endpoints return success for already-
 *     deleted IDs.
 *
 * Usage:
 *   pnpm sq:cleanup <env>                     # dry run
 *   pnpm sq:cleanup <env> --apply             # commit (sandbox only)
 *   pnpm sq:cleanup production --apply        # blocked unless --i-mean-it
 *                                             # AND --confirm "<phrase>"
 *
 * Exit codes:
 *   0  success (dry-run or apply)
 *   1  partial failure mid-apply (audit log shows where)
 *   2  bad CLI args / refused to run
 */

import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { SquareClient } from 'square'
import { type SquareEnv, buildClient, chunk, listAll, sleep } from './lib'

// Match the doc copy exactly; users have to type this verbatim.
const PRODUCTION_CONFIRMATION_PHRASE = 'YES I MEAN IT'

interface PlannedOp {
  /** Stable label for the operation, e.g. 'delete-orphan-image'. */
  kind: string
  /** Square object ID. */
  objectId: string
  /** Object type for context (IMAGE, CUSTOM_ATTRIBUTE_DEFINITION). */
  objectType: string
  /** Human-readable reason for inclusion. */
  reason: string
  /** Extra fields useful for the dry-run report. */
  details?: Record<string, string | number | undefined>
}

interface AuditEntry {
  ts: string
  env: SquareEnv
  applied: boolean
  op: PlannedOp
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
      `pnpm sq:cleanup error: ${why}`,
      '',
      'Usage:',
      '  pnpm sq:cleanup <sandbox|production>                    (dry run)',
      '  pnpm sq:cleanup sandbox --apply                         (commit; sandbox)',
      '  pnpm sq:cleanup production --apply --i-mean-it --confirm "YES I MEAN IT"'
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
        'This is a destructive operation. Add --i-mean-it to acknowledge.',
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

// ---------- Planners ----------

async function planOrphanImageDeletes(client: SquareClient): Promise<PlannedOp[]> {
  // Gather every IMAGE id, then every ITEM's referenced image ids, and any
  // referenced from nested variations. Anything in IMAGE \ referenced = orphan.
  // Also any IMAGE with no URL at all gets included (incomplete upload).

  const images = await listAll(client, 'IMAGE')
  const items = await listAll(client, 'ITEM')

  const referenced = new Set<string>()
  for (const item of items) {
    const itemImageIds: string[] = item.itemData?.imageIds ?? []
    for (const id of itemImageIds) referenced.add(id)
    const variations: any[] = item.itemData?.variations ?? []
    for (const v of variations) {
      const varImageIds: string[] = v.itemVariationData?.imageIds ?? []
      for (const id of varImageIds) referenced.add(id)
    }
  }

  const ops: PlannedOp[] = []
  for (const img of images) {
    const url: string | undefined = img.imageData?.url
    const isOrphan = !referenced.has(img.id)
    const hasUrl = typeof url === 'string' && url.length > 0

    if (!hasUrl) {
      ops.push({
        kind: 'delete-image-without-url',
        objectId: img.id,
        objectType: 'IMAGE',
        reason: 'IMAGE has no url (incomplete upload)',
        details: {
          name: img.imageData?.name,
          caption: img.imageData?.caption,
          orphan: isOrphan ? 'yes' : 'no'
        }
      })
      continue
    }

    if (isOrphan) {
      ops.push({
        kind: 'delete-orphan-image',
        objectId: img.id,
        objectType: 'IMAGE',
        reason: 'IMAGE not referenced by any ITEM or ITEM_VARIATION',
        details: {
          name: img.imageData?.name,
          urlPreview: url.length > 60 ? `${url.slice(0, 60)}...` : url
        }
      })
    }
  }

  return ops
}

async function planCustomAttrDefinitionDeletes(client: SquareClient): Promise<PlannedOp[]> {
  // Target the two LitCommerce-created definitions that conflict with the
  // working ITEM_OPTIONs of the same name. The 3 Square-system definitions
  // (is_alcoholic, ecom_*) are NEVER deleted by this script.

  const TARGET_KEYS = new Set(['Media', 'Size'])
  const SYSTEM_KEYS = new Set([
    'is_alcoholic',
    'ecom_target_classic_site_id',
    'ecom_gifting_enabled'
  ])

  const defs = await listAll(client, 'CUSTOM_ATTRIBUTE_DEFINITION')
  const ops: PlannedOp[] = []

  for (const def of defs) {
    const data = def.customAttributeDefinitionData
    const key = data?.key
    if (!key) continue
    if (SYSTEM_KEYS.has(key)) continue // never touch Square-system defs
    if (!TARGET_KEYS.has(key)) continue // narrow to our explicit targets

    ops.push({
      kind: 'delete-custom-attribute-definition',
      objectId: def.id,
      objectType: 'CUSTOM_ATTRIBUTE_DEFINITION',
      reason:
        'LitCommerce-created definition that duplicates an existing ITEM_OPTION of the same name; zero items reference it',
      details: {
        key,
        name: data.name,
        allowedTypes: (data.allowedObjectTypes ?? []).join(', ')
      }
    })
  }

  return ops
}

// ---------- Executor ----------

async function executeOps(
  client: SquareClient,
  ops: PlannedOp[],
  env: SquareEnv,
  auditPath: string
): Promise<{ ok: number; failed: number }> {
  // Group by kind so we can batch IMAGE deletes (200/call) while doing
  // single deletes for CUSTOM_ATTRIBUTE_DEFINITION (one at a time).
  const imageOps = ops.filter((o) => o.objectType === 'IMAGE')
  const defOps = ops.filter((o) => o.objectType === 'CUSTOM_ATTRIBUTE_DEFINITION')

  let ok = 0
  let failed = 0

  // ---- IMAGE batch deletes ----
  if (imageOps.length > 0) {
    const batches = chunk(imageOps, 200)
    console.log(
      `\nDeleting ${imageOps.length} IMAGE(s) in ${batches.length} batch(es) of up to 200...`
    )

    for (let i = 0; i < batches.length; i++) {
      const batchOps = batches[i]
      const ids = batchOps.map((o) => o.objectId)
      process.stdout.write(`  batch ${i + 1}/${batches.length} (${ids.length} ids)... `)

      try {
        await client.catalog.batchDelete({ objectIds: ids })
        console.log('done')
        for (const op of batchOps) {
          await writeAudit(auditPath, {
            ts: new Date().toISOString(),
            env,
            applied: true,
            op,
            result: 'ok'
          })
          ok += 1
        }
      } catch (err) {
        const e = err as { message?: string; body?: unknown; errors?: unknown }
        console.log(`FAILED — ${e.message ?? 'unknown error'}`)
        for (const op of batchOps) {
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
      }

      if (i < batches.length - 1) await sleep(250) // gentle rate-limit pacing
    }
  }

  // ---- CUSTOM_ATTRIBUTE_DEFINITION single deletes ----
  if (defOps.length > 0) {
    console.log(`\nDeleting ${defOps.length} CUSTOM_ATTRIBUTE_DEFINITION(s)...`)
    for (const op of defOps) {
      process.stdout.write(`  ${op.details?.key} (${op.objectId.slice(0, 12)}...)... `)
      try {
        await client.catalog.object.delete({ objectId: op.objectId })
        console.log('done')
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
      await sleep(150)
    }
  }

  return { ok, failed }
}

async function writeAudit(auditPath: string, entry: AuditEntry): Promise<void> {
  await appendFile(auditPath, `${JSON.stringify(entry)}\n`)
}

// ---------- Dry-run reporter ----------

function reportDryRun(ops: PlannedOp[], env: SquareEnv): void {
  console.log(`\n=== Dry-run plan (${env}) ===\n`)

  const byKind = new Map<string, PlannedOp[]>()
  for (const op of ops) {
    const list = byKind.get(op.kind) ?? []
    list.push(op)
    byKind.set(op.kind, list)
  }

  let total = 0
  for (const [kind, list] of byKind) {
    console.log(`  ${kind.padEnd(38)} ${list.length} op(s)`)
    total += list.length
  }
  console.log(`  ${'TOTAL'.padEnd(38)} ${total} op(s)`)

  if (ops.length === 0) {
    console.log('\nNothing to do. Catalog is already clean.')
    return
  }

  // Show first 10 of each kind for context.
  for (const [kind, list] of byKind) {
    console.log(`\n--- ${kind} (${list.length} op(s)) ---`)
    const preview = list.slice(0, 10)
    for (const op of preview) {
      const detailStr = op.details
        ? Object.entries(op.details)
            .filter(([_, v]) => v !== undefined)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')
        : ''
      console.log(`  ${op.objectId.padEnd(28)} ${detailStr}`)
    }
    if (list.length > 10) console.log(`  ... and ${list.length - 10} more`)
  }

  console.log('\nRe-run with --apply to commit. Catalog is unchanged so far.')
}

// ---------- Main ----------

async function main(): Promise<void> {
  const opts = parseCli()
  guardProduction(opts)

  console.log(`Square cleanup — env=${opts.env} mode=${opts.apply ? 'APPLY' : 'dry-run'}`)

  const client = buildClient(opts.env)

  console.log('\nPlanning operations from live catalog state...')
  const imageOps = await planOrphanImageDeletes(client)
  const defOps = await planCustomAttrDefinitionDeletes(client)
  const ops = [...imageOps, ...defOps]

  reportDryRun(ops, opts.env)

  if (!opts.apply) {
    return
  }

  // Prep audit log.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const auditDir = path.resolve('cleanup-audit')
  await mkdir(auditDir, { recursive: true })
  const auditPath = path.join(auditDir, `cleanup-${opts.env}-${stamp}.jsonl`)
  console.log(`\nAudit log: ${auditPath}`)

  if (ops.length === 0) {
    console.log('Nothing to apply. Exiting.')
    return
  }

  const { ok, failed } = await executeOps(client, ops, opts.env, auditPath)

  console.log(`\n=== Apply complete (${opts.env}) ===`)
  console.log(`  ok:     ${ok}`)
  console.log(`  failed: ${failed}`)
  console.log(`  total:  ${ops.length}`)
  console.log(`  audit:  ${auditPath}`)

  if (failed > 0) {
    console.log('\nSome operations failed. See audit log for details.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('\ncleanup failed:', err)
  process.exit(1)
})
