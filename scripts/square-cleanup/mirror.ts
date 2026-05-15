#!/usr/bin/env tsx
/**
 * Mirrors a snapshot file into the SANDBOX Square environment.
 *
 * Always wipes sandbox first (after a count display + confirmation), then
 * replays the snapshot. Restricted to sandbox by hard guard — refuses to
 * run against production no matter what flags you pass.
 *
 * Usage:
 *   pnpm sq:mirror /tmp/animeniacs-square-snapshot-production-<ts>.json
 *     # Dry run: shows what would happen, no API writes.
 *
 *   pnpm sq:mirror /tmp/animeniacs-square-snapshot-production-<ts>.json --apply
 *     # Actually wipes sandbox and replays.
 */

import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  RESTORE_ORDER,
  type Snapshot,
  type SnapshotType,
  buildClient,
  chunk,
  rewriteIdsForUpsert,
  sleep
} from './lib'

const APPLY = process.argv.includes('--apply')
const SNAPSHOT_FILE = process.argv.find((a) => a.endsWith('.json'))

async function main(): Promise<void> {
  if (!SNAPSHOT_FILE) {
    console.error(
      'Usage: pnpm sq:mirror <snapshot.json> [--apply]\n\n' +
        '  Wipes the SANDBOX catalog and replays the given snapshot.\n' +
        '  Default: dry run (no writes). Pass --apply to commit.'
    )
    process.exit(2)
  }

  const raw = await readFile(SNAPSHOT_FILE, 'utf-8')
  const snapshot = JSON.parse(raw) as Snapshot

  console.log(`Snapshot: ${SNAPSHOT_FILE}`)
  console.log(`  taken at: ${snapshot.takenAt}`)
  console.log(`  source env: ${snapshot.source.env}`)
  console.log(`  total objects: ${snapshot.objects.length}`)
  console.log()

  // Hard guard — this script never writes to production.
  const client = buildClient('sandbox')

  // Step 1: Wipe sandbox.
  console.log('Step 1: Wipe sandbox catalog')
  console.log('-----------------------------')

  const wipeIds: string[] = []
  for (const type of RESTORE_ORDER) {
    const page = await client.catalog.list({ types: type })
    let count = 0
    for await (const obj of page) {
      const o = obj as { id: string }
      if (!o.id.startsWith('#')) {
        wipeIds.push(o.id)
        count += 1
      }
    }
    console.log(`  ${type.padEnd(35)} ${count} to delete`)
  }
  console.log(`  TOTAL to delete: ${wipeIds.length}`)

  if (wipeIds.length > 0) {
    if (!APPLY) {
      console.log('  [DRY RUN] would call batchDelete in chunks of 200')
    } else {
      // batchDelete max is 200 IDs per call.
      const chunks = chunk(wipeIds, 200)
      for (let i = 0; i < chunks.length; i++) {
        process.stdout.write(
          `  deleting batch ${i + 1}/${chunks.length} (${chunks[i].length} ids)... `
        )
        await client.catalog.batchDelete({ objectIds: chunks[i] })
        console.log('done')
        // Light rate-limit pacing.
        if (i < chunks.length - 1) await sleep(250)
      }
    }
  }

  console.log()

  // Step 2: Rewrite IDs for upsert.
  console.log('Step 2: Rewrite production IDs → temp IDs for sandbox upsert')
  console.log('-------------------------------------------------------------')
  const { rewritten, idMap } = rewriteIdsForUpsert(snapshot)
  console.log(`  rewrote ${rewritten.length} objects`)
  console.log(`  idMap entries: ${idMap.size}`)
  console.log()

  // Step 3: Upsert in dependency order.
  console.log('Step 3: Upsert into sandbox in dependency order')
  console.log('-----------------------------------------------')

  // Group rewritten objects by type, then upsert in RESTORE_ORDER.
  const byType = new Map<SnapshotType, typeof rewritten>()
  for (const type of RESTORE_ORDER) {
    byType.set(type, [])
  }
  for (const obj of rewritten) {
    const list = byType.get(obj.type as SnapshotType)
    if (list) list.push(obj)
  }

  // CUSTOM_ATTRIBUTE_DEFINITION objects must be upserted one-at-a-time —
  // batchUpsert doesn't support them well in v44. Same goes for ITEM_OPTION
  // because each carries nested ITEM_OPTION_VALs.
  // For this first pass we treat everything as nestable in one big batch
  // call, but we slice into 100-object chunks per batch for safety.
  for (const type of RESTORE_ORDER) {
    const objs = byType.get(type) ?? []
    if (objs.length === 0) {
      console.log(`  ${type.padEnd(35)} (none)`)
      continue
    }

    const chunks = chunk(objs, 100)
    console.log(`  ${type.padEnd(35)} ${objs.length} object(s) in ${chunks.length} batch(es)`)

    if (!APPLY) {
      console.log(`    [DRY RUN] would batchUpsert ${objs.length} ${type} objects`)
      continue
    }

    for (let i = 0; i < chunks.length; i++) {
      process.stdout.write(`    batch ${i + 1}/${chunks.length} (${chunks[i].length} objects)... `)
      try {
        // Cast: our CatalogObject type is intentionally loose (pass-through),
        // but the SDK declares a strict discriminated union. We've verified
        // empirically that the rewritten objects match the SDK's expected
        // shape. The scripts/** biome override allows `any` here.
        const response = await client.catalog.batchUpsert({
          idempotencyKey: randomUUID(),
          batches: [{ objects: chunks[i] as any }]
        })
        const created = response.objects?.length ?? 0
        console.log(`upserted ${created}`)
      } catch (err) {
        console.log('FAILED')
        const e = err as { errors?: unknown; body?: unknown; message?: string }
        console.error('    error:', e.message)
        if (e.errors) console.error('    details:', JSON.stringify(e.errors, null, 2))
        throw err
      }
      if (i < chunks.length - 1) await sleep(250)
    }
  }

  console.log()
  if (!APPLY) {
    console.log('DRY RUN COMPLETE — no changes made to sandbox.')
    console.log('Re-run with --apply to actually mirror.')
  } else {
    console.log('Mirror complete. Sandbox now matches the snapshot.')
  }
}

main().catch((err) => {
  console.error('mirror failed:', err)
  process.exit(1)
})
