import { afterEach, describe, expect, it, vi } from 'vitest'

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRevalidate = vi.fn()
const mockRedirect = vi.fn(() => {
  throw new Error('NEXT_REDIRECT')
})

vi.mock('@/lib/db/queries/ip-nicknames', async (importOriginal) => {
  const mod: typeof import('@/lib/db/queries/ip-nicknames') = await importOriginal()
  return {
    ...mod,
    createIpNickname: mockCreate,
    updateIpNickname: mockUpdate
  }
})
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidate }))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

function makeForm(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

afterEach(() => {
  mockCreate.mockReset()
  mockUpdate.mockReset()
  mockRevalidate.mockReset()
  mockRedirect.mockClear()
})

describe('createIpNicknameAction', () => {
  it('happy path: validates, creates, redirects', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'X', slug: 'naruto-ramen', nickname: 'Ramen Shop' })
    const { createIpNicknameAction } = await import('@/app/(admin)/admin/ip-nicknames/new/actions')
    const form = makeForm({
      slug: 'naruto-ramen',
      nickname: 'Ramen Shop',
      squareCategoryId: 'CAT_X',
      description: '',
      isPublic: 'true'
    })
    await expect(createIpNicknameAction(undefined, form)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockRevalidate).toHaveBeenCalledWith('/admin/ip-nicknames')
    expect(mockRevalidate).toHaveBeenCalledWith('/category/naruto-ramen')
    expect(mockRedirect).toHaveBeenCalledWith('/admin/ip-nicknames')
  })

  it('rejects invalid slug (uppercase) without hitting DB', async () => {
    const { createIpNicknameAction } = await import('@/app/(admin)/admin/ip-nicknames/new/actions')
    const form = makeForm({
      slug: 'BadSlug',
      nickname: 'Ramen',
      squareCategoryId: 'CAT_X',
      isPublic: 'true'
    })
    const result = await createIpNicknameAction(undefined, form)
    expect(result?.error?.fields?.slug).toBeDefined()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('translates unique slug violation to friendly field error', async () => {
    mockCreate.mockRejectedValueOnce({
      code: '23505',
      message: 'duplicate key value violates unique constraint "ip_nicknames_slug_unique"'
    })
    const { createIpNicknameAction } = await import('@/app/(admin)/admin/ip-nicknames/new/actions')
    const form = makeForm({
      slug: 'naruto-ramen',
      nickname: 'Ramen',
      squareCategoryId: 'CAT_X',
      isPublic: 'true'
    })
    const result = await createIpNicknameAction(undefined, form)
    expect(result?.error?.fields?.slug).toMatch(/already in use/i)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('translates unique square_category_id violation to friendly field error', async () => {
    mockCreate.mockRejectedValueOnce({
      code: '23505',
      message:
        'duplicate key value violates unique constraint "ip_nicknames_square_category_id_unique"'
    })
    const { createIpNicknameAction } = await import('@/app/(admin)/admin/ip-nicknames/new/actions')
    const form = makeForm({
      slug: 'naruto-ramen',
      nickname: 'Ramen',
      squareCategoryId: 'CAT_X',
      isPublic: 'true'
    })
    const result = await createIpNicknameAction(undefined, form)
    expect(result?.error?.fields?.squareCategoryId).toMatch(/already mapped/i)
  })
})

describe('updateIpNicknameAction', () => {
  it('happy path: validates, updates, redirects', async () => {
    mockUpdate.mockResolvedValueOnce({ id: 'X', slug: 'ramen-shop' })
    const { updateIpNicknameAction } = await import('@/app/(admin)/admin/ip-nicknames/[id]/actions')
    const form = makeForm({
      slug: 'ramen-shop',
      nickname: 'Ramen',
      squareCategoryId: 'CAT_X',
      isPublic: 'true'
    })
    await expect(updateIpNicknameAction('X', undefined, form)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockUpdate).toHaveBeenCalledWith('X', expect.any(Object))
    expect(mockRedirect).toHaveBeenCalledWith('/admin/ip-nicknames')
  })
})
