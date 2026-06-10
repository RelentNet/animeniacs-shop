import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/orders/lookup/actions', () => ({ lookupOrderAction: vi.fn() }))

// useFormState is undefined under the jsdom/SSR transform; stub it to a
// controllable state (same harness adaptation as the review-form test).
let formState: Record<string, unknown> = {}
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return { ...actual, useFormState: () => [formState, () => {}] }
})

beforeEach(() => {
  formState = {}
})

const order = {
  id: 'order-1',
  squareOrderId: 'sq-order-1',
  userId: null,
  buyerEmail: 'buyer@example.com',
  status: 'completed',
  totalCents: 2599,
  currency: 'USD',
  fulfillmentState: 'PREPARED',
  refundedCents: 0,
  placedAt: new Date('2026-06-10T12:00:00Z'),
  lineItems: [{ name: 'Sticker Pack', quantity: 2, unitPriceCents: 1000, totalCents: 2000 }]
}

describe('Order lookup form', () => {
  it('renders the email + order-number inputs and a submit button', async () => {
    const { LookupForm } = await import('@/app/orders/lookup/LookupForm')
    render(<LookupForm />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/order number/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /find my order/i })).toBeInTheDocument()
  })

  it('shows the generic error message', async () => {
    formState = { error: "We couldn't find an order matching that email and order number." }
    const { LookupForm } = await import('@/app/orders/lookup/LookupForm')
    render(<LookupForm />)
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't find an order/i)
  })

  it('renders the order detail view on a successful match', async () => {
    formState = { ok: true, order }
    const { LookupForm } = await import('@/app/orders/lookup/LookupForm')
    render(<LookupForm />)
    expect(screen.getByText('Sticker Pack')).toBeInTheDocument()
    expect(screen.getByText(/\$25\.99/)).toBeInTheDocument()
    expect(screen.getByText('Being prepared')).toBeInTheDocument()
    // the form inputs are gone once the order renders
    expect(screen.queryByRole('button', { name: /find my order/i })).not.toBeInTheDocument()
  })
})
