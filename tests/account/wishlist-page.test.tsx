import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetCurrentUser = vi.fn()
const mockGetWishlist = vi.fn()
const mockGetProductById = vi.fn()

vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock('@/lib/db/queries/wishlists', () => ({ getWishlist: mockGetWishlist }))
vi.mock('@/lib/products/cache', () => ({ getProductById: mockGetProductById }))
// The remove action is a server action; stub the module so the page imports cleanly.
vi.mock('@/app/(account)/account/wishlist/actions', () => ({
  removeWishlistItemAction: vi.fn()
}))

beforeEach(() => {
  mockGetCurrentUser.mockReset().mockResolvedValue({
    isAuthenticated: true,
    userId: 'u1',
    email: null,
    name: null,
    roles: []
  })
  mockGetWishlist.mockReset().mockResolvedValue([])
  mockGetProductById.mockReset().mockResolvedValue(null)
})

describe('/account/wishlist', () => {
  it('renders a card per wishlisted product with a link and remove control', async () => {
    mockGetWishlist.mockResolvedValue([
      { userId: 'u1', productId: 'ITEM_A', addedAt: new Date('2026-05-01') }
    ])
    mockGetProductById.mockResolvedValue({
      id: 'ITEM_A',
      name: 'Cool Poster',
      images: ['/images/p.webp'],
      variations: [],
      categoryIds: [],
      itemOptions: []
    })

    const { default: WishlistPage } = await import('@/app/(account)/account/wishlist/page')
    render(await WishlistPage())

    expect(screen.getByText('Cool Poster')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /cool poster/i })).toHaveAttribute(
      'href',
      '/product/ITEM_A'
    )
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
  })

  it('skips products that can no longer be resolved', async () => {
    mockGetWishlist.mockResolvedValue([
      { userId: 'u1', productId: 'GONE', addedAt: new Date('2026-05-01') }
    ])
    mockGetProductById.mockResolvedValue(null)

    const { default: WishlistPage } = await import('@/app/(account)/account/wishlist/page')
    render(await WishlistPage())

    // No card rendered → empty state shown.
    expect(screen.getByText(/wishlist is empty/i)).toBeInTheDocument()
  })

  it('shows an empty state when the wishlist has no items', async () => {
    mockGetWishlist.mockResolvedValue([])

    const { default: WishlistPage } = await import('@/app/(account)/account/wishlist/page')
    render(await WishlistPage())

    expect(screen.getByText(/wishlist is empty/i)).toBeInTheDocument()
  })
})
