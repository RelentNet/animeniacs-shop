import type { PromoBarValue } from '@/lib/db/queries/site-settings'
import { PromoBarValueSchema, getSetting } from '@/lib/db/queries/site-settings'
import { PromoBarSettingsForm } from './_components/PromoBarSettingsForm'
import { savePromoBarAction } from './actions'

export const metadata = {
  title: 'Settings — Animeniacs Admin'
}

export default async function SettingsPage(): Promise<JSX.Element> {
  const raw = await getSetting('promo_bar')
  const parsed = raw == null ? null : PromoBarValueSchema.safeParse(raw)
  const initial: PromoBarValue | null = parsed?.success ? parsed.data : null

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Settings</h1>
        <p style={{ color: '#555', marginTop: '0.5rem' }}>
          Storefront promo bar. Shown at the very top of every page when enabled.
        </p>
      </header>

      <h2 style={{ fontSize: '1.1rem' }}>Promo bar</h2>
      <PromoBarSettingsForm action={savePromoBarAction} initial={initial} />
    </div>
  )
}
