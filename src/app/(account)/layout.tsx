import { getCurrentUser } from '@/lib/auth/get-current-user'
import { redirect } from 'next/navigation'

// Account routes read the Logto session + DB at request time. Forcing dynamic
// stops Next.js from attempting build-time prerender (which would try to reach
// the Postgres host / Logto in an environment that has neither). Mirrors the
// (admin) group and the force-dynamic root layout.
export const dynamic = 'force-dynamic'

/**
 * Auth gate for every page under the (account) route group. Any authenticated
 * user may enter (no role requirement — this is the customer-facing storefront
 * area, not admin). Unauthenticated requests are sent to /sign-in.
 *
 * Storefront conventions: Tailwind, NOT the admin inline-style idiom.
 */
export default async function AccountLayout({
  children
}: {
  children: React.ReactNode
}): Promise<JSX.Element> {
  const { isAuthenticated } = await getCurrentUser()
  if (!isAuthenticated) {
    redirect('/sign-in')
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <nav aria-label="Account" className="mb-6 border-b border-gray-200 pb-4">
        <ul className="flex flex-wrap gap-4 text-sm">
          <li>
            <a href="/account" className="font-medium text-gray-900 hover:underline">
              Account
            </a>
          </li>
          <li>
            <a href="/account/orders" className="text-gray-700 hover:underline">
              Order history
            </a>
          </li>
          <li>
            <a href="/account/wishlist" className="text-gray-700 hover:underline">
              Wishlist
            </a>
          </li>
        </ul>
      </nav>
      {children}
    </div>
  )
}
