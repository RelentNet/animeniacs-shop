import { db } from '@/lib/db/client'
import { siteSettings } from '@/lib/db/schema'
import { afterAll, describe, expect, it } from 'vitest'

describe('database connection', () => {
  it('can write and read a site_settings row', async () => {
    await db.insert(siteSettings).values({ key: 'test-key', value: { hello: 'world' } })
    const rows = await db.select().from(siteSettings)
    const row = rows.find((r) => r.key === 'test-key')
    expect(row?.value).toEqual({ hello: 'world' })
  })

  afterAll(async () => {
    await db.delete(siteSettings)
  })
})
