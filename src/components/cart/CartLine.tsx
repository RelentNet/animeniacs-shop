'use client'

import type { CartEntry } from '@/lib/cart/types'
import type { CachedProduct, CachedVariation } from '@/lib/square/types'
import Image from 'next/image'
import { useCart } from './useCart'

interface CartLineProps {
  entry: CartEntry
  /** undefined while initial hydration is in flight. null when hydration failed
   *  (item archived or network error). */
  product: CachedProduct | null | undefined
  isHydrating: boolean
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function CartLine({ entry, product, isHydrating }: CartLineProps): JSX.Element {
  const { removeItem, setQuantity } = useCart()

  if (isHydrating && product === undefined) {
    return (
      <li data-testid="cart-line-skeleton" className="flex gap-3 py-3">
        <div className="h-16 w-16 shrink-0 animate-pulse rounded bg-wall-2 motion-reduce:animate-none" />
        <div className="flex-1">
          <div className="mb-1.5 h-3.5 w-2/3 animate-pulse rounded bg-wall-2 motion-reduce:animate-none" />
          <div className="h-3 w-2/5 animate-pulse rounded bg-wall-2 motion-reduce:animate-none" />
        </div>
      </li>
    )
  }

  const variation: CachedVariation | undefined = product?.variations.find(
    (v) => v.id === entry.variationId
  )
  const isStale = !product || !variation

  if (isStale) {
    return (
      <li className="flex items-center gap-3 border-b border-line py-3 opacity-70">
        <div className="h-16 w-16 shrink-0 rounded bg-wall-2" aria-hidden="true" />
        <div className="flex-1">
          <div className="font-medium text-bone">{product?.name ?? 'Item'}</div>
          <div className="text-sm text-red-300">No longer available</div>
        </div>
        <button
          type="button"
          aria-label="Remove from cart"
          onClick={() => removeItem(entry.catalogItemId, entry.variationId)}
          className="text-sm text-muted transition-colors hover:text-neon"
        >
          Remove
        </button>
      </li>
    )
  }

  const unitCents = variation.price?.amount ?? 0
  const lineCents = unitCents * entry.quantity

  return (
    <li className="flex gap-3 border-b border-line py-3">
      {product.images[0] ? (
        <Image
          src={product.images[0]}
          alt={product.name}
          width={64}
          height={64}
          draggable={false}
          className="h-16 w-16 shrink-0 select-none rounded border border-line object-cover"
        />
      ) : (
        <div className="h-16 w-16 shrink-0 rounded bg-wall-2" aria-hidden="true" />
      )}

      <div className="grid flex-1 gap-1">
        <div className="font-medium text-bone">{product.name}</div>
        <div className="text-sm text-muted">{variation.name}</div>
        <div className="text-sm text-muted">{formatCents(unitCents)} each</div>
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQuantity(entry.catalogItemId, entry.variationId, entry.quantity - 1)}
            className="flex h-7 w-7 items-center justify-center rounded border border-line-strong text-bone transition-colors hover:border-neon hover:text-neon"
          >
            −
          </button>
          <label
            htmlFor={`qty-${entry.catalogItemId}-${entry.variationId}`}
            className="sr-only"
          >
            Quantity
          </label>
          <input
            id={`qty-${entry.catalogItemId}-${entry.variationId}`}
            aria-label="Quantity"
            type="number"
            min={1}
            value={entry.quantity}
            readOnly
            className="w-12 rounded border border-line bg-ink py-1 text-center text-bone"
          />
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQuantity(entry.catalogItemId, entry.variationId, entry.quantity + 1)}
            className="flex h-7 w-7 items-center justify-center rounded border border-line-strong text-bone transition-colors hover:border-neon hover:text-neon"
          >
            +
          </button>
        </div>
      </div>

      <div className="grid justify-items-end gap-2">
        <div className="font-mono font-semibold text-bone">{formatCents(lineCents)}</div>
        <button
          type="button"
          aria-label="Remove from cart"
          onClick={() => removeItem(entry.catalogItemId, entry.variationId)}
          className="text-sm text-muted transition-colors hover:text-neon"
        >
          Remove
        </button>
      </div>
    </li>
  )
}
