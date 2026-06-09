import { PromoBarValueSchema, getSetting } from '@/lib/db/queries/site-settings'

/**
 * Storefront promo bar. Server component. Reads the `promo_bar` setting
 * at request time. Renders nothing when missing, disabled, or invalid.
 * Inserted above <Header /> in the root layout.
 */
export async function PromoBar(): Promise<JSX.Element | null> {
  const raw = await getSetting('promo_bar')
  if (raw == null) return null

  const parsed = PromoBarValueSchema.safeParse(raw)
  if (!parsed.success) return null

  const v = parsed.data
  if (!v.enabled) return null

  const hasLink = typeof v.link === 'string' && v.link.length > 0

  return (
    <section
      aria-label="Promotions"
      style={{
        background: v.bgColor,
        color: v.textColor,
        textAlign: 'center',
        padding: '0.5rem 1rem',
        fontSize: '0.875rem'
      }}
    >
      {hasLink ? (
        <a href={v.link} style={{ color: v.textColor, textDecoration: 'underline' }}>
          {v.text}
        </a>
      ) : (
        <span>{v.text}</span>
      )}
    </section>
  )
}
