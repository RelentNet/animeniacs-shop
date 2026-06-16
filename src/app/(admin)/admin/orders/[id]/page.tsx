import { FulfillmentPanel } from '@/app/(admin)/admin/orders/_components/FulfillmentPanel'
import { OrderDetail } from '@/app/(admin)/admin/orders/_components/OrderDetail'
import { RefundPanel } from '@/app/(admin)/admin/orders/_components/RefundPanel'
import { getOrderById } from '@/lib/db/queries/orders'
import { notFound } from 'next/navigation'
import { advanceFulfillmentAction, issueRefundAction } from './actions'

export const metadata = {
  title: 'Order — admin'
}

export default async function OrderDetailPage({
  params
}: {
  params: { id: string }
}): Promise<JSX.Element> {
  const order = await getOrderById(params.id)
  if (!order) notFound()

  const refundAction = issueRefundAction.bind(null, order.id)
  const fulfillmentAction = advanceFulfillmentAction.bind(null, order.id)

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <OrderDetail order={order} />
      <RefundPanel order={order} action={refundAction} />
      <FulfillmentPanel fulfillmentState={order.fulfillmentState} action={fulfillmentAction} />
    </div>
  )
}
