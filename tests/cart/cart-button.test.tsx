import { CartButton } from '@/components/cart/CartButton'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { makeEntry, renderWithCart } from './helpers'

describe('<CartButton>', () => {
  it('hides badge before hydration', () => {
    renderWithCart(<CartButton />)
    // Pre-hydration: no count rendered.
    expect(screen.queryByTestId('cart-badge')).toBeNull()
  })

  it('renders count badge after hydration with items', async () => {
    renderWithCart(<CartButton />, {
      initialItems: [makeEntry({ quantity: 3 })]
    })
    const badge = await screen.findByTestId('cart-badge')
    expect(badge).toHaveTextContent('3')
  })

  it('renders "99+" when count exceeds 99', async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      makeEntry({ catalogItemId: `I_${i}`, quantity: 4 })
    )
    renderWithCart(<CartButton />, { initialItems: many })
    const badge = await screen.findByTestId('cart-badge')
    expect(badge).toHaveTextContent('99+')
  })

  it('aria-label includes the count', async () => {
    renderWithCart(<CartButton />, {
      initialItems: [makeEntry({ quantity: 2 })]
    })
    await waitFor(() => {
      // CartProvider also renders <CartDrawer> which exposes a "Close cart"
      // button. Scope the assertion to the open-cart button by name match.
      expect(screen.getByRole('button', { name: /open cart \(2 items\)/i })).toBeInTheDocument()
    })
  })

  it('clicking opens the drawer (probed via aria-label "Close cart")', async () => {
    renderWithCart(<CartButton />, { initialItems: [] })
    fireEvent.click(screen.getByRole('button', { name: /open cart/i }))
    // CartProvider renders <CartDrawer> automatically; once open, the Close
    // button (aria-label "Close cart") becomes findable.
    await screen.findByRole('button', { name: /close cart/i })
  })
})
