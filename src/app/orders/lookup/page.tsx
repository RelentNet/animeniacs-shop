import { LookupForm } from './LookupForm'

export const metadata = {
  title: 'Look up your order | Animeniacs',
  description: 'Find a past order using your email and order number.'
}

// The lookup action reads the DB at request time; keep this route dynamic.
export const dynamic = 'force-dynamic'

export default function OrderLookupPage(): JSX.Element {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold">Look up your order</h1>
      <p className="mt-3 text-gray-700">
        Enter the email you used at checkout and your order number to view your order. You&apos;ll
        find the order number on your confirmation page and in your confirmation email.
      </p>
      <LookupForm />
    </main>
  )
}
