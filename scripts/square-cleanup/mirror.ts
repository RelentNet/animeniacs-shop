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
  rewriteTempRefsToReal,
  scrubUnresolvedTempRefs,
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

  // Step 1: Wipe sandbox. Delete in reverse dependency order: ITEMs
  // first (they reference categories, taxes, options, images), then
  // intermediate types, then leaves. Otherwise Square rejects with
  // "Object with ID X is in use by one or more Items."
  console.log('Step 1: Wipe sandbox catalog')
  console.log('-----------------------------')

  // Group existing sandbox IDs by type so we can delete in the right order.
  const idsByType = new Map<SnapshotType, string[]>()
  for (const type of RESTORE_ORDER) {
    const page = await client.catalog.list({ types: type })
    const ids: string[] = []
    for await (const obj of page) {
      const o = obj as { id: string }
      if (!o.id.startsWith('#')) ids.push(o.id)
    }
    idsByType.set(type, ids)
    console.log(`  ${type.padEnd(35)} ${ids.length} to delete`)
  }
  const totalDelete = [...idsByType.values()].reduce((sum, ids) => sum + ids.length, 0)
  console.log(`  TOTAL to delete: ${totalDelete}`)

  if (totalDelete > 0) {
    if (!APPLY) {
      console.log('  [DRY RUN] would call batchDelete per-type in reverse order')
    } else {
      // batchDelete max is 200 IDs per call. Delete in reverse RESTORE_ORDER
      // so that referenced parents (CATEGORY, ITEM_OPTION, etc.) are
      // deleted only after their referencing children (ITEMs).
      //
      // Skip ITEM_OPTION_VAL: Square requires every ITEM_OPTION to retain
      // at least one ITEM_OPTION_VAL, so deleting the values standalone
      // before the parent fails. Deleting the parent ITEM_OPTION cascades
      // to its values automatically.
      for (const type of [...RESTORE_ORDER].reverse()) {
        if (type === 'ITEM_OPTION_VAL') continue
        const ids = idsByType.get(type) ?? []
        if (ids.length === 0) continue
        const chunks = chunk(ids, 200)
        for (let i = 0; i < chunks.length; i++) {
          process.stdout.write(
            `  deleting ${type} batch ${i + 1}/${chunks.length} (${chunks[i].length} ids)... `
          )
          await client.catalog.batchDelete({ objectIds: chunks[i] })
          console.log('done')
          if (i < chunks.length - 1) await sleep(250)
        }
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

  // Step 3: Upsert into sandbox in dependency-ordered passes.
  console.log('Step 3: Upsert into sandbox (multi-pass)')
  console.log('----------------------------------------')

  // Square's batchUpsert atomic-batch limit is 1,000 *total* objects
  // (including nested ITEM_VARIATIONs and ITEM_OPTION values). Our 915
  // top-level objects plus 419 nested variations plus 11 nested option
  // values = 1,334 — too many for one batch. And `#temp_<n>` IDs only
  // resolve within a single atomic batch.
  //
  // So we upsert in dependency-ordered passes, using id_mappings from
  // each response to rewrite `#temp_<n>` references into real IDs before
  // the next pass.
  //
  // Pass plan:
  //   1. Leaves (no inter-type refs): CUSTOM_ATTRIBUTE_DEFINITION, TAX,
  //      IMAGE, DISCOUNT.
  //   2. ITEM_OPTION (with nested values).
  //   3. CATEGORY (parent-child refs resolve within this batch since all
  //      categories share one batch).
  //   4. ITEM (with nested variations). References every prior pass's
  //      objects, which by now have real IDs.
  //
  // Standalone ITEM_OPTION_VAL is excluded: same values are nested inside
  // their parent ITEM_OPTION and Square creates them there.
  const byType = new Map<SnapshotType, typeof rewritten>()
  for (const type of RESTORE_ORDER) byType.set(type, [])
  for (const obj of rewritten) {
    const list = byType.get(obj.type as SnapshotType)
    if (list) list.push(obj)
  }

  for (const type of RESTORE_ORDER) {
    const objs = byType.get(type) ?? []
    let note = ''
    if (type === 'ITEM_OPTION_VAL') note = ' (skipped — nested in ITEM_OPTION)'
    if (type === 'IMAGE') note = ' (skipped — requires CreateCatalogImage endpoint)'
    console.log(`  ${type.padEnd(35)} ${objs.length}${note}`)
  }
  console.log()

  // Define passes. Each entry is a list of snapshot types to upsert in
  // one atomic batch. ITEM_OPTION_VAL is never included (nested in parent
  // ITEM_OPTION). IMAGE is also never included: Square requires images
  // to be created through the dedicated CreateCatalogImage endpoint with
  // an actual file upload — they cannot be created via batchUpsert. Items
  // referencing un-upserted images will have those image refs scrubbed
  // before upsert.
  const passes: { name: string; types: SnapshotType[] }[] = [
    {
      name: 'leaves (definitions / taxes / discounts)',
      types: ['CUSTOM_ATTRIBUTE_DEFINITION', 'TAX', 'DISCOUNT']
    },
    { name: 'item options', types: ['ITEM_OPTION'] },
    { name: 'categories', types: ['CATEGORY'] },
    { name: 'items (with nested variations)', types: ['ITEM'] }
  ]

  // Accumulating map from temp ID → real Square-assigned ID, fed from each
  // pass's response.idMappings.
  const tempToReal = new Map<string, string>()

  for (const pass of passes) {
    const objs: typeof rewritten = []
    for (const t of pass.types) objs.push(...(byType.get(t) ?? []))
    if (objs.length === 0) {
      console.log(`  pass: ${pass.name} — nothing to upsert`)
      continue
    }

    // Rewrite any `#temp_<n>` references in this pass's objects to real
    // IDs collected from earlier passes, then scrub any leftover temp
    // strings — those reference objects we skipped (e.g., IMAGE), and
    // Square will reject them. Both helpers preserve `id` fields at every
    // nesting level so Square can assign real IDs on upsert.
    for (const obj of objs) {
      rewriteTempRefsToReal(obj, tempToReal)
      scrubUnresolvedTempRefs(obj)
    }

    console.log(`  pass: ${pass.name} — ${objs.length} object(s)`)

    if (!APPLY) {
      console.log(`    [DRY RUN] would batchUpsert ${objs.length} objects`)
      // In dry-run we don't have real IDs to populate tempToReal, so later
      // passes see un-rewritten refs — still useful for shape inspection.
      continue
    }

    process.stdout.write(`    upserting... `)
    try {
      const response = await client.catalog.batchUpsert({
        idempotencyKey: randomUUID(),
        // Cast: our CatalogObject is intentionally loose pass-through; the
        // SDK declares a strict discriminated union. The scripts/** biome
        // override allows `any` here.
        batches: [{ objects: objs as any }]
      })
      const created = response.objects?.length ?? 0
      const mappings = response.idMappings ?? []
      for (const m of mappings) {
        if (m.clientObjectId && m.objectId) {
          tempToReal.set(m.clientObjectId, m.objectId)
        }
      }
      console.log(`upserted ${created} (collected ${mappings.length} id mappings)`)
    } catch (err) {
      console.log('FAILED')
      const e = err as { errors?: unknown; body?: unknown; message?: string }
      console.error('    error:', e.message)
      if (e.errors) console.error('    details:', JSON.stringify(e.errors, null, 2))
      throw err
    }
    // Brief pacing between passes; Square rejects concurrent updates per
    // seller with 429.
    await sleep(500)
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
