import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getWishlist } from '@/lib/db/queries/wishlists'
import { getProductById } from '@/lib/products/cache'
import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { removeWishlistItemAction } from './actions'

export const metadata = { title: 'Wishlist | Animeniacs' }

export default async function WishlistPage(): Promise<JSX.Element> {
  const user = await getCurrentUser()
  if (!user.isAuthenticated || !user.userId) {
    redirect('/sign-in')
  }

  const entries = await getWishlist(user.userId)
  const products = (
    await Promise.all(entries.map((entry) => getProductById(entry.productId)))
  ).filter((product): product is NonNullable<typeof product> => product !== null)

  return (
    <div>
      <h1 className="text-2xl font-bold">Wishlist</h1>

      {products.length === 0 ? (
        <p className="mt-4 text-sm text-gray-600">Your wishlist is empty.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3">
          {products.map((product) => (
            <li key={product.id} className="flex flex-col">
              <Link href={`/product/${product.id}` as Route} className="block">
                {product.images[0] ? (
                  <Image
                    src={product.images[0]}
                    alt={product.name}
                    width={300}
                    height={450}
                    className="aspect-[2/3] w-full rounded object-cover"
                  />
                ) : (
                  <div className="aspect-[2/3] w-full rounded bg-gray-200" aria-hidden="true" />
                )}
                <span className="mt-2 block text-sm font-medium text-gray-900">{product.name}</span>
              </Link>
              <form action={removeWishlistItemAction} className="mt-2">
                <input type="hidden" name="productId" value={product.id} />
                <button
                  type="submit"
                  className="text-sm text-gray-500 underline hover:text-gray-900"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
