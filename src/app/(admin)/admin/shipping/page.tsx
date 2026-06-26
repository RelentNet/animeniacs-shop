import { getShippingSettings } from '@/lib/db/queries/shipping-settings'
import { ShippingSettingsForm } from './_components/ShippingSettingsForm'
import { saveShippingAction } from './actions'

export const metadata = {
  title: 'Shipping — Animeniacs Admin'
}

export default async function ShippingPage(): Promise<JSX.Element> {
  const shipping = await getShippingSettings()

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Shipping</h1>
        <p style={{ color: '#555', marginTop: '0.5rem' }}>
          Live Shippo carrier rates at checkout. Edit the origin, flat fees, markup, and the
          per-box packaging fees here. Changes apply within ~1 minute.
        </p>
      </header>

      <ShippingSettingsForm action={saveShippingAction} initial={shipping} />
    </div>
  )
}
