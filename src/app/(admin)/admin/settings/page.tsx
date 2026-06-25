import { getShippingSettings } from '@/lib/db/queries/shipping-settings'
import type { PromoBarValue } from '@/lib/db/queries/site-settings'
import { PromoBarValueSchema, getSetting } from '@/lib/db/queries/site-settings'
import { PromoBarSettingsForm } from './_components/PromoBarSettingsForm'
import { ShippingSettingsForm } from './_components/ShippingSettingsForm'
import { savePromoBarAction, saveShippingAction } from './actions'

export const metadata = {
  title: 'Settings — Animeniacs Admin'
}

export default async function SettingsPage(): Promise<JSX.Element> {
  const raw = await getSetting('promo_bar')
  const parsed = raw == null ? null : PromoBarValueSchema.safeParse(raw)
  const initial: PromoBarValue | null = parsed?.success ? parsed.data : null
  const shipping = await getShippingSettings()

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Settings</h1>
        <p style={{ color: '#555', marginTop: '0.5rem' }}>
          Storefront promo bar + shipping (origin, fees, markup).
        </p>
      </header>

      <h2 style={{ fontSize: '1.1rem' }}>Promo bar</h2>
      <PromoBarSettingsForm action={savePromoBarAction} initial={initial} />

      <h2 style={{ fontSize: '1.1rem', marginTop: '2rem' }}>Shipping</h2>
      <p style={{ color: '#555', marginTop: '-0.25rem' }}>
        Live Shippo carrier rates at checkout. Edit the origin, flat fees, and markup here.
      </p>
      <ShippingSettingsForm action={saveShippingAction} initial={shipping} />
    </div>
  )
}
