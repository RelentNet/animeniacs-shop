import { db } from '@/lib/db/client'
import { siteSettings } from '@/lib/db/schema'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('site-settings')

describe('site_settings integration', () => {
  it('can write and read a row', async () => {
    const key = `${NS}_key_a`
    await db.insert(siteSettings).values({ key, value: { hello: 'world' } })
    const rows = await db.select().from(siteSettings)
    const row = rows.find((r) => r.key === key)
    expect(row?.value).toEqual({ hello: 'world' })
  })

  it('can read multiple rows written under the same namespace', async () => {
    await db.insert(siteSettings).values([
      { key: `${NS}_multi_1`, value: { n: 1 } },
      { key: `${NS}_multi_2`, value: { n: 2 } }
    ])
    const rows = await db.select().from(siteSettings)
    const mine = rows.filter((r) => r.key.startsWith(`${NS}_multi_`))
    expect(mine).toHaveLength(2)
  })

  afterAll(async () => {
    await cleanupByPrefix(siteSettings, 'key', NS)
  })
})
