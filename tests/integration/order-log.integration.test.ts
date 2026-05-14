import { db } from '@/lib/db/client'
import { orderLog } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('order-log')

describe('order_log integration', () => {
  it('logs a webhook event', async () => {
    const squareOrderId = `${NS}_sq_order_1`
    const [row] = await db
      .insert(orderLog)
      .values({
        squareOrderId,
        eventType: 'order.created',
        payload: { merchant_id: 'm_xyz', type: 'order.created', data: { id: squareOrderId } }
      })
      .returning()
    expect(row.id).toBeGreaterThan(0)
    expect(row.eventType).toBe('order.created')
    expect(row.receivedAt).toBeInstanceOf(Date)
  })

  it('orders events for a single order chronologically', async () => {
    const squareOrderId = `${NS}_sq_order_2`
    await db.insert(orderLog).values({
      squareOrderId,
      eventType: 'order.created',
      payload: { seq: 1 }
    })
    // Small delay to ensure deterministic ordering by received_at.
    await new Promise((resolve) => setTimeout(resolve, 10))
    await db.insert(orderLog).values({
      squareOrderId,
      eventType: 'payment.created',
      payload: { seq: 2 }
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    await db.insert(orderLog).values({
      squareOrderId,
      eventType: 'order.fulfillment.updated',
      payload: { seq: 3 }
    })

    const rows = await db
      .select()
      .from(orderLog)
      .where(eq(orderLog.squareOrderId, squareOrderId))
      .orderBy(desc(orderLog.receivedAt))
    expect(rows.map((r) => r.eventType)).toEqual([
      'order.fulfillment.updated',
      'payment.created',
      'order.created'
    ])
  })

  it('accepts unknown event_type values (no enum constraint)', async () => {
    const squareOrderId = `${NS}_sq_order_3`
    // Square may add new event types over time; we should not reject them.
    const [row] = await db
      .insert(orderLog)
      .values({
        squareOrderId,
        eventType: 'order.future.unknown_event_type',
        payload: {}
      })
      .returning()
    expect(row.eventType).toBe('order.future.unknown_event_type')
  })

  afterAll(async () => {
    await cleanupByPrefix(orderLog, 'square_order_id', NS)
  })
})
