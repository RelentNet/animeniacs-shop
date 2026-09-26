'use client'

import { SignOutButton } from '@/components/auth/SignOutButton'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/artists', label: 'Artists' },
  { href: '/admin/commissions', label: 'Commissions' },
  { href: '/admin/ip-nicknames', label: 'IP nicknames' },
  { href: '/admin/sms-recipients', label: 'SMS recipients' },
  { href: '/admin/reviews', label: 'Reviews' },
  { href: '/admin/shipping', label: 'Shipping' },
  { href: '/admin/settings', label: 'Settings' }
]

/**
 * Admin tab bar. Same pattern as AccountNav (Street Gallery theme): purple
 * hairline rule, neon underline + glow on the active tab. Client component so
 * it can highlight the current section via the pathname.
 */
export function AdminNav(): JSX.Element {
  const pathname = usePathname()

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <nav aria-label="Admin" className="border-b border-line">
      <ul className="mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-4 text-sm font-medium">
        {TABS.map((tab) => {
          const active = isActive(tab.href)
          return (
            <li key={tab.href}>
              <a
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'relative -mb-px inline-block border-b-2 border-neon pb-3 text-bone neon-text hover:no-underline'
                    : 'relative -mb-px inline-block border-b-2 border-transparent pb-3 text-muted transition-colors hover:text-bone hover:no-underline'
                }
              >
                {tab.label}
              </a>
            </li>
          )
        })}
        <li className="ml-auto pb-3">
          <SignOutButton className="text-sm text-muted transition-colors hover:text-neon disabled:opacity-60" />
        </li>
      </ul>
    </nav>
  )
}
