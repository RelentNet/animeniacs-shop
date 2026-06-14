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
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header
        className="mb-8 flex h-48 items-center justify-center rounded-lg"
        style={{
          // Brand-neutral CSS gradient until per-IP cover image uploads land.
          background: 'linear-gradient(135deg, #1f2937 0%, #4b5563 100%)'
        }}
      >
        <h1 className="text-4xl font-bold text-white">{nickname.nickname}</h1>
      </header>

      {nickname.description && (
        <p data-testid="ip-description" className="mb-8 text-gray-700">
          {nickname.description}
        </p>
      )}

      {products.length === 0 ? (
        <section className="rounded-lg bg-gray-50 p-8 text-center">
          <p>No drops featuring {nickname.nickname} just yet.</p>
        </section>
      ) : (
        <section>
          <h2 className="sr-only">Drops</h2>
          <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3">
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
