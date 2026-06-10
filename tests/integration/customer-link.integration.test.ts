import { db } from '@/lib/db/client'
import { customerLink } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('customer-link')

// Phase 11 re-keyed customer_link from the email PK to the Logto sub (userId).
// email + name are now nullable display fields; userId is the primary key.
describe('customer_link integration', () => {
  it('caches a userId→square_customer_id mapping', async () => {
    const userId = `${NS}_alice`
    const email = `${NS}_alice@example.test`
    const squareCustomerId = `${NS}_sq_cust_alice`
    await db.insert(customerLink).values({ userId, email, squareCustomerId, name: 'Alice' })

    const [row] = await db.select().from(customerLink).where(eq(customerLink.userId, userId))
    expect(row.squareCustomerId).toBe(squareCustomerId)
    expect(row.email).toBe(email)
    expect(row.name).toBe('Alice')
    expect(row.cachedAt).toBeInstanceOf(Date)
  })

  it('overwrites on conflict via upsert pattern keyed on userId', async () => {
    const userId = `${NS}_bob`
    await db.insert(customerLink).values({ userId, squareCustomerId: 'old_id' })
    await db
      .insert(customerLink)
      .values({ userId, squareCustomerId: 'new_id' })
      .onConflictDoUpdate({
        target: customerLink.userId,
        set: { squareCustomerId: 'new_id', cachedAt: new Date() }
      })
    const [row] = await db.select().from(customerLink).where(eq(customerLink.userId, userId))
    expect(row.squareCustomerId).toBe('new_id')
  })

  it('TTL query filters out expired rows', async () => {
    const userId = `${NS}_stale`
    // Insert with an explicitly old cachedAt.
    const oldDate = new Date(Date.now() - 1000 * 60 * 60 * 25) // 25 hours ago
    await db.insert(customerLink).values({ userId, squareCustomerId: 'stale', cachedAt: oldDate })

    // The Phase 7 read pattern: only return non-expired rows.
    const rows = await db
      .select()
      .from(customerLink)
      .where(sql`${customerLink.cachedAt} > now() - interval '1 day'`)
    expect(rows.find((r) => r.userId === userId)).toBeUndefined()
  })

  afterAll(async () => {
    await cleanupByPrefix(customerLink, 'user_id', NS)
  })
})
