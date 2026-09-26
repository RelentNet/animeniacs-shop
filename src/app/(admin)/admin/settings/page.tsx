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
    <div>
      <header>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-2 font-display text-3xl tracking-wide text-bone sm:text-4xl">Settings</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Storefront promo bar. Shown at the very top of every page when enabled. (Shipping moved to
          its own{' '}
          <a href="/admin/shipping" className="link-neon">
            Shipping
          </a>{' '}
          tab.)
        </p>
      </header>

      <h2 className="eyebrow mt-6 text-purple-soft">Promo bar</h2>
      <div className="mt-3">
        <PromoBarSettingsForm action={savePromoBarAction} initial={initial} />
      </div>
    </div>
  )
}
