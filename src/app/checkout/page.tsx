import { CheckoutFlow } from './_components/CheckoutFlow'

export const metadata = {
  title: 'Checkout | Animeniacs'
}

export default function CheckoutPage(): JSX.Element {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 md:py-24">
      <p className="eyebrow">Checkout</p>
      <h1 className="font-display mt-2 text-4xl text-bone md:text-5xl">Shipping &amp; payment</h1>
      <p className="mt-3 text-muted">
        Enter your shipping address to see live carrier rates, then continue to secure payment.
      </p>
      <CheckoutFlow />
    </main>
  )
}
