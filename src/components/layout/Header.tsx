import { CartButton } from '@/components/cart/CartButton'
import type { Route } from 'next'
import Link from 'next/link'

export function Header() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-xl font-bold">
          Animeniacs
        </Link>
        <nav aria-label="Primary">
          <ul className="flex items-center gap-4 text-sm">
            <li>
              <Link href="/">Home</Link>
            </li>
            <li>
              <Link href={'/shop' as Route}>Shop</Link>
            </li>
            <li>
              <Link href={'/artist' as Route}>Artists</Link>
            </li>
            <li>
              <Link href={'/custom/acrylic' as Route}>Custom Acrylic</Link>
            </li>
            <li>
              <Link href={'/custom/stickers' as Route}>Custom Stickers</Link>
            </li>
            <li>
              <Link href={'/account' as Route}>Account</Link>
            </li>
            <li>
              <CartButton />
            </li>
          </ul>
        </nav>
      </div>
    </header>
  )
}
