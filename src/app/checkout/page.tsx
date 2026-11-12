import { getShippingSettings } from '@/lib/db/queries/shipping-settings'
import { enabledCountryOptions } from '@/lib/shipping/countries'
import { CheckoutFlow } from './_components/CheckoutFlow'

export const metadata = {
  title: 'Checkout | Animeniacs'
}

// The country dropdown comes from the admin-managed shipping settings, so this
// page renders per request (never prerendered → no DB needed at build time).
export const dynamic = 'force-dynamic'

export default async function CheckoutPage(): Promise<JSX.Element> {
  const settings = await getShippingSettings()
  const countries = enabledCountryOptions(settings.countries)
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 md:py-24">
      <p className="eyebrow">Checkout</p>
      <h1 className="font-display mt-2 text-4xl text-bone md:text-5xl">Shipping &amp; payment</h1>
      <p className="mt-3 text-muted">
        Enter your shipping address to see live carrier rates, then continue to secure payment.
      </p>
      <CheckoutFlow countries={countries} />
    </main>
  )
}
