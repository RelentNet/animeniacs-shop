import { db } from '@/lib/db/client'
import {
  createArtist,
  getActiveArtists,
  getAllArtists,
  getArtistByCategoryId,
  getArtistById,
  getArtistBySlug,
  setArtistStatus,
  updateArtist
} from '@/lib/db/queries/artists'
import { artists } from '@/lib/db/schema'
import { like, or } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { testNamespace } from '../helpers/db'

// testNamespace returns "artists__<hex>" which contains a double underscore.
// The artist slug regex (locked by the plan) disallows underscores, so we
// derive a slug-safe namespace by replacing `_` with `-`. The
// squareCategoryId and displayName columns are free-form text, so the raw
// NS is fine there.
const NS = testNamespace('artists')
const SLUG_NS = NS.replace(/_/g, '-')

// Helper: generates an artist-input shape with the test namespaces baked in
function input(suffix: string, overrides: Record<string, unknown> = {}) {
  return {
    slug: `${SLUG_NS}-${suffix}`,
    displayName: `Artist ${suffix}`,
    squareCategoryId: `${NS}_cat_${suffix}`,
    status: 'active' as const,
    ...overrides
  }
}

describe('artists query helpers', () => {
  it('createArtist inserts a row and returns generated id, createdAt, updatedAt', async () => {
    const row = await createArtist(input('create'))
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(row.createdAt).toBeInstanceOf(Date)
    expect(row.updatedAt).toBeInstanceOf(Date)
    expect(row.slug).toBe(`${SLUG_NS}-create`)
    expect(row.displayName).toBe('Artist create')
    expect(row.status).toBe('active')
    // numeric(5,4) round-trips as a string in postgres-js
    expect(row.commissionRate).toBe('0.2000')
  })

  it('getArtistBySlug returns the row when slug exists', async () => {
    await createArtist(input('by-slug'))
    const found = await getArtistBySlug(`${SLUG_NS}-by-slug`)
    expect(found).toBeDefined()
    expect(found?.slug).toBe(`${SLUG_NS}-by-slug`)
  })

  it('getArtistBySlug returns undefined when slug does not exist', async () => {
    const found = await getArtistBySlug(`${SLUG_NS}-does-not-exist`)
    expect(found).toBeUndefined()
  })

  it('getArtistByCategoryId finds the artist by squareCategoryId', async () => {
    await createArtist(input('by-cat'))
    const found = await getArtistByCategoryId(`${NS}_cat_by-cat`)
    expect(found).toBeDefined()
    expect(found?.slug).toBe(`${SLUG_NS}-by-cat`)
  })

  it('getActiveArtists returns only active rows, ordered by display_name', async () => {
    await createArtist(input('active-a', { displayName: `${NS}-Zeta` }))
    await createArtist(input('active-b', { displayName: `${NS}-Alpha` }))
    await createArtist(input('inactive-c', { displayName: `${NS}-Beta`, status: 'inactive' }))

    const all = await getActiveArtists()
    const mine = all.filter((a) => a.slug.startsWith(SLUG_NS))
    expect(mine.length).toBeGreaterThanOrEqual(2)
    // Inactive row must not appear
    expect(mine.find((a) => a.slug === `${SLUG_NS}-inactive-c`)).toBeUndefined()
    // Sorted ascending by display_name
    const myNames = mine.map((a) => a.displayName)
    const sorted = [...myNames].sort((x, y) => x.localeCompare(y))
    expect(myNames).toEqual(sorted)
  })

  it('getAllArtists returns active + inactive rows', async () => {
    await createArtist(input('all-active'))
    await createArtist(input('all-inactive', { status: 'inactive' }))

    const all = await getAllArtists()
    const mine = all.filter((a) => a.slug.startsWith(SLUG_NS))
    const slugs = mine.map((a) => a.slug)
    expect(slugs).toContain(`${SLUG_NS}-all-active`)
    expect(slugs).toContain(`${SLUG_NS}-all-inactive`)
  })

  it('updateArtist patches fields and advances updatedAt', async () => {
    const row = await createArtist(input('update', { bio: 'before' }))
    const originalUpdatedAt = row.updatedAt
    // Sleep 5 ms to make sure updatedAt advances (timestamp precision is ms)
    await new Promise((r) => setTimeout(r, 5))
    const patched = await updateArtist(row.id, { bio: 'after' })
    expect(patched.bio).toBe('after')
    expect(patched.displayName).toBe('Artist update') // untouched
    expect(patched.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime())
  })

  it('setArtistStatus flips active <-> inactive', async () => {
    const row = await createArtist(input('flip'))
    expect(row.status).toBe('active')
    const inactive = await setArtistStatus(row.id, 'inactive')
    expect(inactive.status).toBe('inactive')
    const reactivated = await setArtistStatus(row.id, 'active')
    expect(reactivated.status).toBe('active')
  })

  it('getArtistById returns the row by uuid', async () => {
    const row = await createArtist(input('by-id'))
    const found = await getArtistById(row.id)
    expect(found?.id).toBe(row.id)
  })

  it('rejects duplicate slug (unique constraint)', async () => {
    await createArtist(input('dup'))
    await expect(createArtist(input('dup'))).rejects.toThrow()
  })

  it('rejects status=banned (Zod validation rejects the invalid enum)', async () => {
    await expect(
      createArtist({ ...(input('banned') as any), status: 'banned' as any })
    ).rejects.toThrow()
  })

  it('rejects status=banned at the DB level when Zod is bypassed', async () => {
    // Direct insert via Drizzle to confirm the CHECK constraint fires
    // server-side, not just the Zod layer.
    await expect(
      db.insert(artists).values({
        slug: `${SLUG_NS}-db-banned`,
        displayName: 'DB Banned',
        squareCategoryId: `${NS}_cat_db_banned`,
        status: 'banned' as any // bypass TS enum to hit the SQL CHECK
      })
    ).rejects.toThrow()
  })

  afterAll(async () => {
    // Clean up by either slug prefix (SLUG_NS) or squareCategoryId prefix (NS).
    await db
      .delete(artists)
      .where(or(like(artists.slug, `${SLUG_NS}%`), like(artists.squareCategoryId, `${NS}%`)))
  })
})
