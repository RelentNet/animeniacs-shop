import { getOrderDashboardStats } from '@/lib/db/queries/orders'
import type { Route } from 'next'
import Link from 'next/link'

export const metadata = {
  title: 'Admin — Animeniacs'
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Admin landing page. The (admin) route group had feature pages
 * (artists, ip-nicknames, sms-recipients) but no index linking them
 * together, so operators had to know each URL by heart. This hub lists
 * every admin section.
 */

interface AdminSection {
  href: Route
  title: string
  description: string
}

const SECTIONS: AdminSection[] = [
  {
    href: '/admin/orders' as Route,
    title: 'Orders',
    description: 'View orders, issue refunds, and advance fulfillment.'
  },
  {
    href: '/admin/artists' as Route,
    title: 'Artists',
    description: 'Manage partner artists shown across the storefront.'
  },
  {
    href: '/admin/commissions' as Route,
    title: 'Commissions',
    description: 'Per-artist commission owed by month (both locations) — 20% of net sales.'
  },
  {
    href: '/admin/ip-nicknames' as Route,
    title: 'IP nicknames',
    description: 'Map Square categories to public-facing IP names and slugs.'
  },
  {
    href: '/admin/sms-recipients' as Route,
    title: 'SMS recipients',
    description: 'Phone numbers that receive transactional order SMS.'
  },
  {
    href: '/admin/reviews' as Route,
    title: 'Reviews',
    description: 'Moderate held product reviews — publish or delete.'
  },
  {
    href: '/admin/shipping' as Route,
    title: 'Shipping',
    description: 'Live carrier rates: origin, flat fees, markup, and per-box packaging fees.'
  },
  {
    href: '/admin/settings' as Route,
    title: 'Settings',
    description: 'Storefront promo bar and other site-wide settings.'
  }
]

export default async function AdminIndexPage(): Promise<JSX.Element> {
  const stats = await getOrderDashboardStats()

  return (
    <div>
      <p className="eyebrow">Internal tools</p>
      <h1 className="mt-2 font-display text-4xl tracking-wide text-bone sm:text-5xl">Admin</h1>
      <p className="mt-2 text-muted">Internal tools for managing the Animeniacs storefront.</p>

      <section
        aria-label="Order dashboard"
        className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6"
      >
        <Stat label="Orders today" value={String(stats.ordersToday)} />
        <Stat label="Orders (7d)" value={String(stats.orders7d)} />
        <Stat label="Orders (30d)" value={String(stats.orders30d)} />
        <Stat label="Revenue (30d)" value={formatCents(stats.revenue30dCents)} />
        <Stat label="Refunded (total)" value={formatCents(stats.refundedTotalCents)} />
        <Stat label="Needs fulfillment" value={String(stats.needsFulfillment)} />
      </section>

      <nav aria-label="Admin sections" className="mt-8">
        <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {SECTIONS.map((section) => (
            <li key={section.href}>
              <Link href={section.href} className="card-street block p-4 hover:no-underline">
                <span className="block font-semibold text-bone">{section.title}</span>
                <span className="mt-1 block text-sm text-muted">{section.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

/** Single read-only metric tile in the dashboard strip. */
function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="panel p-3">
      <span className="block text-sm text-muted">{label}</span>
      <span className="mt-1 block font-mono text-xl font-semibold text-bone">{value}</span>
    </div>
  )
}
