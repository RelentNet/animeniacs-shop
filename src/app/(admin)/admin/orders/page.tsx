import { OrdersTable } from '@/app/(admin)/admin/orders/_components/OrdersTable'
import { type OrderStatus, countOrders, listOrders } from '@/lib/db/queries/orders'
import type { Route } from 'next'
import Link from 'next/link'

export const metadata = {
  title: 'Orders — admin'
}

const PAGE_SIZE = 25

const STATUS_OPTIONS: OrderStatus[] = ['completed', 'refunded', 'partially_refunded']
const FULFILLMENT_OPTIONS = [
  'PROPOSED',
  'RESERVED',
  'PREPARED',
  'COMPLETED',
  'CANCELED',
  'FAILED'
] as const

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

/** Validate the status filter against the known enum; undefined for anything else. */
function parseStatus(raw: string | undefined): OrderStatus | undefined {
  return STATUS_OPTIONS.find((s) => s === raw)
}

function parseFulfillment(raw: string | undefined): string | undefined {
  return FULFILLMENT_OPTIONS.find((f) => f === raw)
}

interface SearchParams {
  [key: string]: string | string[] | undefined
}

export default async function OrdersListPage({
  searchParams
}: {
  searchParams: SearchParams
}): Promise<JSX.Element> {
  const status = parseStatus(firstParam(searchParams.status))
  const fulfillmentState = parseFulfillment(firstParam(searchParams.fulfillment))
  const q = firstParam(searchParams.q)?.trim() || undefined
  const pageRaw = Number.parseInt(firstParam(searchParams.page) ?? '1', 10)
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1
  const offset = (page - 1) * PAGE_SIZE

  const filter = { status, fulfillmentState, q }
  const [orders, total] = await Promise.all([
    listOrders({ ...filter, limit: PAGE_SIZE, offset }),
    countOrders(filter)
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Orders ({total})</h1>
      </header>

      {/* biome-ignore lint/a11y/useSemanticElements: role="search" is the standard ARIA search landmark; there is no native HTML element for it. */}
      <form
        role="search"
        method="get"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'flex-end',
          marginBottom: '1rem'
        }}
      >
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span>Status</span>
          <select name="status" defaultValue={status ?? ''}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span>Fulfillment</span>
          <select name="fulfillment" defaultValue={fulfillmentState ?? ''}>
            <option value="">All</option>
            {FULFILLMENT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span>Search</span>
          <input type="search" name="q" defaultValue={q ?? ''} placeholder="order # or email" />
        </label>

        <button type="submit">Filter</button>
        {(status || fulfillmentState || q) && <Link href={'/admin/orders' as Route}>Clear</Link>}
      </form>

      {orders.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', background: '#f7f7f7' }}>
          <p>No orders match.</p>
        </div>
      ) : (
        <OrdersTable orders={orders} />
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Pagination"
          style={{ display: 'flex', gap: '1rem', marginTop: '1rem', alignItems: 'center' }}
        >
          {page > 1 && <Link href={pageHref(searchParams, page - 1)}>← Previous</Link>}
          <span>
            Page {page} of {totalPages}
          </span>
          {page < totalPages && <Link href={pageHref(searchParams, page + 1)}>Next →</Link>}
        </nav>
      )}
    </div>
  )
}

/** Preserve active filters while changing the page query param. */
function pageHref(searchParams: SearchParams, page: number): Route {
  const params = new URLSearchParams()
  const status = firstParam(searchParams.status)
  const fulfillment = firstParam(searchParams.fulfillment)
  const q = firstParam(searchParams.q)
  if (status) params.set('status', status)
  if (fulfillment) params.set('fulfillment', fulfillment)
  if (q) params.set('q', q)
  params.set('page', String(page))
  return `/admin/orders?${params.toString()}` as Route
}
