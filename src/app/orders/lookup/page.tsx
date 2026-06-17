import { LookupForm } from './LookupForm'

export const metadata = {
  title: 'Look up your order | Animeniacs',
  description: 'Find a past order using your email and order number.'
}

// No `force-dynamic` (Phase 16, spec §3): this page renders only static text
// and the client <LookupForm />. The DB read happens in lookupOrderAction (a
// server action), which runs dynamically regardless — the page itself can be
// statically prerendered.

export default function OrderLookupPage(): JSX.Element {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <p className="eyebrow">Order status</p>
      <h1 className="mt-2 font-display text-4xl tracking-wide text-bone sm:text-5xl">
        Look up your order
      </h1>
      <p className="mt-3 text-muted">
        Enter the email you used at checkout and your order number to view your order. You&apos;ll
        find the order number on your confirmation page and in your confirmation email.
      </p>
      <LookupForm />
    </main>
  )
}
