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
  return (
    <Link
      href={`/product/${product.id}` as Route}
      className="block rounded-lg transition hover:opacity-90"
    >
      {product.imageUrl ? (
        <Image
          src={product.imageUrl}
          alt={product.name}
          width={600}
          height={900}
          className="aspect-[2/3] w-full rounded-md object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex aspect-[2/3] w-full items-center justify-center rounded-md bg-gray-200 text-sm text-gray-500"
        >
          No image
        </div>
      )}
      <div className="mt-2 text-sm font-medium">{product.name}</div>
      <div className="text-sm text-gray-600">
        {product.priceCents !== null ? `$${(product.priceCents / 100).toFixed(2)}` : '—'}
      </div>
      {rating && rating.count > 0 && (
        <div className="mt-1 flex items-center gap-1 text-sm">
          <StarRating value={rating.average} count={rating.count} />
          <span className="text-gray-500">({rating.count})</span>
        </div>
      )}
    </Link>
  )
}
