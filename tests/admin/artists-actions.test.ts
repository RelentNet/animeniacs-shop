import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----
//
// The server action talks to:
//   - createArtist / updateArtist     (DB layer)
//   - saveAvatar                       (image upload)
//   - revalidatePath / redirect        (Next.js navigation)
//
// Mock everything so we can assert behavior without needing Postgres
// or a real filesystem.

const createArtistMock = vi.fn()
const updateArtistMock = vi.fn()
vi.mock('@/lib/db/queries/artists', async () => {
  // Keep ArtistInputSchema real so we test the validation surface.
  const actual = await vi.importActual<typeof import('@/lib/db/queries/artists')>(
    '@/lib/db/queries/artists'
  )
  return {
    ...actual,
    createArtist: (...args: unknown[]) => createArtistMock(...args),
    updateArtist: (...args: unknown[]) => updateArtistMock(...args),
    getArtistById: vi.fn(),
    setArtistStatus: vi.fn()
  }
})

const saveAvatarMock = vi.fn()
vi.mock('@/lib/images/upload', async () => {
  const actual = await vi.importActual<typeof import('@/lib/images/upload')>('@/lib/images/upload')
  return {
    ...actual,
    saveAvatar: (...args: unknown[]) => saveAvatarMock(...args)
  }
})

const revalidateMock = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidateMock(...args)
}))

const redirectMock = vi.fn((path: string) => {
  // Next's redirect throws to abort the action. Mirror that.
  throw new Error(`__REDIRECT__:${path}`)
})
vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => redirectMock(...(args as [string]))
}))

// Build a FormData populated with the fields the form normally posts.
function buildFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  const defaults: Record<string, string> = {
    slug: 'bxnny.arts',
    displayName: 'Bxnny.Arts',
    squareCategoryId: 'CAT_BXNNY_123',
    status: 'active',
    bio: '',
    instagram: '',
    twitter: '',
    facebook: '',
    youtube: '',
    tiktok: '',
    website: '',
    commissionRate: '0.2000',
    paymentMethod: '',
    paymentEmail: '',
    notes: ''
  }
  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) {
    fd.set(k, v)
  }
  return fd
}

async function loadCreateAction() {
  const mod = await import('@/app/(admin)/admin/artists/new/actions')
  return mod.createArtistAction
}

async function loadUpdateAction() {
  const mod = await import('@/app/(admin)/admin/artists/[id]/actions')
  return mod.updateArtistAction
}

