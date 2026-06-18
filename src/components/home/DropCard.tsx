import type { ArtistProduct } from '@/lib/square/items'
import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'

/**
 * Premium product card for the homepage "latest drops" rail. Richer than the
 * shared shop card: an optional NEW sticker and a neon "view piece" reveal that
 * slides up on hover.
 */
export function DropCard({
  product,
  isNew
}: {
  product: ArtistProduct
  isNew?: boolean
}): JSX.Element {
  const price = product.priceCents !== null ? `$${(product.priceCents / 100).toFixed(2)}` : '—'

  return (
    <Link href={`/product/${product.id}` as Route} className="group block hover:no-underline">
      <article className="card-street overflow-hidden">
        <div className="hud scanlines relative aspect-[2/3] w-full overflow-hidden bg-wall-2">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 60vw, 260px"
              draggable={false}
              className="select-none object-cover transition-transform duration-500 group-hover:scale-[1.06]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-faint">
              No image
            </div>
          )}

          {isNew && (
            <span className="sticker absolute left-3 top-3 z-20" aria-hidden="true">
              New
            </span>
          )}

          {/* Hover reveal */}
          <div className="absolute inset-x-0 bottom-0 z-10 translate-y-full bg-gradient-to-t from-ink via-ink/80 to-transparent p-3 pt-10 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-neon">
              View piece
              <span aria-hidden="true">→</span>
            </span>
          </div>
        </div>

        <div className="flex items-start justify-between gap-3 px-3 py-3">
          <h3 className="truncate text-sm font-medium text-bone group-hover:text-purple-soft">
            {product.name}
          </h3>
          <span className="shrink-0 font-mono text-sm font-bold text-neon">{price}</span>
        </div>
      </article>
    </Link>
  )
}
