import { db } from '@/lib/db/client'
import { productCache } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('product-cache')

describe('product_cache integration', () => {
  it('caches a product snapshot and reads it back', async () => {
    const catalogItemId = `${NS}_sq_item_1`
    const data = {
      name: 'Naruto — Acrylic Wall Art',
      price_cents: 7500,
      image_urls: ['https://square.example/img1.jpg'],
      custom_attrs: { artist: 'bxnny', ip: 'naruto', product_type: 'acrylic' }
    }
    await db.insert(productCache).values({ catalogItemId, data })

    const [row] = await db
      .select()
      .from(productCache)
      .where(eq(productCache.catalogItemId, catalogItemId))
    expect(row.data).toEqual(data)
    expect(row.updatedAt).toBeInstanceOf(Date)
  })

  it('upserts on catalog.version.updated (Phase 3 webhook pattern)', async () => {
    const catalogItemId = `${NS}_sq_item_2`
    await db.insert(productCache).values({
      catalogItemId,
      data: { name: 'old name', price_cents: 100 }
    })
    await db
      .insert(productCache)
      .values({
        catalogItemId,
        data: { name: 'new name', price_cents: 200 },
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: productCache.catalogItemId,
        set: {
          data: { name: 'new name', price_cents: 200 },
          updatedAt: new Date()
        }
      })
    const [row] = await db
      .select()
      .from(productCache)
      .where(eq(productCache.catalogItemId, catalogItemId))
    expect(row.data).toEqual({ name: 'new name', price_cents: 200 })
  })

  afterAll(async () => {
    await cleanupByPrefix(productCache, 'catalog_item_id', NS)
  })
})
