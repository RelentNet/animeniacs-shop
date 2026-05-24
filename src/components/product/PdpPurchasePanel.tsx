'use client'

import { VariantPicker } from '@/components/product/VariantPicker'
import { DISABLED_ADD_TO_CART_TOOLTIP } from '@/lib/site-copy'
import type { CachedItemOption, CachedVariation } from '@/lib/square/types'
import { useState } from 'react'

interface PdpPurchasePanelProps {
  variations: CachedVariation[]
  itemOptions: CachedItemOption[]
  productionTimeText: string
}

function formatPrice(v: CachedVariation | null): string {
  if (!v?.price) return ''
  return `$${(v.price.amount / 100).toFixed(2)}`
}

export function PdpPurchasePanel({
  variations,
  itemOptions,
  productionTimeText
}: PdpPurchasePanelProps): JSX.Element {
  const [selected, setSelected] = useState<CachedVariation | null>(variations[0] ?? null)
  const [qty, setQty] = useState(1)

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
        {selected ? formatPrice(selected) : <span>Combination unavailable</span>}
      </div>
      <p style={{ color: '#666', fontSize: '0.9rem' }}>{productionTimeText}</p>

      <VariantPicker variations={variations} itemOptions={itemOptions} onChange={setSelected} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <label htmlFor="qty" style={{ fontWeight: 600 }}>
          Quantity
        </label>
        <button
          type="button"
          aria-label="Decrease quantity"
          onClick={() => setQty((q) => Math.max(1, q - 1))}
        >
          −
        </button>
        <input
          id="qty"
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          style={{ width: '4rem', textAlign: 'center' }}
          readOnly
        />
        <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => q + 1)}>
          +
        </button>
      </div>

      <button
        type="button"
        disabled
        title={DISABLED_ADD_TO_CART_TOOLTIP}
        style={{
          padding: '0.75rem 1.5rem',
          background: '#ddd',
          color: '#555',
          border: 'none',
          borderRadius: '0.25rem',
          cursor: 'not-allowed'
        }}
      >
        Add to Cart
      </button>
      <small style={{ color: '#666' }}>{DISABLED_ADD_TO_CART_TOOLTIP}</small>
    </div>
  )
}
