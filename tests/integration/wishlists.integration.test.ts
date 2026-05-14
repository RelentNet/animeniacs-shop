import { db } from '@/lib/db/client'
import { wishlists } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('wishlists')

describe('wishlists integration', () => {
  it('adds a product to a user wishlist', async () => {
    const userId = `${NS}_user_a`
    const productId = `${NS}_prod_1`
    await db.insert(wishlists).values({ userId, productId })

    const [row] = await db
      .select()
      .from(wishlists)
      .where(and(eq(wishlists.userId, userId), eq(wishlists.productId, productId)))
    expect(row.userId).toBe(userId)
    expect(row.addedAt).toBeInstanceOf(Date)
  })

  it('allows multiple products per user', async () => {
    const userId = `${NS}_user_b`
    await db.insert(wishlists).values([
      { userId, productId: `${NS}_prod_b1` },
      { userId, productId: `${NS}_prod_b2` },
      { userId, productId: `${NS}_prod_b3` }
    ])
    const rows = await db.select().from(wishlists).where(eq(wishlists.userId, userId))
    expect(rows).toHaveLength(3)
  })

  it('enforces the (user_id, product_id) composite primary key', async () => {
    const userId = `${NS}_user_c`
    const productId = `${NS}_prod_c1`
    await db.insert(wishlists).values({ userId, productId })
    await expect(db.insert(wishlists).values({ userId, productId })).rejects.toThrow()
  })

  afterAll(async () => {
    await cleanupByPrefix(wishlists, 'user_id', NS)
  })
})
