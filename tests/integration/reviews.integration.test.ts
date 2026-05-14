import { db } from '@/lib/db/client'
import { reviews } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('reviews')

describe('reviews integration', () => {
  it('inserts a 5-star review with photos and reads it back', async () => {
    const productId = `${NS}_prod_1`
    const userId = `${NS}_user_1`
    const [row] = await db
      .insert(reviews)
      .values({
        productId,
        userId,
        orderId: `${NS}_order_1`,
        rating: 5,
        title: 'Amazing',
        body: 'Love this print.',
        photoUrls: [`${NS}_photo_a.jpg`, `${NS}_photo_b.jpg`],
        isVerifiedPurchase: true
      })
      .returning()
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(row.rating).toBe(5)
    expect(row.photoUrls).toEqual([`${NS}_photo_a.jpg`, `${NS}_photo_b.jpg`])
    expect(row.isPublished).toBe(false) // default
    expect(row.isVerifiedPurchase).toBe(true)
  })

  it('rejects a rating of 0', async () => {
    await expect(
      db.insert(reviews).values({
        productId: `${NS}_prod_x`,
        userId: `${NS}_user_x`,
        rating: 0,
        body: 'invalid'
      })
    ).rejects.toThrow()
  })

  it('rejects a rating of 6', async () => {
    await expect(
      db.insert(reviews).values({
        productId: `${NS}_prod_y`,
        userId: `${NS}_user_y`,
        rating: 6,
        body: 'invalid'
      })
    ).rejects.toThrow()
  })

  it('enforces one review per (user, product)', async () => {
    const productId = `${NS}_prod_uniq`
    const userId = `${NS}_user_uniq`
    await db.insert(reviews).values({ productId, userId, rating: 4, body: 'first' })
    await expect(
      db.insert(reviews).values({ productId, userId, rating: 5, body: 'second' })
    ).rejects.toThrow()
  })

  it('allows multiple anonymous (null user_id) reviews on one product', async () => {
    const productId = `${NS}_prod_anon`
    await db.insert(reviews).values({ productId, userId: null, rating: 3, body: 'a' })
    await db.insert(reviews).values({ productId, userId: null, rating: 4, body: 'b' })
    const rows = await db.select().from(reviews).where(eq(reviews.productId, productId))
    expect(rows).toHaveLength(2)
  })

  it('defaults photoUrls to an empty array', async () => {
    const productId = `${NS}_prod_no_photos`
    const [row] = await db
      .insert(reviews)
      .values({
        productId,
        userId: `${NS}_user_no_photos`,
        rating: 5,
        body: 'no photos'
      })
      .returning()
    expect(row.photoUrls).toEqual([])
  })

  afterAll(async () => {
    await cleanupByPrefix(reviews, 'product_id', NS)
  })
})
