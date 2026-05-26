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
      <li
        data-testid="cart-line-skeleton"
        style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 0' }}
      >
        <div style={{ width: 64, height: 64, background: '#eee', borderRadius: 4 }} />
        <div style={{ flex: 1 }}>
          <div
            style={{
              width: '70%',
              height: 14,
              background: '#eee',
              borderRadius: 2,
              marginBottom: 6
            }}
          />
          <div style={{ width: '40%', height: 12, background: '#eee', borderRadius: 2 }} />
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
      <li
        style={{
          display: 'flex',
          gap: '0.75rem',
          padding: '0.75rem 0',
          opacity: 0.6,
          borderBottom: '1px solid #eee'
        }}
      >
        <div
          style={{ width: 64, height: 64, background: '#eee', borderRadius: 4 }}
          aria-hidden="true"
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{product?.name ?? 'Item'}</div>
          <div style={{ color: '#a33', fontSize: '0.85em' }}>No longer available</div>
        </div>
        <button
          type="button"
          aria-label="Remove from cart"
          onClick={() => removeItem(entry.catalogItemId, entry.variationId)}
        >
          Remove
        </button>
      </li>
    )
  }

  const unitCents = variation.price?.amount ?? 0
  const lineCents = unitCents * entry.quantity

  return (
    <li
      style={{
        display: 'flex',
        gap: '0.75rem',
        padding: '0.75rem 0',
        borderBottom: '1px solid #eee'
      }}
    >
      {product.images[0] ? (
        <Image
          src={product.images[0]}
          alt={product.name}
          width={64}
          height={64}
          style={{ objectFit: 'cover', borderRadius: 4 }}
        />
      ) : (
        <div
          style={{ width: 64, height: 64, background: '#eee', borderRadius: 4 }}
          aria-hidden="true"
        />
      )}

      <div style={{ flex: 1, display: 'grid', gap: '0.25rem' }}>
        <div style={{ fontWeight: 600 }}>{product.name}</div>
        <div style={{ color: '#666', fontSize: '0.85em' }}>{variation.name}</div>
        <div style={{ color: '#666', fontSize: '0.85em' }}>{formatCents(unitCents)} each</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQuantity(entry.catalogItemId, entry.variationId, entry.quantity - 1)}
          >
            −
          </button>
          <label
            htmlFor={`qty-${entry.catalogItemId}-${entry.variationId}`}
            style={{ position: 'absolute', left: -9999 }}
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
            style={{ width: '3rem', textAlign: 'center' }}
          />
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQuantity(entry.catalogItemId, entry.variationId, entry.quantity + 1)}
          >
            +
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', justifyItems: 'end', gap: '0.5rem' }}>
        <div style={{ fontWeight: 600 }}>{formatCents(lineCents)}</div>
        <button
          type="button"
          aria-label="Remove from cart"
          onClick={() => removeItem(entry.catalogItemId, entry.variationId)}
        >
          Remove
        </button>
      </div>
    </li>
  )
}
