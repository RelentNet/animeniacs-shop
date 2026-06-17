import { CartButton } from '@/components/cart/CartButton'
import type { Route } from 'next'
import Link from 'next/link'

/**
 * Compact nav wordmark. The full graffiti logo is too detailed to read at nav
 * size, so it headlines the hero instead; here we use a crisp text lockup with
 * the neon-accented "É" matching the mark.
 */
function Wordmark() {
  return (
    <Link
      href="/"
      aria-label="Animeniacs home"
      className="font-display text-3xl tracking-wide text-bone transition-colors hover:text-neon hover:no-underline"
    >
      ANIM<span className="neon-text">É</span>NIACS
    </Link>
  )
}

const NAV: { href: Route; label: string }[] = [
  { href: '/shop' as Route, label: 'Shop' },
  { href: '/artist' as Route, label: 'Artists' },
  { href: '/custom/acrylic' as Route, label: 'Custom Acrylic' },
  { href: '/custom/stickers' as Route, label: 'Custom Stickers' },
  { href: '/account' as Route, label: 'Account' }
]

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-3">
        <Wordmark />
        <nav aria-label="Primary">
          <ul className="flex items-center gap-6 text-sm font-medium">
            {NAV.map((item) => (
              <li key={item.href} className="hidden md:block">
                <Link href={item.href} className="link-neon">
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="text-bone">
              <CartButton />
            </li>
          </ul>
        </nav>
      </div>
    </header>
  )
}
