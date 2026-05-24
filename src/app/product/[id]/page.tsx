import { ArtistMetaLine } from '@/components/product/ArtistMetaLine'
import { MockupGallery } from '@/components/product/MockupGallery'
import { PdpPurchasePanel } from '@/components/product/PdpPurchasePanel'
import { getRelatedProducts } from '@/lib/categories/related'
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-gray-600">
        <Link href={'/' as Route} className="underline hover:no-underline">
          Home
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{product.name}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-2">
        <MockupGallery
          scenes={[...MOCKUP_SCENES]}
          productImages={product.images}
          productName={product.name}
        />

        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-bold">{product.name}</h1>
          <ArtistMetaLine categoryIds={product.categoryIds} />
          <PdpPurchasePanel
            variations={product.variations}
            itemOptions={product.itemOptions}
            productionTimeText={PRODUCTION_TIME_TEXT}
          />
        </div>
      </div>

      {sanitized && (
        <section className="mt-12 max-w-3xl">
          <h2 className="mb-3 text-xl font-semibold">Description</h2>
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via dompurify */}
          <div className="prose prose-sm" dangerouslySetInnerHTML={{ __html: sanitized }} />
        </section>
      )}

      {related.source && related.items.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-semibold">
            More from{' '}
            {related.source.kind === 'artist'
              ? related.source.displayName
              : related.source.nickname}
          </h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
            {related.items.map((p) => (
              <li key={p.id}>
                <Link href={`/product/${p.id}` as Route} className="block">
                  {p.imageUrl ? (
                    <Image
                      src={p.imageUrl}
                      alt={p.name}
                      width={300}
                      height={450}
                      className="aspect-[2/3] w-full rounded object-cover"
                    />
                  ) : (
                    <div
                      className="aspect-[2/3] w-full rounded bg-gray-200"
                      aria-hidden="true"
                    />
                  )}
                  <div className="mt-1 text-sm">{p.name}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
