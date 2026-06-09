import { CartButton } from '@/components/cart/CartButton'
import type { Route } from 'next'
import Link from 'next/link'

export function Header() {
  return (
    <header className="border-b border-gray-200 bg-white text-gray-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-xl font-bold text-gray-900 hover:no-underline">
          Animeniacs
        </Link>
        <nav aria-label="Primary">
          <ul className="flex items-center gap-4 text-sm text-gray-700">
            <li>
              <Link href="/" className="hover:text-gray-900">
                Home
              </Link>
            </li>
            <li>
              <Link href="/shop" className="hover:text-gray-900">
                Shop
              </Link>
            </li>
            <li>
              <Link href={'/artist' as Route} className="hover:text-gray-900">
                Artists
              </Link>
            </li>
            <li>
              <Link href={'/custom/acrylic' as Route} className="hover:text-gray-900">
                Custom Acrylic
              </Link>
            </li>
            <li>
              <Link href={'/custom/stickers' as Route} className="hover:text-gray-900">
                Custom Stickers
              </Link>
            </li>
            <li>
              <Link href={'/account' as Route} className="hover:text-gray-900">
                Account
              </Link>
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
