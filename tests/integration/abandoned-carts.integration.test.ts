import { db } from '@/lib/db/client'
import { abandonedCarts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('abandoned-carts')

describe('abandoned_carts integration', () => {
  it('inserts a pending cart with defaults', async () => {
    const cartId = `${NS}_cart_1`
    const [row] = await db
      .insert(abandonedCarts)
      .values({
        cartId,
        cartSnapshot: { items: [{ id: 'sq_item_1', name: 'Naruto', qty: 1, price: 7500 }] }
      })
      .returning()
    expect(row.cartId).toBe(cartId)
    expect(row.status).toBe('pending') // default
    expect(row.squareOrderId).toBeNull()
    expect(row.reminderSentAt).toBeNull()
    expect(row.cartSnapshot).toEqual({
      items: [{ id: 'sq_item_1', name: 'Naruto', qty: 1, price: 7500 }]
    })
  })

  it('transitions through statuses', async () => {
    const cartId = `${NS}_cart_2`
    await db.insert(abandonedCarts).values({
      cartId,
      cartSnapshot: { items: [] }
    })

    for (const status of ['in_checkout', 'completed'] as const) {
      await db
        .update(abandonedCarts)
        .set({ status, updatedAt: new Date() })
        .where(eq(abandonedCarts.cartId, cartId))
      const [row] = await db.select().from(abandonedCarts).where(eq(abandonedCarts.cartId, cartId))
      expect(row.status).toBe(status)
    }
  })

  it('rejects an unknown status', async () => {
    const cartId = `${NS}_cart_3`
    await expect(
      db.insert(abandonedCarts).values({
        cartId,
        cartSnapshot: {},
        status: 'definitely_not_a_status' as never
      })
    ).rejects.toThrow()
  })

  afterAll(async () => {
    await cleanupByPrefix(abandonedCarts, 'cart_id', NS)
  })
})
