import { CartProvider } from '@/components/cart/CartProvider'
import { useCart } from '@/components/cart/useCart'
import { useCartHydration } from '@/components/cart/useCartHydration'
import { CART_STORAGE_KEY } from '@/lib/cart/storage'
import type { CachedProduct } from '@/lib/square/types'
import { act, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { makeEntry } from './helpers'

const fetchMock = vi.fn()
beforeEach(() => {
  localStorage.clear()
  global.fetch = fetchMock as unknown as typeof fetch
})
afterEach(() => {
  fetchMock.mockReset()
})

function product(id: string): CachedProduct {
  return {
    id,
    name: `Item ${id}`,
    description: null,
    descriptionHtml: null,
    variations: [],
    images: [],
    categoryIds: [],
    itemOptions: [],
    updatedAt: '2026-05-24T00:00:00Z'
  }
}

function Probe() {
  const { addItem } = useCart()
  const { products, isLoading, refresh } = useCartHydration()
  return (
    <div>
      <button
        type="button"
        onClick={() => addItem({ catalogItemId: 'A', variationId: 'V', quantity: 1 })}
      >
        add A
      </button>
      <button
        type="button"
        onClick={() => addItem({ catalogItemId: 'B', variationId: 'V', quantity: 1 })}
      >
        add B
      </button>
      <button type="button" onClick={refresh}>
        refresh
      </button>
      <span data-testid="loading">{isLoading ? 'yes' : 'no'}</span>
      <span data-testid="keys">{Object.keys(products).sort().join(',')}</span>
    </div>
  )
}

function Wrapper({ children }: { children: ReactNode }) {
  return <CartProvider>{children}</CartProvider>
}

describe('useCartHydration', () => {
  it('does not fetch when cart is empty', async () => {
    render(<Probe />, { wrapper: Wrapper })
    // Allow the hydrate-effect microtask to run.
    await waitFor(() => expect(screen.getByTestId('keys')).toHaveTextContent(''))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs deduped ids to /api/cart/hydrate when items appear', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ products: { A: product('A') } }), { status: 200 })
    )
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([makeEntry({ catalogItemId: 'A' })]))
    render(<Probe />, { wrapper: Wrapper })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/cart/hydrate')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ ids: ['A'] })
  })

  it('updates products when fetch resolves', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ products: { A: product('A') } }), { status: 200 })
    )
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([makeEntry({ catalogItemId: 'A' })]))
    render(<Probe />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getByTestId('keys')).toHaveTextContent('A'))
  })

  it('treats fetch error as all-null products map', async () => {
    fetchMock.mockRejectedValue(new Error('network'))
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([
        makeEntry({ catalogItemId: 'A' }),
        makeEntry({ catalogItemId: 'B', variationId: 'V2' })
      ])
    )
    render(<Probe />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getByTestId('keys')).toHaveTextContent('A,B'))
  })

  it('refresh() triggers a new fetch even when ids unchanged', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ products: { A: product('A') } }), { status: 200 })
    )
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([makeEntry({ catalogItemId: 'A' })]))
    render(<Probe />, { wrapper: Wrapper })
    // The provider mounts <CartDrawer> which itself calls useCartHydration,
    // so initial render produces ≥1 fetch (Probe + CartDrawer). Capture the
    // baseline count once initial fetches have settled.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const baseline = fetchMock.mock.calls.length
    act(() => {
      screen.getByText('refresh').click()
    })
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(baseline))
  })
})
