import { useCart } from '@/components/cart/useCart'
import type { CachedProduct } from '@/lib/square/types'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { makeEntry, renderWithCart } from './helpers'

const fetchMock = vi.fn()
beforeEach(() => {
  global.fetch = fetchMock as unknown as typeof fetch
})
afterEach(() => {
  fetchMock.mockReset()
})

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />
}))

function product(id: string, varId: string, name: string, priceCents: number): CachedProduct {
  return {
    id,
    name,
    description: null,
    descriptionHtml: null,
    variations: [
      {
        id: varId,
        name: 'Default',
        price: { amount: priceCents, currency: 'USD' },
        sku: null,
        optionValueIds: []
      }
    ],
    images: [`https://cdn.example/${id}.jpg`],
    categoryIds: [],
    itemOptions: [],
    updatedAt: '2026-05-24T00:00:00Z'
  }
}

function DrawerOpener() {
  const { openDrawer } = useCart()
  // CartProvider mounts <CartDrawer /> automatically — we only need the trigger.
  return (
    <button type="button" onClick={openDrawer}>
      open
    </button>
  )
}

describe('<CartDrawer>', () => {
  it('renders empty state when cart is empty', async () => {
    renderWithCart(<DrawerOpener />)
    fireEvent.click(screen.getByText('open'))
    await screen.findByRole('dialog')
    expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument()
  })

  it('renders lines for hydrated cart items', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          products: { A: product('A', 'V', 'Print A', 1500) }
        }),
        { status: 200 }
      )
    )
    renderWithCart(<DrawerOpener />, {
      initialItems: [makeEntry({ catalogItemId: 'A', variationId: 'V', quantity: 2 })]
    })
    fireEvent.click(screen.getByText('open'))
    await waitFor(() => expect(screen.getByText('Print A')).toBeInTheDocument())
    // Both line subtotal AND cart subtotal will read $30.00 (single line, qty 2).
    // Scope the cart subtotal assertion to its test id and confirm it matches.
    expect(screen.getByTestId('cart-subtotal')).toHaveTextContent('$30.00')
  })

  it('sums subtotal across multiple lines', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          products: {
            A: product('A', 'V', 'A', 1000),
            B: product('B', 'V', 'B', 2500)
          }
        }),
        { status: 200 }
      )
    )
    renderWithCart(<DrawerOpener />, {
      initialItems: [
        makeEntry({ catalogItemId: 'A', variationId: 'V', quantity: 1 }),
        makeEntry({ catalogItemId: 'B', variationId: 'V', quantity: 2 })
      ]
    })
    fireEvent.click(screen.getByText('open'))
    await waitFor(() => expect(screen.getByText(/subtotal/i)).toBeInTheDocument())
    // Subtotal: 1000 + 2500*2 = 6000c = $60.00. There are also line subtotals,
    // so we scope to the footer subtotal value via test id.
    expect(screen.getByTestId('cart-subtotal')).toHaveTextContent('$60.00')
  })

  it('renders trust badges in footer', async () => {
    renderWithCart(<DrawerOpener />)
    fireEvent.click(screen.getByText('open'))
    await screen.findByRole('dialog')
    expect(screen.getByText(/ships in 3-10 days/i)).toBeInTheDocument()
    expect(screen.getByText(/hanging strips/i)).toBeInTheDocument()
    expect(screen.getByText(/supports an independent artist/i)).toBeInTheDocument()
  })

  it('checkout button is disabled with launch tooltip', async () => {
    renderWithCart(<DrawerOpener />)
    fireEvent.click(screen.getByText('open'))
    await screen.findByRole('dialog')
    const btn = screen.getByRole('button', { name: /checkout/i })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', expect.stringMatching(/launching soon/i))
  })

  it('shows "No longer available" badge first time stale entry appears', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ products: { A: null } }), { status: 200 })
    )
    renderWithCart(<DrawerOpener />, {
      initialItems: [makeEntry({ catalogItemId: 'A', variationId: 'V', quantity: 1 })]
    })
    fireEvent.click(screen.getByText('open'))
    await waitFor(() => expect(screen.getByText(/no longer available/i)).toBeInTheDocument())
  })

  it('auto-strips stale entry on second drawer open', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ products: { A: null } }), { status: 200 })
    )
    renderWithCart(<DrawerOpener />, {
      initialItems: [makeEntry({ catalogItemId: 'A', variationId: 'V', quantity: 1 })]
    })
    // First open: warning shown.
    fireEvent.click(screen.getByText('open'))
    await waitFor(() => expect(screen.getByText(/no longer available/i)).toBeInTheDocument())
    // Close drawer (radix dialog handles Escape).
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Second open: line stripped.
    fireEvent.click(screen.getByText('open'))
    await screen.findByRole('dialog')
    await waitFor(() => expect(screen.queryByText(/no longer available/i)).toBeNull())
    expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument()
  })

  it('clicking remove on a line drops it from the cart', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ products: { A: product('A', 'V', 'A', 1000) } }), {
        status: 200
      })
    )
    renderWithCart(<DrawerOpener />, {
      initialItems: [makeEntry({ catalogItemId: 'A', variationId: 'V', quantity: 1 })]
    })
    fireEvent.click(screen.getByText('open'))
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /remove from cart/i }))
    await waitFor(() => expect(screen.queryByText(/^A$/)).toBeNull())
  })
})
