import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetPending = vi.fn()
const mockPublishReview = vi.fn()
const mockDeleteReview = vi.fn()
const mockRevalidatePath = vi.fn()

vi.mock('@/lib/db/queries/reviews', () => ({
  getPendingReviews: mockGetPending,
  publishReview: mockPublishReview,
  deleteReview: mockDeleteReview
}))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))

function review(over: Record<string, unknown> = {}) {
  return {
    id: 'r-9',
    productId: 'ITEM_A',
    userId: 'u3',
    rating: 4,
    title: 'Nice',
    body: 'A reasonably long review body that should appear in the moderation table.',
    authorName: 'Cleo',
    photoUrls: [],
    isVerifiedPurchase: false,
    isPublished: false,
    createdAt: new Date('2026-05-02T00:00:00Z'),
    updatedAt: new Date('2026-05-02T00:00:00Z'),
    ...over
  }
}

beforeEach(() => {
  mockGetPending.mockReset().mockResolvedValue([])
  mockPublishReview.mockReset().mockResolvedValue(undefined)
  mockDeleteReview.mockReset().mockResolvedValue(undefined)
  mockRevalidatePath.mockReset()
})

describe('/admin/reviews page', () => {
  it('lists each pending review with Publish and Delete controls', async () => {
    mockGetPending.mockResolvedValue([review()])
    const { default: ReviewsModerationPage } = await import('@/app/(admin)/admin/reviews/page')
    render(await ReviewsModerationPage())

    expect(screen.getByText('ITEM_A')).toBeInTheDocument()
    expect(screen.getByText('Cleo')).toBeInTheDocument()
    expect(screen.getByText(/Nice/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /publish/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('shows an empty state when there is nothing to moderate', async () => {
    mockGetPending.mockResolvedValue([])
    const { default: ReviewsModerationPage } = await import('@/app/(admin)/admin/reviews/page')
    render(await ReviewsModerationPage())

    expect(screen.getByText(/no reviews awaiting/i)).toBeInTheDocument()
  })
})

describe('moderation actions', () => {
  it('publishReviewAction publishes and revalidates the admin + product pages', async () => {
    const { publishReviewAction } = await import('@/app/(admin)/admin/reviews/actions')
    await publishReviewAction('r-9', 'ITEM_A')
    expect(mockPublishReview).toHaveBeenCalledWith('r-9')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/reviews')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/product/ITEM_A')
  })

  it('deleteReviewAction deletes and revalidates the admin page', async () => {
    const { deleteReviewAction } = await import('@/app/(admin)/admin/reviews/actions')
    await deleteReviewAction('r-9', 'ITEM_A')
    expect(mockDeleteReview).toHaveBeenCalledWith('r-9')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/reviews')
  })
})
