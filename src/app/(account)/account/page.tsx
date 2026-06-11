import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getAddresses } from '@/lib/db/queries/addresses'
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
  const addresses = user.userId ? await getAddresses(user.userId) : []

  return (
    <div>
      <h1 className="text-3xl font-bold">Welcome, {greetingName}</h1>
      <p className="mt-2 text-gray-700">Manage your orders and shipping details.</p>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Order history</h2>
        <p className="mt-1 text-gray-700">View your past orders and their details.</p>
        <Link
          href={'/account/orders' as Route}
          className="mt-3 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          View order history
        </Link>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Saved shipping addresses</h2>
        <p className="mt-1 text-gray-700">
          Save addresses to speed up checkout. Your default address is prefilled at checkout.
        </p>
        <SavedAddresses addresses={addresses} />
      </section>
    </div>
  )
}