describe('createArtistAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('happy path: validates, calls createArtist, revalidates, redirects', async () => {
    createArtistMock.mockResolvedValue({
      id: 'uuid-1',
      slug: 'bxnny.arts',
      displayName: 'Bxnny.Arts',
      squareCategoryId: 'CAT_BXNNY_123'
    })
    const action = await loadCreateAction()
    await expect(action(undefined, buildFormData())).rejects.toThrow('__REDIRECT__:/admin/artists')

    expect(createArtistMock).toHaveBeenCalledTimes(1)
    const insertCall = createArtistMock.mock.calls[0][0]
    expect(insertCall.slug).toBe('bxnny.arts')
    expect(insertCall.displayName).toBe('Bxnny.Arts')
    expect(insertCall.squareCategoryId).toBe('CAT_BXNNY_123')
    expect(insertCall.avatarUrl).toBeNull() // no file uploaded
    expect(saveAvatarMock).not.toHaveBeenCalled()
    expect(revalidateMock).toHaveBeenCalledWith('/artist')
    expect(revalidateMock).toHaveBeenCalledWith('/artist/bxnny.arts')
    expect(redirectMock).toHaveBeenCalledWith('/admin/artists')
  })

  it('returns validation error when slug has invalid chars (uppercase + underscore)', async () => {
    const action = await loadCreateAction()
    const result = await action(undefined, buildFormData({ slug: 'Bad_Slug' }))
    expect(result?.error).toBeDefined()
    expect(result?.error?.fields?.slug).toMatch(/lowercase/)
    expect(createArtistMock).not.toHaveBeenCalled()
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('returns validation error when displayName is empty', async () => {
    const action = await loadCreateAction()
    const result = await action(undefined, buildFormData({ displayName: '' }))
    expect(result?.error).toBeDefined()
    expect(result?.error?.fields?.displayName).toBeTruthy()
    expect(createArtistMock).not.toHaveBeenCalled()
  })

  it('returns validation error when squareCategoryId is empty', async () => {
    const action = await loadCreateAction()
    const result = await action(undefined, buildFormData({ squareCategoryId: '' }))
    expect(result?.error).toBeDefined()
    expect(result?.error?.fields?.squareCategoryId).toBeTruthy()
    expect(createArtistMock).not.toHaveBeenCalled()
  })

  it('returns validation error when commissionRate is out of range', async () => {
    const action = await loadCreateAction()
    const result = await action(undefined, buildFormData({ commissionRate: '1.5' }))
    expect(result?.error).toBeDefined()
    expect(result?.error?.fields?.commissionRate).toMatch(/between 0 and 1/i)
    expect(createArtistMock).not.toHaveBeenCalled()
  })

  it('returns validation error when an instagram URL is malformed', async () => {
    const action = await loadCreateAction()
    const result = await action(undefined, buildFormData({ instagram: 'not-a-url' }))
    expect(result?.error).toBeDefined()
    expect(result?.error?.fields?.instagram).toBeTruthy()
    expect(createArtistMock).not.toHaveBeenCalled()
  })

  it('surfaces a friendly error when the DB throws a unique-slug violation', async () => {
    createArtistMock.mockRejectedValue(
      Object.assign(
        new Error('duplicate key value violates unique constraint "artists_slug_unique"'),
        {
          code: '23505'
        }
      )
    )
    const action = await loadCreateAction()
    const result = await action(undefined, buildFormData())
    expect(result?.error?.fields?.slug).toMatch(/already in use/i)
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('uploads avatar via saveAvatar when an avatarFile is provided', async () => {
    createArtistMock.mockResolvedValue({ slug: 'bxnny.arts' })
    saveAvatarMock.mockResolvedValue('/images/artists/bxnny.arts.webp')

    const fd = buildFormData()
    const file = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' })
    fd.set('avatarFile', file)

    const action = await loadCreateAction()
    await expect(action(undefined, fd)).rejects.toThrow('__REDIRECT__:/admin/artists')

    expect(saveAvatarMock).toHaveBeenCalledTimes(1)
    expect(saveAvatarMock).toHaveBeenCalledWith(file, 'bxnny.arts')
    const insertCall = createArtistMock.mock.calls[0][0]
    expect(insertCall.avatarUrl).toBe('/images/artists/bxnny.arts.webp')
  })

  it('surfaces a friendly error when avatar validation fails', async () => {
    const { AvatarValidationError } = await import('@/lib/images/upload')
    saveAvatarMock.mockRejectedValue(new AvatarValidationError('File too big'))

    const fd = buildFormData()
    const file = new File([new Uint8Array([1])], 'huge.png', { type: 'image/png' })
    fd.set('avatarFile', file)

    const action = await loadCreateAction()
    const result = await action(undefined, fd)
    expect(result?.error?.fields?.avatarFile).toBe('File too big')
    expect(createArtistMock).not.toHaveBeenCalled()
  })
})

describe('updateArtistAction', () => {
  const ID = 'uuid-existing'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('happy path: validates, calls updateArtist, revalidates, redirects', async () => {
    updateArtistMock.mockResolvedValue({ id: ID, slug: 'bxnny.arts' })
    const action = await loadUpdateAction()
    await expect(action(ID, undefined, buildFormData({ bio: 'updated bio' }))).rejects.toThrow(
      '__REDIRECT__:/admin/artists'
    )

    expect(updateArtistMock).toHaveBeenCalledTimes(1)
    const [id, patch] = updateArtistMock.mock.calls[0]
    expect(id).toBe(ID)
    expect(patch.bio).toBe('updated bio')
    // No avatar upload -> avatarUrl key absent from the patch
    expect(patch).not.toHaveProperty('avatarUrl')
    expect(revalidateMock).toHaveBeenCalledWith('/artist')
    expect(revalidateMock).toHaveBeenCalledWith('/artist/bxnny.arts')
    expect(redirectMock).toHaveBeenCalledWith('/admin/artists')
  })

  it('rejects commissionRate=1.5 with a per-field error', async () => {
    const action = await loadUpdateAction()
    const result = await action(ID, undefined, buildFormData({ commissionRate: '1.5' }))
    expect(result?.error?.fields?.commissionRate).toMatch(/between 0 and 1/i)
    expect(updateArtistMock).not.toHaveBeenCalled()
  })

  it('passes the new status through when the operator flips active <-> inactive', async () => {
    updateArtistMock.mockResolvedValue({ id: ID, slug: 'bxnny.arts' })
    const action = await loadUpdateAction()
    await expect(action(ID, undefined, buildFormData({ status: 'inactive' }))).rejects.toThrow(
      '__REDIRECT__:/admin/artists'
    )
    const [, patch] = updateArtistMock.mock.calls[0]
    expect(patch.status).toBe('inactive')
  })

  it('injects the new avatarUrl into the patch when a file is uploaded', async () => {
    updateArtistMock.mockResolvedValue({ id: ID, slug: 'bxnny.arts' })
    saveAvatarMock.mockResolvedValue('/images/artists/bxnny.arts.webp')

    const fd = buildFormData()
    const file = new File([new Uint8Array([1, 2])], 'a.png', { type: 'image/png' })
    fd.set('avatarFile', file)

    const action = await loadUpdateAction()
    await expect(action(ID, undefined, fd)).rejects.toThrow('__REDIRECT__:/admin/artists')

    const [, patch] = updateArtistMock.mock.calls[0]
    expect(patch.avatarUrl).toBe('/images/artists/bxnny.arts.webp')
  })

  it('omits avatarUrl from the patch when no file is uploaded (preserves existing avatar)', async () => {
    updateArtistMock.mockResolvedValue({ id: ID, slug: 'bxnny.arts' })
    const action = await loadUpdateAction()
    await expect(action(ID, undefined, buildFormData())).rejects.toThrow(
      '__REDIRECT__:/admin/artists'
    )
    const [, patch] = updateArtistMock.mock.calls[0]
    // Crucial: avatarUrl is NOT in the patch -> updateArtist won't
    // touch the column -> existing avatar URL survives the edit.
    expect(patch).not.toHaveProperty('avatarUrl')
  })

  it('surfaces a friendly error when DB reports unique-slug violation', async () => {
    updateArtistMock.mockRejectedValue(
      Object.assign(new Error('duplicate key value'), { code: '23505' })
    )
    const action = await loadUpdateAction()
    const result = await action(ID, undefined, buildFormData())
    expect(result?.error?.fields?.slug).toMatch(/already in use/i)
    expect(redirectMock).not.toHaveBeenCalled()
  })
})
