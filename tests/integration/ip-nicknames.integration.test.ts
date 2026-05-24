import { db } from '@/lib/db/client'
import {
  createIpNickname,
  getAllIpNicknames,
  getIpNicknameByCategoryId,
  getIpNicknameById,
  getIpNicknameBySlug,
  getPublicIpNicknames,
  updateIpNickname
} from '@/lib/db/queries/ip-nicknames'
import { ipNicknames } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { testNamespace } from '../helpers/db'

const NS = testNamespace('ipnick')
// Slug has no underscores allowed.
const SLUG_NS = NS.replace(/_/g, '-')

function input(suffix: string, overrides: Record<string, unknown> = {}) {
  return {
    slug: `${SLUG_NS}-${suffix}`,
    nickname: `Nickname ${suffix}`,
    squareCategoryId: `${NS}_cat_${suffix}`,
    description: null,
    isPublic: true,
    ...overrides
  }
}

afterAll(async () => {
  await db.delete(ipNicknames).where(sql`${ipNicknames.slug} LIKE ${`${SLUG_NS}%`}`)
})

describe('ip_nicknames query helpers', () => {
  it('createIpNickname inserts a row with generated id + timestamps', async () => {
    const row = await createIpNickname(input('create'))
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(row.createdAt).toBeInstanceOf(Date)
    expect(row.updatedAt).toBeInstanceOf(Date)
    expect(row.slug).toBe(`${SLUG_NS}-create`)
    expect(row.isPublic).toBe(true)
    expect(row.coverImageUrl).toBeNull()
  })

  it('getIpNicknameBySlug returns the row when slug exists', async () => {
    await createIpNickname(input('byslug'))
    const found = await getIpNicknameBySlug(`${SLUG_NS}-byslug`)
    expect(found?.slug).toBe(`${SLUG_NS}-byslug`)
  })

  it('getIpNicknameBySlug returns undefined when slug missing', async () => {
    const found = await getIpNicknameBySlug(`${SLUG_NS}-missing-xyz`)
    expect(found).toBeUndefined()
  })

  it('getIpNicknameByCategoryId finds by Square category id', async () => {
    await createIpNickname(input('bycat'))
    const found = await getIpNicknameByCategoryId(`${NS}_cat_bycat`)
    expect(found?.slug).toBe(`${SLUG_NS}-bycat`)
  })

  it('getIpNicknameById finds by primary key', async () => {
    const created = await createIpNickname(input('byid'))
    const found = await getIpNicknameById(created.id)
    expect(found?.id).toBe(created.id)
  })

  it('getPublicIpNicknames excludes is_public=false rows', async () => {
    await createIpNickname(input('pub-a'))
    await createIpNickname(input('pub-b', { isPublic: false }))
    const pub = await getPublicIpNicknames()
    const mine = pub.filter((n) => n.slug.startsWith(SLUG_NS))
    expect(mine.find((n) => n.slug === `${SLUG_NS}-pub-a`)).toBeDefined()
    expect(mine.find((n) => n.slug === `${SLUG_NS}-pub-b`)).toBeUndefined()
  })

  it('getAllIpNicknames includes is_public=false rows', async () => {
    await createIpNickname(input('all-c', { isPublic: false }))
    const all = await getAllIpNicknames()
    const mine = all.filter((n) => n.slug.startsWith(SLUG_NS))
    expect(mine.find((n) => n.slug === `${SLUG_NS}-all-c`)).toBeDefined()
  })

  it('updateIpNickname patches fields and bumps updated_at', async () => {
    const created = await createIpNickname(input('upd'))
    const before = created.updatedAt
    await new Promise((r) => setTimeout(r, 10))
    const updated = await updateIpNickname(created.id, { nickname: 'New Name' })
    expect(updated.nickname).toBe('New Name')
    expect(updated.updatedAt.getTime()).toBeGreaterThan(before.getTime())
  })

  it('unique constraint on slug rejects duplicates', async () => {
    await createIpNickname(input('uniq-slug'))
    await expect(
      createIpNickname(input('uniq-slug', { squareCategoryId: `${NS}_cat_uniq-slug-2` }))
    ).rejects.toThrow()
  })

  it('unique constraint on square_category_id rejects duplicates', async () => {
    await createIpNickname(input('uniq-cat'))
    await expect(
      createIpNickname(input('uniq-cat-2', { squareCategoryId: `${NS}_cat_uniq-cat` }))
    ).rejects.toThrow()
  })
})
