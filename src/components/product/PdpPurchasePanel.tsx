'use client'

import { useCart } from '@/components/cart/useCart'
import { VariantPicker } from '@/components/product/VariantPicker'
import type { CachedItemOption, CachedVariation } from '@/lib/square/types'
import { useState } from 'react'

interface PdpPurchasePanelProps {
  /** Square catalog item id — required so addItem can record the line. */
  productId: string
  variations: CachedVariation[]
  itemOptions: CachedItemOption[]
  productionTimeText: string
}

function formatPrice(v: CachedVariation | null): string {
  if (!v?.price) return ''
  return `$${(v.price.amount / 100).toFixed(2)}`
}

export function PdpPurchasePanel({
  productId,
  variations,
  itemOptions,
  productionTimeText
}: PdpPurchasePanelProps): JSX.Element {
  const [selected, setSelected] = useState<CachedVariation | null>(variations[0] ?? null)
  const [qty, setQty] = useState(1)
  const { addItem, openDrawer } = useCart()

  function handleAddToCart() {
    if (!selected) return
    addItem({
      catalogItemId: productId,
      variationId: selected.id,
      quantity: qty
    })
    openDrawer()
  }

  const stepperBtn =
    'flex h-9 w-9 items-center justify-center rounded-md border border-line bg-wall-2 text-lg text-bone transition hover:border-neon hover:text-neon'

  return (
    <div className="grid gap-4">
      <div className="font-mono text-3xl font-bold text-neon neon-text">
        {selected ? formatPrice(selected) : <span>Combination unavailable</span>}
      </div>
      <p className="text-sm text-muted">{productionTimeText}</p>

      <div className="text-bone [&_label]:mb-1 [&_label]:block [&_label]:text-xs [&_label]:font-medium [&_label]:uppercase [&_label]:tracking-wide [&_label]:text-muted [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-line [&_select]:bg-wall-2 [&_select]:px-3 [&_select]:py-2 [&_select]:text-bone">
        <VariantPicker variations={variations} itemOptions={itemOptions} onChange={setSelected} />
      </div>

      <div className="flex items-center gap-3">
        <label htmlFor="qty" className="text-xs font-medium uppercase tracking-wide text-muted">
          Quantity
        </label>
        <button
          type="button"
          aria-label="Decrease quantity"
          className={stepperBtn}
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
          className="w-14 rounded-md border border-line bg-wall-2 py-1.5 text-center font-mono text-bone"
          readOnly
        />
        <button
          type="button"
          aria-label="Increase quantity"
          className={stepperBtn}
          onClick={() => setQty((q) => q + 1)}
        >
          +
        </button>
      </div>

      <button
        type="button"
        onClick={handleAddToCart}
        disabled={!selected}
        className="btn-neon w-full justify-center text-base disabled:cursor-not-allowed disabled:opacity-50"
      >
        Add to Cart
      </button>
    </div>
  )
}
