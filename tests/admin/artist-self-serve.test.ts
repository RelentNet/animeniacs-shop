import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Fake DB: records inserts/updates made inside a transaction ----
const state = {
  before: {
    id: 'art-1',
    slug: 'bxnny',
    displayName: 'Bxnny',
    bio: 'old bio',
    website: null as string | null,
    paymentMethod: 'paypal' as string | null,
    paymentEmail: 'old@pay.com' as string | null,
    accountEmail: 'artist@example.com',
    commissionRate: '0.2000',
    status: 'active'
  } as Record<string, unknown>,
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>
}

function makeTx() {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.from = () => chain
  chain.where = () => chain
  chain.limit = async () => [state.before]
  chain.update = () => ({
    set: (v: Record<string, unknown>) => {
      state.updates.push(v)
      return {
        where: () =>
          Object.assign(Promise.resolve(undefined), { returning: async () => [state.before] })
      }
    }
  })
  chain.insert = () => ({
    values: async (rows: Array<Record<string, unknown>> | Record<string, unknown>) => {
      state.inserts.push(...(Array.isArray(rows) ? rows : [rows]))
    }
  })
  return chain
}
const tx = makeTx()
vi.mock('@/lib/db/client', () => ({
  db: { ...tx, transaction: (cb: (t: unknown) => unknown) => cb(tx) }
}))

const user = { current: { userId: 'u-1', email: 'artist@example.com', roles: [] as string[] } }
vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: async () => user.current }))

const linkedMock = vi.fn()
vi.mock('@/lib/db/queries/commissions', () => ({
  getArtistByAccountEmail: (...a: unknown[]) => linkedMock(...a)
}))

const notifyMock = vi.fn()
vi.mock('@/lib/notifications/artist-payment', () => ({
  notifyArtistPaymentChange: (...a: unknown[]) => notifyMock(...a)
}))
vi.mock('@/lib/images/upload', () => ({
  AvatarValidationError: class extends Error {},
  saveAvatar: vi.fn()
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  const base: Record<string, string> = {
    bio: 'old bio',
    website: '',
    paymentMethod: 'paypal',
    paymentEmail: 'old@pay.com'
  }
  for (const [k, v] of Object.entries({ ...base, ...fields })) fd.set(k, v)
  return fd
}

async function act(fd: FormData) {
  const { updateOwnProfileAction } = await import('@/app/(account)/account/profile/actions')
  return updateOwnProfileAction({}, fd)
}

beforeEach(() => {
  state.inserts.length = 0
  state.updates.length = 0
  notifyMock.mockReset()
  linkedMock.mockReset().mockResolvedValue({ id: 'art-1', displayName: 'Bxnny', payable: true })
  user.current = { userId: 'u-1', email: 'artist@example.com', roles: [] }
})

describe('artist self-serve profile action', () => {
  it.each([
    'displayName',
    'slug',
    'squareCategoryId',
    'status',
    'commissionRate',
    'accountEmail',
    'notes',
    'payable'
  ])('rejects admin-only field %s and changes nothing', async (field) => {
    const r = await act(form({ [field]: 'x' }))
    expect(r.error).toContain(field)
    expect(state.updates).toHaveLength(0)
    expect(state.inserts).toHaveLength(0)
  })

  it('rejects a form-supplied artist id and only ever uses the session-linked artist', async () => {
    const r = await act(form({ id: 'someone-else', artistId: 'someone-else' }))
    expect(r.error).toBeDefined()
    expect(state.updates).toHaveLength(0)
    await act(form({ bio: 'new' }))
    expect(linkedMock).toHaveBeenCalledWith('artist@example.com')
  })

  it('rejects users not linked to any artist', async () => {
    linkedMock.mockResolvedValue(null)
    const r = await act(form({ bio: 'new' }))
    expect(r.error).toMatch(/not linked/)
    expect(state.updates).toHaveLength(0)
  })

  it('writes one artist-sourced row per changed field, none for unchanged fields', async () => {
    await act(form({ bio: 'new bio', paymentEmail: 'new@pay.com' }))
    expect(state.inserts).toHaveLength(2)
    expect(state.inserts.map((r) => r.field).sort()).toEqual(['bio', 'paymentEmail'])
    for (const r of state.inserts) {
      expect(r.source).toBe('artist')
      expect(r.changedByEmail).toBe('artist@example.com')
      expect(r.changedByUserId).toBe('u-1')
    }
    const pe = state.inserts.find((r) => r.field === 'paymentEmail')
    expect(pe).toMatchObject({ oldValue: 'old@pay.com', newValue: 'new@pay.com' })
  })

  it('produces no rows and no update when nothing changed', async () => {
    const r = await act(form({}))
    expect(r.ok).toBe('Nothing changed.')
    expect(state.inserts).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('artist payment change sets the review flag and triggers alerts', async () => {
    await act(form({ paymentEmail: 'new@pay.com' }))
    expect(state.updates[0].paymentReviewPendingAt).toBeInstanceOf(Date)
    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock.mock.calls[0][0]).toMatchObject({
      artistName: 'Bxnny',
      accountEmail: 'artist@example.com'
    })
  })

  it('non-payment artist change sets no flag and sends no alert', async () => {
    await act(form({ bio: 'just a bio' }))
    expect(state.updates[0]).not.toHaveProperty('paymentReviewPendingAt')
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('alert failure does not block the save', async () => {
    notifyMock.mockRejectedValue(new Error('resend down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await act(form({ paymentMethod: 'venmo' }))
    expect(r.ok).toMatch(/Saved 1/)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('admin logging', () => {
  it('admin change is logged as source=admin and does NOT set the review flag', async () => {
    const { updateArtist } = await import('@/lib/db/queries/artists')
    await updateArtist(
      'art-1',
      { website: 'https://example.com', paymentEmail: 'admin-set@pay.com', bio: 'old bio' },
      { userId: 'u-admin', email: 'admin@example.com' }
    )
    expect(state.inserts.map((r) => r.field).sort()).toEqual(['paymentEmail', 'website'])
    expect(state.inserts.every((r) => r.source === 'admin')).toBe(true)
    expect(state.updates[0]).not.toHaveProperty('paymentReviewPendingAt')
  })

  it('markPaymentReviewed logs field payment_review as admin', async () => {
    const { markPaymentReviewed } = await import('@/lib/db/queries/artist-changes')
    await markPaymentReviewed('art-1', { userId: 'u-admin', email: 'admin@example.com' })
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({ field: 'payment_review', source: 'admin' })
  })
})
