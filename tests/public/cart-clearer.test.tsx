import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockClear = vi.fn()

vi.mock('@/components/cart/useCart', () => ({
  useCart: () => ({ clear: mockClear })
}))

// Import AFTER mock is set up
const { CartClearer } = await import('@/components/cart/CartClearer')

describe('CartClearer', () => {
  beforeEach(() => {
    mockClear.mockReset()
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('calls clear() on mount with a cartId', () => {
    render(<CartClearer cartId="cart-abc-123" />)
    expect(mockClear).toHaveBeenCalledTimes(1)
  })

  it('does NOT call clear() again on re-render with the same cartId', () => {
    const { rerender } = render(<CartClearer cartId="cart-abc-123" />)
    rerender(<CartClearer cartId="cart-abc-123" />)
    expect(mockClear).toHaveBeenCalledTimes(1)
  })

  it('does NOT call clear() when cartId is absent', () => {
    render(<CartClearer cartId={undefined} />)
    expect(mockClear).not.toHaveBeenCalled()
  })

  it('calls clear() again for a new cartId (different checkout)', () => {
    render(<CartClearer cartId="cart-abc-123" />)
    sessionStorage.clear()
    render(<CartClearer cartId="cart-xyz-999" />)
    expect(mockClear).toHaveBeenCalledTimes(2)
  })
})
