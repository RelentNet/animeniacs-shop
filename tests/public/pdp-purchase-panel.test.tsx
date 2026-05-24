import { PdpPurchasePanel } from '@/components/product/PdpPurchasePanel'
import type { CachedItemOption, CachedVariation } from '@/lib/square/types'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

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
    render(
      <PdpPurchasePanel
        variations={VARIATIONS}
        itemOptions={[SIZE]}
        productionTimeText="Ships in 3-10 days."
      />
    )
    expect(screen.getByText('$25.00')).toBeInTheDocument()
  })

  it('updates price when variation changes', () => {
    render(
      <PdpPurchasePanel
        variations={VARIATIONS}
        itemOptions={[SIZE]}
        productionTimeText="Ships in 3-10 days."
      />
    )
    fireEvent.change(screen.getByLabelText(/size/i), { target: { value: 'M' } })
    expect(screen.getByText('$35.00')).toBeInTheDocument()
  })

  it('renders the production time text', () => {
    render(
      <PdpPurchasePanel
        variations={VARIATIONS}
        itemOptions={[SIZE]}
        productionTimeText="Ships in 3-10 days."
      />
    )
    expect(screen.getByText('Ships in 3-10 days.')).toBeInTheDocument()
  })

  it('Add-to-Cart button is disabled and has the launch tooltip', () => {
    render(
      <PdpPurchasePanel variations={VARIATIONS} itemOptions={[SIZE]} productionTimeText="x" />
    )
    const btn = screen.getByRole('button', { name: /add to cart/i })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', expect.stringMatching(/launching soon/i))
  })

  it('quantity stepper increments and decrements (cannot go below 1)', () => {
    render(
      <PdpPurchasePanel variations={VARIATIONS} itemOptions={[SIZE]} productionTimeText="x" />
    )
    const qty = screen.getByLabelText('Quantity') as HTMLInputElement
    expect(qty.value).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: /increase quantity/i }))
    expect(qty.value).toBe('2')
    fireEvent.click(screen.getByRole('button', { name: /decrease quantity/i }))
    fireEvent.click(screen.getByRole('button', { name: /decrease quantity/i }))
    expect(qty.value).toBe('1')
  })

  it('renders "Combination unavailable" when picker yields null', () => {
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
    render(
      <PdpPurchasePanel variations={VS} itemOptions={[SIZE2, MEDIA]} productionTimeText="x" />
    )
    fireEvent.change(screen.getByLabelText(/media/i), { target: { value: 'VI' } })
    expect(screen.getByText(/combination unavailable/i)).toBeInTheDocument()
  })
})
