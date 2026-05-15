#!/usr/bin/env tsx
/**
 * Snapshots the Square catalog of the requested environment to a local JSON
 * file. Read-only — never writes to Square.
 *
 * Usage:
 *   pnpm sq:snapshot production    # snapshot prod (read-only, safe)
 *   pnpm sq:snapshot sandbox       # snapshot sandbox (e.g., before cleanup tests)
 *
 * Output:
 *   /tmp/animeniacs-square-snapshot-<env>-<UTC-timestamp>.json
 */

import { stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { type SquareEnv, takeSnapshot } from './lib'

async function main(): Promise<void> {
  const envArg = process.argv[2] as SquareEnv | undefined
  if (envArg !== 'sandbox' && envArg !== 'production') {
    console.error(
      'Usage: pnpm sq:snapshot <sandbox|production>\n\n' +
        '  Reads the entire catalog of the given environment and writes a\n' +
        '  JSON snapshot to /tmp/. Always read-only.'
    )
    process.exit(2)
  }

  const env: SquareEnv = envArg
  const locationIds = env === 'production' ? ['L182TWM8YVZSR', 'L9G64BGJWXNF4'] : ['L1T00JYXSKVM3']

  console.log(`Snapshotting Square ${env} catalog...`)
  const snapshot = await takeSnapshot(env, locationIds)

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join('/tmp', `animeniacs-square-snapshot-${env}-${stamp}.json`)
  // Square SDK returns money amounts as BigInt; JSON.stringify can't handle
  // them natively. Coerce every BigInt to a Number on the way out — money
  // amounts are in cents (always within safe integer range for our prices).
  // Using Number (not String) so the restored value matches Square's accepted
  // request shape for batchUpsert.
  await writeFile(
    file,
    JSON.stringify(
      snapshot,
      (_key, value) => (typeof value === 'bigint' ? Number(value) : value),
      2
    )
  )

  console.log(`\nSnapshot complete:`)
  for (const [type, count] of Object.entries(snapshot.counts)) {
    console.log(`  ${type.padEnd(35)} ${count}`)
  }
  const fileStat = await stat(file)
  console.log(`\nWritten to: ${file}`)
  console.log(`File size: ${(fileStat.size / 1024 / 1024).toFixed(2)} MB`)
}

main().catch((err) => {
  console.error('snapshot failed:', err)
  process.exit(1)
})
