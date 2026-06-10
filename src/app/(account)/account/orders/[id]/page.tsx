import { OrderDetailView } from '@/components/orders/OrderDetailView'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getOrderById } from '@/lib/db/queries/orders'
import type { Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const metadata = {
  title: 'Order detail | Animeniacs'
}

export default async function OrderDetailPage({
  params
}: {
  params: { id: string }
}): Promise<JSX.Element> {
  const [user, order] = await Promise.all([getCurrentUser(), getOrderById(params.id)])

  // IDOR guard: 404 (not 403, to avoid confirming existence) unless the order
  // belongs to the current user. Spec §8 — this is the key ownership invariant.
  if (!order || order.userId !== user.userId) {
    notFound()
  }

  return (
    <div>
      <Link href={'/account/orders' as Route} className="text-sm text-gray-600 hover:underline">
        &larr; Back to order history
      </Link>

      <div className="mt-3">
        <OrderDetailView order={order} />
      </div>
    </div>
  )
}
