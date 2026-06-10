import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockToggle = vi.fn()
const mockPush = vi.fn()

vi.mock('@/app/product/[id]/wishlist-actions', () => ({ toggleWishlistAction: mockToggle }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

beforeEach(() => {
  mockToggle.mockReset()
  mockPush.mockReset()
})

describe('WishlistButton', () => {
  it('reflects the initial wishlist state via aria-pressed', async () => {
    const { WishlistButton } = await import('@/components/product/WishlistButton')
    render(<WishlistButton productId="ITEM_A" inWishlist={true} />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveTextContent(/in your wishlist/i)
  })

  it('calls the toggle action and updates state on click', async () => {
    mockToggle.mockResolvedValue({ inWishlist: true })
    const { WishlistButton } = await import('@/components/product/WishlistButton')
    render(<WishlistButton productId="ITEM_A" inWishlist={false} />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(button)

    await waitFor(() => expect(mockToggle).toHaveBeenCalledWith('ITEM_A'))
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'))
  })

  it('routes anonymous users to sign-in', async () => {
    mockToggle.mockResolvedValue({ needsAuth: true })
    const { WishlistButton } = await import('@/components/product/WishlistButton')
    render(<WishlistButton productId="ITEM_A" inWishlist={false} />)

    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/sign-in'))
  })
})
