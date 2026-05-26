import { useCart } from '@/components/cart/useCart'
import { CART_STORAGE_KEY } from '@/lib/cart/storage'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { makeEntry, renderWithCart } from './helpers'

function Probe() {
  const cart = useCart()
  return (
    <div>
      <span data-testid="hydrated">{cart.isHydrated ? 'yes' : 'no'}</span>
      <span data-testid="count">{cart.totalQuantity}</span>
      <span data-testid="drawer">{cart.isDrawerOpen ? 'open' : 'closed'}</span>
      <button
        type="button"
        onClick={() => cart.addItem({ catalogItemId: 'X', variationId: 'V', quantity: 2 })}
      >
        add
      </button>
      <button type="button" onClick={cart.openDrawer}>
        open
      </button>
    </div>
  )
}

describe('<CartProvider>', () => {
  it('hydrates as empty when nothing is in localStorage', async () => {
    renderWithCart(<Probe />)
    // Hydration runs in a useEffect; wait for it via findByText.
    await screen.findByText('yes', { selector: '[data-testid="hydrated"]' })
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })

  it('hydrates with persisted items from localStorage', async () => {
    renderWithCart(<Probe />, { initialItems: [makeEntry({ quantity: 3 })] })
    await screen.findByText('yes', { selector: '[data-testid="hydrated"]' })
    expect(screen.getByTestId('count')).toHaveTextContent('3')
  })

  it('persists items to localStorage on add', async () => {
    renderWithCart(<Probe />)
    await screen.findByText('yes', { selector: '[data-testid="hydrated"]' })
    act(() => {
      screen.getByText('add').click()
    })
    const raw = localStorage.getItem(CART_STORAGE_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw ?? '[]')
    expect(parsed).toHaveLength(1)
    expect(parsed[0].quantity).toBe(2)
  })

  it('opens the drawer via openDrawer()', async () => {
    renderWithCart(<Probe />)
    await screen.findByText('yes', { selector: '[data-testid="hydrated"]' })
    act(() => {
      screen.getByText('open').click()
    })
    expect(screen.getByTestId('drawer')).toHaveTextContent('open')
  })

  it('re-hydrates when a storage event fires (cross-tab sync)', async () => {
    renderWithCart(<Probe />)
    await screen.findByText('yes', { selector: '[data-testid="hydrated"]' })
    act(() => {
      // Simulate another tab writing to the same key.
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([makeEntry({ quantity: 7 })]))
      window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY }))
    })
    expect(screen.getByTestId('count')).toHaveTextContent('7')
  })

  it('useCart() throws when used outside a CartProvider', () => {
    // Silence the expected React error logged to the console.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/CartProvider/)
    spy.mockRestore()
  })
})
