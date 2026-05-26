import { CartProvider } from '@/components/cart/CartProvider'
import { CART_STORAGE_KEY } from '@/lib/cart/storage'
import type { CartEntry } from '@/lib/cart/types'
import { type RenderOptions, render } from '@testing-library/react'
import type { ReactElement } from 'react'

/**
 * Render a UI tree inside a fresh <CartProvider>. Optional `initialItems`
 * pre-seeds localStorage so the provider hydrates with that cart.
 */
export function renderWithCart(
  ui: ReactElement,
  options?: { initialItems?: CartEntry[]; renderOptions?: Omit<RenderOptions, 'wrapper'> }
) {
  localStorage.clear()
  if (options?.initialItems && options.initialItems.length > 0) {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(options.initialItems))
  }
  return render(ui, {
    wrapper: ({ children }) => <CartProvider>{children}</CartProvider>,
    ...options?.renderOptions
  })
}

export function makeEntry(over: Partial<CartEntry> = {}): CartEntry {
  return {
    catalogItemId: 'ITEM_A',
    variationId: 'VAR_A',
    quantity: 1,
    addedAt: '2026-05-24T00:00:00.000Z',
    ...over
  }
}
