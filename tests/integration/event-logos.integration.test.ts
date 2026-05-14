import { db } from '@/lib/db/client'
import { eventLogos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('event-logos')

describe('event_logos integration', () => {
  it('inserts a scraped logo and reads it back', async () => {
    const hashtag = `${NS}_anime_expo`
    await db.insert(eventLogos).values({
      hashtag,
      imageUrl: 'https://example.test/anime-expo.png',
      source: 'scraped',
      sourceEventUrl: 'https://www.anime-expo.org'
    })
    const rows = await db.select().from(eventLogos)
    const row = rows.find((r) => r.hashtag === hashtag)
    expect(row).toMatchObject({
      hashtag,
      imageUrl: 'https://example.test/anime-expo.png',
      source: 'scraped',
      sourceEventUrl: 'https://www.anime-expo.org'
    })
    expect(row?.updatedAt).toBeInstanceOf(Date)
  })

  it('rejects an invalid source value', async () => {
    const hashtag = `${NS}_invalid`
    // Cast through `as never` to bypass TS — we're testing the Postgres CHECK constraint.
    await expect(
      db.insert(eventLogos).values({
        hashtag,
        imageUrl: 'https://example.test/x.png',
        source: 'not_a_valid_source' as never
      })
    ).rejects.toThrow()
  })

  it('overrides update updatedAt', async () => {
    const hashtag = `${NS}_override`
    await db.insert(eventLogos).values({
      hashtag,
      imageUrl: 'https://example.test/v1.png',
      source: 'scraped'
    })

    // Wait long enough for timestamp to differ at millisecond resolution.
    await new Promise((resolve) => setTimeout(resolve, 50))

    await db
      .update(eventLogos)
      .set({
        imageUrl: 'https://example.test/v2.png',
        source: 'manual_override',
        updatedAt: new Date()
      })
      .where(eq(eventLogos.hashtag, hashtag))

    const [row] = await db.select().from(eventLogos).where(eq(eventLogos.hashtag, hashtag))
    expect(row?.source).toBe('manual_override')
    expect(row?.imageUrl).toBe('https://example.test/v2.png')
  })

  afterAll(async () => {
    await cleanupByPrefix(eventLogos, 'hashtag', NS)
  })
})
