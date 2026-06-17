import { ProductCard } from '@/components/product/ProductCard'
import { getProductsForIpNickname } from '@/lib/categories'
import { getIpNicknameBySlug } from '@/lib/db/queries/ip-nicknames'
import { getReviewSummariesForProducts } from '@/lib/db/queries/reviews'
import { notFound } from 'next/navigation'

interface PageProps {
  params: { slug: string }
}

// ISR (Phase 16, spec §3): public data only (no session read). On-demand —
// NO generateStaticParams, so the builder prerenders nothing and never hits
// the DB at build time; the first request renders with live data and caches
// for up to 5 minutes. Admin ip-nickname mutations revalidate `/category/[slug]`.
export const revalidate = 300

export async function generateMetadata({ params }: PageProps) {
  const nickname = await getIpNicknameBySlug(params.slug)
  if (!nickname || !nickname.isPublic) return { title: 'Not found | Animeniacs' }
  return {
    title: `${nickname.nickname} | Animeniacs`,
    description: nickname.description?.slice(0, 160) ?? `Drops featuring ${nickname.nickname}.`
  }
}

export default async function CategoryPage({ params }: PageProps): Promise<JSX.Element> {
  const nickname = await getIpNicknameBySlug(params.slug)
  if (!nickname || !nickname.isPublic) notFound()

  const products = await getProductsForIpNickname(nickname)
  const summaries = await getReviewSummariesForProducts(products.map((p) => p.id))

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <header
        className="hud scanlines mb-8 flex h-56 items-end overflow-hidden rounded-xl border border-line-strong p-8"
        style={{
          // Brand night-drive gradient until per-IP cover image uploads land.
          background: 'radial-gradient(120% 140% at 0% 0%, #2a1248 0%, #120b1f 55%, #0d0a14 100%)'
        }}
      >
        <div>
          <p className="eyebrow">Series</p>
          <h1 className="font-display mt-1 text-6xl text-bone">{nickname.nickname}</h1>
        </div>
      </header>

      {nickname.description && (
        <p data-testid="ip-description" className="mb-10 max-w-2xl text-muted">
          {nickname.description}
        </p>
      )}

      {products.length === 0 ? (
        <section className="rounded-lg border border-line bg-wall p-10 text-center text-muted">
          <p>No drops featuring {nickname.nickname} just yet.</p>
        </section>
      ) : (
        <section>
          <h2 className="sr-only">Drops</h2>
          <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <li key={p.id}>
                <ProductCard product={p} rating={summaries.get(p.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
