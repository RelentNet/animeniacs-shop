'use client'

import { useCart } from './useCart'

function CartIcon(): JSX.Element {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <title>Cart</title>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  )
}

export function CartButton(): JSX.Element {
  const { totalQuantity, isHydrated, openDrawer } = useCart()
  const displayCount = totalQuantity > 99 ? '99+' : String(totalQuantity)
  const ariaCount = isHydrated ? totalQuantity : 0

  return (
    <button
      type="button"
      aria-label={`Open cart (${ariaCount} items)`}
      onClick={openDrawer}
      style={{
        position: 'relative',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '0.5rem',
        display: 'inline-flex',
        alignItems: 'center'
      }}
    >
      <CartIcon />
      {isHydrated && totalQuantity > 0 && (
        <span
          data-testid="cart-badge"
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            background: '#a33',
            color: 'white',
            borderRadius: '999px',
            fontSize: '0.7em',
            minWidth: '1.25rem',
            padding: '0 0.25rem',
            textAlign: 'center'
          }}
        >
          {displayCount}
        </span>
      )}
    </button>
  )
}
