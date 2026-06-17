import { StarRating } from '@/components/product/StarRating'
import type { ArtistProduct } from '@/lib/square/items'
import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'

/**
 * Shared public product card: image (or placeholder), name, price, optional
 * star-rating summary, linking to the PDP. Used by /shop, /category, /artist.
 * Renders NO category information — the IP-never-public constraint is satisfied
 * by omission. The optional `rating` is the published-review summary; it renders
 * only when present and `count > 0`.
 */
export function ProductCard({
  product,
  rating
}: {
  product: ArtistProduct
  rating?: { count: number; average: number }
}): JSX.Element {
  const price = product.priceCents !== null ? `$${(product.priceCents / 100).toFixed(2)}` : '—'

  return (
    <Link href={`/product/${product.id}` as Route} className="group block hover:no-underline">
      <article className="card-street overflow-hidden">
        {/* Art frame — HUD brackets + scanline grit, like a backlit gallery panel */}
        <div className="hud scanlines relative aspect-[2/3] w-full overflow-hidden bg-wall-2">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              width={600}
              height={900}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-full w-full items-center justify-center text-sm text-faint"
            >
              No image
            </div>
          )}
        </div>

        <div className="flex items-start justify-between gap-3 px-3 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-bone group-hover:text-purple-soft">
              {product.name}
            </h3>
            {rating && rating.count > 0 && (
              <div className="mt-1.5 flex items-center gap-1 text-xs">
                <StarRating value={rating.average} count={rating.count} />
                <span className="text-faint">({rating.count})</span>
              </div>
            )}
          </div>
          <span className="shrink-0 font-mono text-sm font-bold text-neon">{price}</span>
        </div>
      </article>
    </Link>
  )
}
