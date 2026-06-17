import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getAddresses } from '@/lib/db/queries/addresses'
import { claimGuestOrders } from '@/lib/db/queries/orders'
import type { Route } from 'next'
import Link from 'next/link'
import { SavedAddresses } from './_components/SavedAddresses'

export const metadata = {
  title: 'My Account | Animeniacs',
  description: 'Your account, orders, and saved shipping addresses.'
}

export default async function AccountPage(): Promise<JSX.Element> {
  const user = await getCurrentUser()
  const greetingName = user.name ?? user.email ?? 'there'

  // Post-login guest-order claiming (spec §7): attach any orders placed as a
  // guest with this account's email. Idempotent — only claims null-userId rows,
  // so re-running on every /account visit is safe.
  if (user.userId && user.email) {
    await claimGuestOrders(user.userId, user.email)
  }

  const addresses = user.userId ? await getAddresses(user.userId) : []

  return (
    <div>
      <p className="eyebrow">My account</p>
      <h1 className="mt-2 font-display text-4xl tracking-wide text-bone sm:text-5xl">
        Welcome, {greetingName}
      </h1>
      <p className="mt-2 text-muted">Manage your orders and shipping details.</p>

      <section className="mt-8 rounded-lg border border-line bg-wall p-6">
        <h2 className="font-display text-2xl tracking-wide text-bone">Order history</h2>
        <p className="mt-1 text-sm text-muted">View your past orders and their details.</p>
        <Link href={'/account/orders' as Route} className="btn-neon mt-4">
          View order history
        </Link>
      </section>

      <section className="mt-6 rounded-lg border border-line bg-wall p-6">
        <h2 className="font-display text-2xl tracking-wide text-bone">Saved shipping addresses</h2>
        <p className="mt-1 text-sm text-muted">
          Save addresses to speed up checkout. Your default address is prefilled at checkout.
        </p>
        <SavedAddresses addresses={addresses} />
      </section>
    </div>
  )
}
