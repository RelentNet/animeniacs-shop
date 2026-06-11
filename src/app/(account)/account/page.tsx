import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getUserSquareCustomerId } from '@/lib/db/queries/user'
import { getSquareCustomer } from '@/lib/square/customers'
import type { Route } from 'next'
import Link from 'next/link'
import { AddressForm, type AddressFormInitial } from './_components/AddressForm'

export const metadata = {
  title: 'My Account | Animeniacs',
  description: 'Your account, orders, and saved shipping address.'
}

export default async function AccountPage(): Promise<JSX.Element> {
  const user = await getCurrentUser()
  const greetingName = user.name ?? user.email ?? 'there'

  // Resolve any existing Square customer address to pre-fill the form. A buyer
  // who never checked out has no customer_link yet → show an empty form.
  let addressInitial: AddressFormInitial = {}
  if (user.userId) {
    const squareCustomerId = await getUserSquareCustomerId(user.userId)
    if (squareCustomerId) {
      const customer = await getSquareCustomer(squareCustomerId)
      const addr = customer?.address
      if (addr) {
        addressInitial = {
          addressLine1: addr.addressLine1 ?? '',
          addressLine2: addr.addressLine2 ?? '',
          locality: addr.locality ?? '',
          administrativeDistrictLevel1: addr.administrativeDistrictLevel1 ?? '',
          postalCode: addr.postalCode ?? '',
          country: addr.country ?? 'US'
        }
      }
    }
  }

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
        <h2 className="text-xl font-semibold">Saved shipping address</h2>
        <p className="mt-1 text-gray-700">A saved address speeds up future checkouts.</p>
        <AddressForm initial={addressInitial} />
      </section>
    </div>
  )
}
