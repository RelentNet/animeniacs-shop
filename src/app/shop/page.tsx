import { ProductCard } from '@/components/product/ProductCard'
import { getPublicIpNicknames } from '@/lib/db/queries/ip-nicknames'
import { getShopProducts } from '@/lib/square/items'
import type { Route } from 'next'
import Link from 'next/link'

// Reads the live Square catalog + public IP nicknames at request time.
// Forcing dynamic stops Next.js from attempting build-time prerender,
// which would try to reach Square / the Postgres host during build.
// Phase 7.5/B.6 fix.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Shop | Animeniacs',
  description: 'Browse the full collection.'
}

export default async function ShopPage(): Promise<JSX.Element> {
  const [products, nicknames] = await Promise.all([getShopProducts(), getPublicIpNicknames()])

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Shop</h1>
        <p className="mt-2 text-gray-700">Browse the full collection.</p>
      </header>

      {nicknames.length > 0 && (
        <nav data-testid="ip-chips" aria-label="Browse by series" className="mb-8">
          <ul className="flex flex-wrap gap-2">
            {nicknames.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/category/${n.slug}` as Route}
                  className="inline-block rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-800 transition hover:bg-gray-200"
                >
                  {n.nickname}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {products.length === 0 ? (
        <section className="rounded-lg bg-gray-50 p-8 text-center">
          <p>No products available yet — check back soon.</p>
        </section>
      ) : (
        <section>
          <h2 className="sr-only">Products</h2>
          <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <li key={p.id}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
