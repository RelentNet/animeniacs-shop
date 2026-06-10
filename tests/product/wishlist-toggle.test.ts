import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetCurrentUser = vi.fn()
const mockIsInWishlist = vi.fn()
const mockAddToWishlist = vi.fn()
const mockRemoveFromWishlist = vi.fn()
const mockRevalidatePath = vi.fn()

vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock('@/lib/db/queries/wishlists', () => ({
  isInWishlist: mockIsInWishlist,
  addToWishlist: mockAddToWishlist,
  removeFromWishlist: mockRemoveFromWishlist
}))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))

beforeEach(() => {
  mockGetCurrentUser.mockReset().mockResolvedValue({
    isAuthenticated: true,
    userId: 'u1',
    email: null,
    name: null,
    roles: []
  })
  mockIsInWishlist.mockReset().mockResolvedValue(false)
  mockAddToWishlist.mockReset().mockResolvedValue(undefined)
  mockRemoveFromWishlist.mockReset().mockResolvedValue(undefined)
  mockRevalidatePath.mockReset()
})

describe('toggleWishlistAction', () => {
  it('signals needsAuth for an anonymous user without writing', async () => {
    mockGetCurrentUser.mockResolvedValue({
      isAuthenticated: false,
      userId: null,
      email: null,
      name: null,
      roles: []
    })
    const { toggleWishlistAction } = await import('@/app/product/[id]/wishlist-actions')
    const result = await toggleWishlistAction('ITEM_A')
    expect(result).toEqual({ needsAuth: true })
    expect(mockAddToWishlist).not.toHaveBeenCalled()
    expect(mockRemoveFromWishlist).not.toHaveBeenCalled()
  })

  it('adds the product when it is not already in the wishlist', async () => {
    mockIsInWishlist.mockResolvedValue(false)
    const { toggleWishlistAction } = await import('@/app/product/[id]/wishlist-actions')
    const result = await toggleWishlistAction('ITEM_A')
    expect(mockAddToWishlist).toHaveBeenCalledWith('u1', 'ITEM_A')
    expect(result).toEqual({ inWishlist: true })
    expect(mockRevalidatePath).toHaveBeenCalled()
  })

  it('removes the product when it is already in the wishlist', async () => {
    mockIsInWishlist.mockResolvedValue(true)
    const { toggleWishlistAction } = await import('@/app/product/[id]/wishlist-actions')
    const result = await toggleWishlistAction('ITEM_A')
    expect(mockRemoveFromWishlist).toHaveBeenCalledWith('u1', 'ITEM_A')
    expect(result).toEqual({ inWishlist: false })
    expect(mockRevalidatePath).toHaveBeenCalled()
  })
})
