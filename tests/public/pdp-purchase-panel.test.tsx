import { PdpPurchasePanel } from '@/components/product/PdpPurchasePanel'
import type { CachedItemOption, CachedVariation } from '@/lib/square/types'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { renderWithCart } from '../cart/helpers'

const SIZE: CachedItemOption = {
  id: 'OPT_SIZE',
  name: 'Size',
  values: [
    { id: 'S', name: 'Small' },
    { id: 'M', name: 'Medium' }
  ]
}
const VARIATIONS: CachedVariation[] = [
  {
    id: 'V_S',
    name: 'Small',
    price: { amount: 2500, currency: 'USD' },
    sku: null,
    optionValueIds: ['S']
  },
  {
    id: 'V_M',
    name: 'Medium',
    price: { amount: 3500, currency: 'USD' },
    sku: null,
    optionValueIds: ['M']
  }
]

describe('<PdpPurchasePanel>', () => {
  it('renders the initial variation price', () => {
    renderWithCart(
      <PdpPurchasePanel
        productId="P1"
        variations={VARIATIONS}
        itemOptions={[SIZE]}
        productionTimeText="Ships in 3-10 days."
      />
    )
    expect(screen.getByText('$25.00')).toBeInTheDocument()
  })

  it('updates price when variation changes', () => {
    renderWithCart(
      <PdpPurchasePanel
        productId="P1"
        variations={VARIATIONS}
        itemOptions={[SIZE]}
        productionTimeText="Ships in 3-10 days."
      />
    )
    fireEvent.change(screen.getByLabelText('Size'), { target: { value: 'M' } })
    expect(screen.getByText('$35.00')).toBeInTheDocument()
  })

  it('renders the production time text', () => {
    renderWithCart(
      <PdpPurchasePanel
        productId="P1"
        variations={VARIATIONS}
        itemOptions={[SIZE]}
        productionTimeText="Ships in 3-10 days."
      />
    )
    expect(screen.getByText('Ships in 3-10 days.')).toBeInTheDocument()
  })

  it('Add-to-Cart button is enabled when a variation is selected', () => {
    renderWithCart(
      <PdpPurchasePanel
        productId="P1"
        variations={VARIATIONS}
        itemOptions={[SIZE]}
        productionTimeText="x"
      />
    )
    expect(screen.getByRole('button', { name: /add to cart/i })).not.toBeDisabled()
  })

  it('clicking Add to Cart adds the line and opens the drawer', () => {
    renderWithCart(
      <PdpPurchasePanel
        productId="P1"
        variations={VARIATIONS}
        itemOptions={[SIZE]}
        productionTimeText="x"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }))
    // The provider mounts <CartDrawer> automatically, so the drawer dialog
    // becomes findable after the click.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('Add-to-Cart is disabled when picker resolves to no variation', () => {
    const VS: CachedVariation[] = [
      {
        id: 'V_S_AC',
        name: 'S/AC',
        price: { amount: 100, currency: 'USD' },
        sku: null,
        optionValueIds: ['S', 'AC']
      },
      {
        id: 'V_M_AC',
        name: 'M/AC',
        price: { amount: 200, currency: 'USD' },
        sku: null,
        optionValueIds: ['M', 'AC']
      }
    ]
    const SIZE2: CachedItemOption = {
      id: 'OPT_SIZE',
      name: 'Size',
      values: [
        { id: 'S', name: 'S' },
        { id: 'M', name: 'M' }
      ]
    }
    const MEDIA: CachedItemOption = {
      id: 'OPT_MEDIA',
      name: 'Media',
      values: [
        { id: 'AC', name: 'Acrylic' },
        { id: 'VI', name: 'Vinyl' }
      ]
    }
    renderWithCart(
      <PdpPurchasePanel
        productId="P1"
        variations={VS}
        itemOptions={[SIZE2, MEDIA]}
        productionTimeText="x"
      />
    )
    fireEvent.change(screen.getByLabelText('Media'), { target: { value: 'VI' } })
    expect(screen.getByText(/combination unavailable/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add to cart/i })).toBeDisabled()
  })

  it('quantity stepper increments and decrements (cannot go below 1)', () => {
    renderWithCart(
      <PdpPurchasePanel
        productId="P1"
        variations={VARIATIONS}
        itemOptions={[SIZE]}
        productionTimeText="x"
      />
    )
    const qty = screen.getByLabelText('Quantity') as HTMLInputElement
    expect(qty.value).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: /increase quantity/i }))
    expect(qty.value).toBe('2')
    fireEvent.click(screen.getByRole('button', { name: /decrease quantity/i }))
    fireEvent.click(screen.getByRole('button', { name: /decrease quantity/i }))
    expect(qty.value).toBe('1')
  })
})
