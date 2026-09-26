import { getShippingSettings } from '@/lib/db/queries/shipping-settings'
import { ShippingSettingsForm } from './_components/ShippingSettingsForm'
import { saveShippingAction } from './actions'

export const metadata = {
  title: 'Shipping — Animeniacs Admin'
}

export default async function ShippingPage(): Promise<JSX.Element> {
  const shipping = await getShippingSettings()

  return (
    <div>
      <header>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-2 font-display text-3xl tracking-wide text-bone sm:text-4xl">Shipping</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Live Shippo carrier rates at checkout. Edit the origin, flat fees, markup, and the per-box
          packaging fees here. Changes apply within ~1 minute.
        </p>
      </header>

      <div className="mt-6">
        <ShippingSettingsForm action={saveShippingAction} initial={shipping} />
      </div>
    </div>
  )
}
