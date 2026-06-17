import { OrderDetail } from '@/app/(admin)/admin/orders/_components/OrderDetail'
import { getOrderById } from '@/lib/db/queries/orders'
import { notFound } from 'next/navigation'

export const metadata = {
  title: 'Order — admin'
}

// Read-only order log. Refunds + fulfillment/shipping are handled in Square (and
// Shippo); their state flows back here via the Square webhooks
// (refund.* / order.fulfillment.updated → reconcile). No mutating panels.
export default async function OrderDetailPage({
  params
}: {
  params: { id: string }
}): Promise<JSX.Element> {
  const order = await getOrderById(params.id)
  if (!order) notFound()

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <OrderDetail order={order} />
    </div>
  )
}
