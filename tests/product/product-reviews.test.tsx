import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetSummary = vi.fn()
const mockGetPublished = vi.fn()
const mockGetCurrentUser = vi.fn()
const mockGetUserReview = vi.fn()

vi.mock('@/lib/db/queries/reviews', () => ({
  getReviewSummary: mockGetSummary,
  getPublishedReviewsForProduct: mockGetPublished,
  getUserReviewForProduct: mockGetUserReview
}))
vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock('@/components/product/ReviewForm', () => ({
  ReviewForm: ({ productId }: { productId: string }) => (
    <div data-testid="review-form">form:{productId}</div>
  )
}))

function review(over: Record<string, unknown> = {}) {
  return {
    id: 'r-1',
    productId: 'ITEM_A',
    userId: 'u2',
    rating: 5,
    title: 'Excellent',
    body: 'Beautiful print',
    authorName: 'Bea',
    photoUrls: [],
    isVerifiedPurchase: true,
    isPublished: true,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    ...over
  }
}

beforeEach(() => {
  mockGetSummary.mockReset().mockResolvedValue({ count: 0, average: 0 })
  mockGetPublished.mockReset().mockResolvedValue([])
  mockGetCurrentUser.mockReset().mockResolvedValue({
    isAuthenticated: false,
    userId: null,
    email: null,
    name: null,
    roles: []
  })
  mockGetUserReview.mockReset().mockResolvedValue(undefined)
})

describe('ProductReviews', () => {
  it('renders the summary, the verified badge, photos, and the review body', async () => {
    mockGetSummary.mockResolvedValue({ count: 2, average: 4.5 })
    mockGetPublished.mockResolvedValue([
      review({ photoUrls: ['/images/uploads/review-photos/r-1-0.webp'] })
    ])

    const { ProductReviews } = await import('@/components/product/ProductReviews')
    render(await ProductReviews({ productId: 'ITEM_A' }))

    expect(screen.getByText(/2 review/i)).toBeInTheDocument()
    expect(screen.getByText('Beautiful print')).toBeInTheDocument()
    expect(screen.getByText('Bea')).toBeInTheDocument()
    expect(screen.getByText(/verified/i)).toBeInTheDocument()
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(1)
  })

  it('falls back to Anonymous when authorName is null', async () => {
    mockGetSummary.mockResolvedValue({ count: 1, average: 5 })
    mockGetPublished.mockResolvedValue([review({ authorName: null })])

    const { ProductReviews } = await import('@/components/product/ProductReviews')
    render(await ProductReviews({ productId: 'ITEM_A' }))

    expect(screen.getByText(/anonymous/i)).toBeInTheDocument()
  })

  it('shows an empty state when there are no reviews', async () => {
    const { ProductReviews } = await import('@/components/product/ProductReviews')
    render(await ProductReviews({ productId: 'ITEM_A' }))

    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument()
  })

  it('renders the review form for a signed-in user who has not reviewed', async () => {
    mockGetCurrentUser.mockResolvedValue({
      isAuthenticated: true,
      userId: 'u1',
      email: 'a@b.c',
      name: 'Ada',
      roles: []
    })
    mockGetUserReview.mockResolvedValue(undefined)

    const { ProductReviews } = await import('@/components/product/ProductReviews')
    render(await ProductReviews({ productId: 'ITEM_A' }))

    expect(screen.getByTestId('review-form')).toBeInTheDocument()
  })

  it('shows a "you reviewed this" note instead of the form when already reviewed', async () => {
    mockGetCurrentUser.mockResolvedValue({
      isAuthenticated: true,
      userId: 'u1',
      email: 'a@b.c',
      name: 'Ada',
      roles: []
    })
    mockGetUserReview.mockResolvedValue(review({ userId: 'u1' }))

    const { ProductReviews } = await import('@/components/product/ProductReviews')
    render(await ProductReviews({ productId: 'ITEM_A' }))

    expect(screen.queryByTestId('review-form')).not.toBeInTheDocument()
    expect(screen.getByText(/you reviewed this/i)).toBeInTheDocument()
  })
})
