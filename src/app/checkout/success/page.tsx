import { CartClearer } from '@/components/cart/CartClearer'
import { markCartCompleted } from '@/lib/db/queries/abandoned-carts'
import { getSquareClient } from '@/lib/square/client'
import Script from 'next/script'

interface PageProps {
  searchParams: { orderId?: string; cartId?: string }
}

export const metadata = {
  title: 'Thanks for your order | Animeniacs'
}

interface SquareLineItem {
  name?: string
  quantity?: string
  basePriceMoney?: { amount?: bigint | number }
}

interface SquareOrderShape {
  id: string
  totalMoney?: { amount?: bigint | number; currency?: string }
  lineItems?: SquareLineItem[]
}

async function fetchOrderSafely(orderId: string): Promise<SquareOrderShape | null> {
  try {
    const client = getSquareClient()
    // biome-ignore lint/suspicious/noExplicitAny: SDK envelope shape varies across versions
    const response = (await (client as any).orders.get({ orderId })) as { order?: SquareOrderShape }
    return response.order ?? null
  } catch (err) {
    console.error('[checkout-success] order fetch failed:', err)
    return null
  }
}

function formatMoney(amount: bigint | number | undefined): string {
  if (amount === undefined) return ''
  const cents = typeof amount === 'bigint' ? Number(amount) : amount
  return `$${(cents / 100).toFixed(2)}`
}

function GenericThanks(): JSX.Element {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-center">
      <h1 className="text-3xl font-bold">Thanks for your order!</h1>
      <p className="mt-4 text-gray-700">
        Your payment was received. You&apos;ll get a confirmation email from Square shortly.
      </p>
    </main>
  )
}

export default async function CheckoutSuccessPage({
  searchParams
}: PageProps): Promise<JSX.Element> {
  const orderId = searchParams.orderId
  const cartId = searchParams.cartId
  if (!orderId) {
    return (
      <>
        <CartClearer cartId={cartId} />
        <GenericThanks />
      </>
    )
  }

  const order = await fetchOrderSafely(orderId)

  if (!order) {
    return (
      <>
        <CartClearer cartId={cartId} />
        <GenericThanks />
      </>
    )
  }

  // Fire-and-forget DB write. If it fails, the webhook will eventually flip the status.
  try {
    await markCartCompleted(order.id)
  } catch (err) {
    console.error('[checkout-success] markCartCompleted failed:', err)
  }

  const totalCents =
    typeof order.totalMoney?.amount === 'bigint'
      ? Number(order.totalMoney.amount)
      : (order.totalMoney?.amount ?? 0)

  return (
    <>
      <CartClearer cartId={cartId} />
      <Script id="plausible-checkout-completed" strategy="afterInteractive">
        {`if (typeof window !== 'undefined' && window.plausible) { window.plausible('checkout_completed', { props: { orderId: ${JSON.stringify(order.id)}, revenueCents: ${totalCents} } }); }`}
      </Script>
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-3xl font-bold">Thanks for your order!</h1>
        <p className="mt-4 text-gray-700">
          Order <code className="font-semibold">{order.id}</code> received. You&apos;ll get a
          confirmation email shortly.
        </p>
        <p className="mt-2 text-sm text-gray-600">
          Look up your order anytime at{' '}
          <a href="/orders/lookup" className="font-medium text-gray-900 underline">
            /orders/lookup
          </a>{' '}
          using your email and this order number.
        </p>

        {Array.isArray(order.lineItems) && order.lineItems.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-semibold">What you ordered</h2>
            <ul className="mt-3 divide-y divide-gray-200">
              {order.lineItems.map((line, idx) => (
                <li
                  key={`${line.name ?? 'item'}-${line.quantity ?? ''}-${idx}`}
                  className="flex justify-between py-3"
                >
                  <span>
                    {line.name} × {line.quantity}
                  </span>
                  <span>{formatMoney(line.basePriceMoney?.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-8 text-2xl font-semibold">
          Total: {formatMoney(order.totalMoney?.amount)}
        </p>
      </main>
    </>
  )
}
