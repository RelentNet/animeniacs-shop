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
    <main className="mx-auto max-w-2xl px-4 py-16 text-center md:py-24">
      <p className="eyebrow">Order confirmed</p>
      <h1 className="font-display mt-2 text-5xl text-bone md:text-6xl">Thanks for your order!</h1>
      <p className="mt-4 text-muted">
        Your payment was received. You&apos;ll get a confirmation email from Square shortly.
      </p>
      <div className="mt-8 flex justify-center">
        <a href="/shop" className="btn-neon">
          Keep shopping
          <span aria-hidden="true">→</span>
        </a>
      </div>
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
      <main className="mx-auto max-w-2xl px-4 py-16">
        <p className="eyebrow">Order confirmed</p>
        <h1 className="font-display mt-2 text-5xl text-bone md:text-6xl">Thanks for your order!</h1>
        <p className="mt-4 text-muted">
          Order{' '}
          <code className="rounded bg-wall-2 px-1.5 py-0.5 font-mono text-sm text-neon-soft">
            {order.id}
          </code>{' '}
          received. You&apos;ll get a confirmation email shortly.
        </p>
        <p className="mt-2 text-sm text-muted">
          Look up your order anytime at{' '}
          <a href="/orders/lookup" className="link-neon font-medium">
            /orders/lookup
          </a>{' '}
          using your email and this order number.
        </p>

        {Array.isArray(order.lineItems) && order.lineItems.length > 0 && (
          <section className="panel mt-8 p-6">
            <h2 className="eyebrow text-purple-soft">What you ordered</h2>
            <ul className="mt-4 divide-y divide-line">
              {order.lineItems.map((line, idx) => (
                <li
                  key={`${line.name ?? 'item'}-${line.quantity ?? ''}-${idx}`}
                  className="flex justify-between gap-4 py-3"
                >
                  <span className="text-muted">
                    {line.name} × {line.quantity}
                  </span>
                  <span className="font-medium text-bone">
                    {formatMoney(line.basePriceMoney?.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8 flex items-baseline justify-between border-t border-line-strong pt-5">
          <span className="font-display text-3xl text-bone">Total</span>
          <span className="font-display neon-text text-3xl">
            {formatMoney(order.totalMoney?.amount)}
          </span>
        </div>
      </main>
    </>
  )
}
