import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'

/**
 * Returns a per-test-file namespace string used to prefix DB rows.
 * Lets parallel integration test files coexist without trampling each other.
 *
 * Usage:
 *   const NS = testNamespace('reviews')
 *   // → "reviews__a1b2c3d4"
 *
 * Insert rows with NS-prefixed string columns:
 *   await db.insert(reviews).values({ productId: `${NS}_prod_1`, ... })
 *
 * Clean up in afterAll:
 *   await cleanupByPrefix(reviews, 'product_id', NS)
 */
export function testNamespace(feature: string): string {
  const suffix = randomBytes(4).toString('hex')
  return `${feature}__${suffix}`
}

/**
 * Deletes every row in `table` where the given column starts with `prefix`.
 * Use in afterAll to scope cleanup to the rows this test file created.
 *
 * `columnName` is the SQL column name (snake_case), not the Drizzle property name.
 */
export async function cleanupByPrefix(
  table: PgTable,
  columnName: string,
  prefix: string
): Promise<void> {
  // Drizzle's `sql` template handles identifier quoting and value binding safely.
  await db.execute(
    sql`DELETE FROM ${table} WHERE ${sql.identifier(columnName)} LIKE ${`${prefix}%`}`
  )
}
