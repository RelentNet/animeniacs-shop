import { db } from '@/lib/db/client'
import { customerLink } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('customer-link')

describe('customer_link integration', () => {
  it('caches an email→square_customer_id mapping', async () => {
    const email = `${NS}_alice@example.test`
    const squareCustomerId = `${NS}_sq_cust_alice`
    await db.insert(customerLink).values({ email, squareCustomerId })

    const [row] = await db.select().from(customerLink).where(eq(customerLink.email, email))
    expect(row.squareCustomerId).toBe(squareCustomerId)
    expect(row.cachedAt).toBeInstanceOf(Date)
  })

  it('overwrites on conflict via upsert pattern', async () => {
    const email = `${NS}_bob@example.test`
    await db.insert(customerLink).values({ email, squareCustomerId: 'old_id' })
    await db
      .insert(customerLink)
      .values({ email, squareCustomerId: 'new_id' })
      .onConflictDoUpdate({
        target: customerLink.email,
        set: { squareCustomerId: 'new_id', cachedAt: new Date() }
      })
    const [row] = await db.select().from(customerLink).where(eq(customerLink.email, email))
    expect(row.squareCustomerId).toBe('new_id')
  })

  it('TTL query filters out expired rows', async () => {
    const email = `${NS}_stale@example.test`
    // Insert with an explicitly old cachedAt.
    const oldDate = new Date(Date.now() - 1000 * 60 * 60 * 25) // 25 hours ago
    await db.insert(customerLink).values({ email, squareCustomerId: 'stale', cachedAt: oldDate })

    // The Phase 7 read pattern: only return non-expired rows.
    const rows = await db
      .select()
      .from(customerLink)
      .where(sql`${customerLink.cachedAt} > now() - interval '1 day'`)
    expect(rows.find((r) => r.email === email)).toBeUndefined()
  })

  afterAll(async () => {
    await cleanupByPrefix(customerLink, 'email', NS)
  })
})
