import { VariantPicker } from '@/components/product/VariantPicker'
import type { CachedItemOption, CachedVariation } from '@/lib/square/types'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

const SIZE: CachedItemOption = {
  id: 'OPT_SIZE',
  name: 'Size',
  values: [
    { id: 'VAL_S', name: 'Small' },
    { id: 'VAL_M', name: 'Medium' }
  ]
}
const MEDIA: CachedItemOption = {
  id: 'OPT_MEDIA',
  name: 'Media',
  values: [
    { id: 'VAL_AC', name: 'Acrylic' },
    { id: 'VAL_VI', name: 'Vinyl' }
  ]
}

const VARIATIONS: CachedVariation[] = [
  {
    id: 'V_S_AC',
    name: 'Small / Acrylic',
    price: { amount: 2500, currency: 'USD' },
    sku: null,
    optionValueIds: ['VAL_S', 'VAL_AC']
  },
  {
    id: 'V_S_VI',
    name: 'Small / Vinyl',
    price: { amount: 2000, currency: 'USD' },
    sku: null,
    optionValueIds: ['VAL_S', 'VAL_VI']
  },
  {
    id: 'V_M_AC',
    name: 'Medium / Acrylic',
    price: { amount: 3000, currency: 'USD' },
    sku: null,
    optionValueIds: ['VAL_M', 'VAL_AC']
  }
  // Note: no Medium/Vinyl variation — picking that combo should yield onChange(null).
]

describe('<VariantPicker>', () => {
  it('renders one <select> per option axis with proper labels', () => {
    render(
      <VariantPicker variations={VARIATIONS} itemOptions={[SIZE, MEDIA]} onChange={() => {}} />
    )
    expect(screen.getByLabelText(/size/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/media/i)).toBeInTheDocument()
  })

  it('initial selection defaults to variations[0]', () => {
    const onChange = vi.fn()
    render(
      <VariantPicker variations={VARIATIONS} itemOptions={[SIZE, MEDIA]} onChange={onChange} />
    )
    // The component emits initial selection on mount.
    expect(onChange).toHaveBeenCalledWith(VARIATIONS[0])
  })

  it('changing a select resolves to the matching variation', () => {
    const onChange = vi.fn()
    render(
      <VariantPicker variations={VARIATIONS} itemOptions={[SIZE, MEDIA]} onChange={onChange} />
    )
    onChange.mockClear()
    fireEvent.change(screen.getByLabelText(/media/i), { target: { value: 'VAL_VI' } })
    expect(onChange).toHaveBeenLastCalledWith(VARIATIONS[1]) // Small / Vinyl
  })

  it('unmatched combination yields onChange(null)', () => {
    const onChange = vi.fn()
    render(
      <VariantPicker variations={VARIATIONS} itemOptions={[SIZE, MEDIA]} onChange={onChange} />
    )
    fireEvent.change(screen.getByLabelText(/size/i), { target: { value: 'VAL_M' } })
    fireEvent.change(screen.getByLabelText(/media/i), { target: { value: 'VAL_VI' } })
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('zero options + one variation renders nothing', () => {
    const single: CachedVariation[] = [
      {
        id: 'V1',
        name: 'Default',
        price: { amount: 1000, currency: 'USD' },
        sku: null,
        optionValueIds: []
      }
    ]
    const { container } = render(
      <VariantPicker variations={single} itemOptions={[]} onChange={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('zero options + multiple variations renders one select over variation names', () => {
    const multi: CachedVariation[] = [
      {
        id: 'A',
        name: 'Option A',
        price: { amount: 100, currency: 'USD' },
        sku: null,
        optionValueIds: []
      },
      {
        id: 'B',
        name: 'Option B',
        price: { amount: 200, currency: 'USD' },
        sku: null,
        optionValueIds: []
      }
    ]
    const onChange = vi.fn()
    render(<VariantPicker variations={multi} itemOptions={[]} onChange={onChange} />)
    expect(screen.getByLabelText(/variation/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/variation/i), { target: { value: 'B' } })
    expect(onChange).toHaveBeenLastCalledWith(multi[1])
  })

  it('initialVariationId pre-selects that variation', () => {
    const onChange = vi.fn()
    render(
      <VariantPicker
        variations={VARIATIONS}
        itemOptions={[SIZE, MEDIA]}
        onChange={onChange}
        initialVariationId="V_M_AC"
      />
    )
    expect(onChange).toHaveBeenCalledWith(VARIATIONS[2])
  })
})
