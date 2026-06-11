import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn()
}

vi.mock('@/lib/db/client', () => ({ db: mockDb }))

beforeEach(() => {
  mockDb.insert.mockReset().mockReturnThis()
  mockDb.values.mockReset().mockReturnThis()
  mockDb.returning.mockReset().mockResolvedValue([])
})

// Loaded dynamically (not a top-level import) so the vi.mock factory's `mockDb`
// is initialized before artists.ts pulls in the mocked db client.
let ArtistInputSchema: typeof import('@/lib/db/queries/artists').ArtistInputSchema

beforeAll(async () => {
  ;({ ArtistInputSchema } = await import('@/lib/db/queries/artists'))
})

describe('ArtistInputSchema avatarUrl', () => {
  const base = {
    slug: 'bxnny.arts',
    displayName: 'Bxnny Arts',
    squareCategoryId: 'CAT123'
  }

  it('accepts an app-relative avatar path (what saveAvatar returns)', () => {
    const result = ArtistInputSchema.safeParse({
      ...base,
      avatarUrl: '/images/uploads/artists/foo.webp'
    })
    expect(result.success).toBe(true)
  })

  it('accepts a full https avatar URL', () => {
    const result = ArtistInputSchema.safeParse({
      ...base,
      avatarUrl: 'https://cdn.example.com/avatar.webp'
    })
    expect(result.success).toBe(true)
  })

  it('accepts null avatarUrl', () => {
    expect(ArtistInputSchema.safeParse({ ...base, avatarUrl: null }).success).toBe(true)
  })

  it('accepts an omitted avatarUrl', () => {
    expect(ArtistInputSchema.safeParse(base).success).toBe(true)
  })

  it('rejects a bogus avatarUrl that is neither a path nor a URL', () => {
    expect(ArtistInputSchema.safeParse({ ...base, avatarUrl: 'not a url' }).success).toBe(false)
  })

  it('still requires social links to be absolute URLs', () => {
    // A relative path is fine for avatarUrl but NOT for instagram.
    expect(ArtistInputSchema.safeParse({ ...base, instagram: '/relative/path' }).success).toBe(
      false
    )
  })
})

describe('createArtist with a relative avatar path', () => {
  const base = {
    slug: 'bxnny.arts',
    displayName: 'Bxnny Arts',
    squareCategoryId: 'CAT123'
  }

  it('no longer throws when avatarUrl is the /public-relative path saveAvatar returns', async () => {
    const row = { id: 'a-1', ...base, avatarUrl: '/images/uploads/artists/bxnny.arts.webp' }
    mockDb.returning.mockResolvedValue([row])
    const { createArtist } = await import('@/lib/db/queries/artists')

    // Before the fix, ArtistInputSchema.parse() threw on this path -> 500.
    await expect(
      createArtist({ ...base, avatarUrl: '/images/uploads/artists/bxnny.arts.webp' })
    ).resolves.toEqual(row)
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({ avatarUrl: '/images/uploads/artists/bxnny.arts.webp' })
    )
  })
})
