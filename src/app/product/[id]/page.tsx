import { ArtistMetaLine } from '@/components/product/ArtistMetaLine'
import { MockupGallery } from '@/components/product/MockupGallery'
import { PdpPurchasePanel } from '@/components/product/PdpPurchasePanel'
import { ProductReviews } from '@/components/product/ProductReviews'
import { WishlistButton } from '@/components/product/WishlistButton'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getRelatedProducts } from '@/lib/categories/related'
import { isInWishlist } from '@/lib/db/queries/wishlists'
import { MOCKUP_SCENES } from '@/lib/mockup-scenes'
import { getProductById } from '@/lib/products/cache'
import { sanitizeProductDescription, stripHtml } from '@/lib/sanitize-html'
import { PRODUCTION_TIME_TEXT } from '@/lib/site-copy'
import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface PageProps {
  params: { id: string }
}

export async function generateMetadata({ params }: PageProps) {
  const product = await getProductById(params.id)
  if (!product) return { title: 'Product not found | Animeniacs' }
  return {
    title: `${product.name} | Animeniacs`,
    description: stripHtml(product.descriptionHtml).slice(0, 160) || product.name
  }
}

export default async function ProductDetailPage({ params }: PageProps): Promise<JSX.Element> {
  const product = await getProductById(params.id)
  if (!product) notFound()

  const related = await getRelatedProducts(product.id, product.categoryIds)
  const sanitized = product.descriptionHtml
    ? sanitizeProductDescription(product.descriptionHtml)
    : null

  const user = await getCurrentUser()
  const wishlisted =
    user.isAuthenticated && user.userId ? await isInWishlist(user.userId, product.id) : false

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav
        aria-label="Breadcrumb"
        className="mb-6 font-mono text-xs uppercase tracking-wide text-muted"
      >
        <Link href={'/' as Route} className="text-neon-soft hover:text-neon hover:no-underline">
          Home
        </Link>
        <span aria-hidden="true" className="px-2 text-faint">
          /
        </span>
        <span className="text-bone">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Gallery — image-forward (≈7/12, Decision 1). */}
        <div className="lg:col-span-7">
          <MockupGallery
            scenes={[...MOCKUP_SCENES]}
            productImages={product.images}
            productName={product.name}
          />
        </div>

        {/* Buy panel — sticky on desktop (Decision 5). */}
        <div className="flex flex-col gap-5 lg:col-span-5 lg:sticky lg:top-24 lg:self-start">
          <h1 className="font-display text-4xl leading-none tracking-wide text-bone sm:text-5xl">
            {product.name}
          </h1>
          <ArtistMetaLine categoryIds={product.categoryIds} />
          <hr className="rule-neon" />
          <PdpPurchasePanel
            productId={product.id}
            variations={product.variations}
            itemOptions={product.itemOptions}
            productionTimeText={PRODUCTION_TIME_TEXT}
          />
          <WishlistButton productId={product.id} inWishlist={wishlisted} />
        </div>
      </div>

      {sanitized && (
        <section className="mt-14 max-w-3xl">
          <p className="eyebrow mb-2">Details</p>
          <h2 className="mb-4 font-display text-2xl tracking-wide text-bone">Description</h2>
          <div
            className="text-sm leading-relaxed text-muted [&_a]:text-neon-soft [&_a:hover]:text-neon [&_strong]:text-bone [&_h1]:text-bone [&_h2]:text-bone [&_h3]:text-bone [&_li]:my-1 [&_ul]:list-disc [&_ul]:pl-5"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via dompurify
            dangerouslySetInnerHTML={{ __html: sanitized }}
          />
        </section>
      )}

      <section className="mt-14 max-w-3xl">
        <ProductReviews productId={product.id} />
      </section>

      {related.source && related.items.length > 0 && (
        <section className="mt-14">
          <p className="eyebrow mb-2">Collection</p>
          <h2 className="mb-5 font-display text-2xl tracking-wide text-bone">
            More from{' '}
            <span className="text-purple-soft">
              {related.source.kind === 'artist'
                ? related.source.displayName
                : related.source.nickname}
            </span>
          </h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
            {related.items.map((p) => (
              <li key={p.id}>
                <Link href={`/product/${p.id}` as Route} className="group block hover:no-underline">
                  {p.imageUrl ? (
                    <Image
                      src={p.imageUrl}
                      alt={p.name}
                      width={300}
                      height={450}
                      className="aspect-[2/3] w-full rounded-md border border-line object-cover transition group-hover:border-neon"
                    />
                  ) : (
                    <div
                      className="aspect-[2/3] w-full rounded-md border border-line bg-wall-2"
                      aria-hidden="true"
                    />
                  )}
                  <div className="mt-1.5 text-sm text-bone group-hover:text-purple-soft">
                    {p.name}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
