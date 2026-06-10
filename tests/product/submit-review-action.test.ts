import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetCurrentUser = vi.fn()
const mockFindPurchaseOrderId = vi.fn()
const mockCreateReview = vi.fn()
const mockSaveReviewPhoto = vi.fn()
const mockRevalidatePath = vi.fn()

class FakeAlreadyReviewedError extends Error {
  constructor() {
    super('dup')
    this.name = 'AlreadyReviewedError'
  }
}

vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock('@/lib/db/queries/orders', () => ({ findPurchaseOrderId: mockFindPurchaseOrderId }))
vi.mock('@/lib/db/queries/reviews', () => ({
  createReview: mockCreateReview,
  AlreadyReviewedError: FakeAlreadyReviewedError
}))
vi.mock('@/lib/images/upload', () => ({ saveReviewPhoto: mockSaveReviewPhoto }))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))

beforeEach(() => {
  mockGetCurrentUser.mockReset().mockResolvedValue({
    isAuthenticated: true,
    userId: 'u1',
    email: 'ada@example.com',
    name: 'Ada',
    roles: []
  })
  mockFindPurchaseOrderId.mockReset().mockResolvedValue(null)
  mockCreateReview.mockReset().mockResolvedValue({ id: 'r-1' })
  mockSaveReviewPhoto.mockReset().mockImplementation(async (_file, key) => `/images/uploads/review-photos/${key}.webp`)
  mockRevalidatePath.mockReset()
})

function makePhoto(type = 'image/png', size = 100): File {
  return new File([new Uint8Array(size)], 'p.png', { type })
}

function makeForm(over: Record<string, string> = {}, photos: File[] = []): FormData {
  const form = new FormData()
  form.set('productId', 'ITEM_A')
  form.set('rating', '5')
  form.set('title', 'Great print')
  form.set('body', 'Really happy with the quality.')
  for (const [k, v] of Object.entries(over)) form.set(k, v)
  for (const p of photos) form.append('photos', p)
  return form
}

describe('submitReviewAction', () => {
  it('rejects an anonymous user without writing', async () => {
    mockGetCurrentUser.mockResolvedValue({
      isAuthenticated: false,
      userId: null,
      email: null,
      name: null,
      roles: []
    })
    const { submitReviewAction } = await import('@/app/product/[id]/reviews/actions')
    const result = await submitReviewAction({}, makeForm())
    expect(result.error).toBe('auth')
    expect(mockCreateReview).not.toHaveBeenCalled()
  })

  it('auto-publishes a verified purchase with the order id stamped', async () => {
    mockFindPurchaseOrderId.mockResolvedValue('sq-99')
    const { submitReviewAction } = await import('@/app/product/[id]/reviews/actions')
    const result = await submitReviewAction({}, makeForm())

    expect(mockCreateReview).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'ITEM_A',
        userId: 'u1',
        orderId: 'sq-99',
        rating: 5,
        body: 'Really happy with the quality.',
        authorName: 'Ada',
        isVerifiedPurchase: true,
        isPublished: true
      })
    )
    expect(result.ok).toBe(true)
    expect(result.pending).toBe(false)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/product/ITEM_A')
  })

  it('holds a non-purchaser review as pending', async () => {
    mockFindPurchaseOrderId.mockResolvedValue(null)
    const { submitReviewAction } = await import('@/app/product/[id]/reviews/actions')
    const result = await submitReviewAction({}, makeForm())

    expect(mockCreateReview).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: null,
        isVerifiedPurchase: false,
        isPublished: false
      })
    )
    expect(result.ok).toBe(true)
    expect(result.pending).toBe(true)
  })

  it('uploads each photo and stores the resulting urls', async () => {
    const { submitReviewAction } = await import('@/app/product/[id]/reviews/actions')
    await submitReviewAction({}, makeForm({}, [makePhoto(), makePhoto()]))

    expect(mockSaveReviewPhoto).toHaveBeenCalledTimes(2)
    const arg = mockCreateReview.mock.calls[0][0]
    expect(arg.photoUrls).toHaveLength(2)
    expect(arg.photoUrls[0]).toMatch(/review-photos\/.+-0\.webp$/)
  })

  it('maps a duplicate to a friendly error', async () => {
    mockCreateReview.mockRejectedValue(new FakeAlreadyReviewedError())
    const { submitReviewAction } = await import('@/app/product/[id]/reviews/actions')
    const result = await submitReviewAction({}, makeForm())
    expect(result.error).toBe('duplicate')
  })

  it('rejects an out-of-range rating with a field error', async () => {
    const { submitReviewAction } = await import('@/app/product/[id]/reviews/actions')
    const result = await submitReviewAction({}, makeForm({ rating: '9' }))
    expect(result.fieldErrors?.rating).toBeTruthy()
    expect(mockCreateReview).not.toHaveBeenCalled()
  })

  it('rejects an empty body with a field error', async () => {
    const { submitReviewAction } = await import('@/app/product/[id]/reviews/actions')
    const result = await submitReviewAction({}, makeForm({ body: '   ' }))
    expect(result.fieldErrors?.body).toBeTruthy()
    expect(mockCreateReview).not.toHaveBeenCalled()
  })

  it('rejects more than four photos with a field error', async () => {
    const { submitReviewAction } = await import('@/app/product/[id]/reviews/actions')
    const photos = [makePhoto(), makePhoto(), makePhoto(), makePhoto(), makePhoto()]
    const result = await submitReviewAction({}, makeForm({}, photos))
    expect(result.fieldErrors?.photos).toBeTruthy()
    expect(mockCreateReview).not.toHaveBeenCalled()
  })
})
