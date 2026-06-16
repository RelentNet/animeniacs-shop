import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetStats = vi.fn()
vi.mock('@/lib/db/queries/orders', () => ({ getOrderDashboardStats: mockGetStats }))

const ZERO_STATS = {
  ordersToday: 0,
  revenueTodayCents: 0,
  orders7d: 0,
  revenue7dCents: 0,
  orders30d: 0,
  revenue30dCents: 0,
  refundedTotalCents: 0,
  needsFulfillment: 0
}

beforeEach(() => {
  mockGetStats.mockReset().mockResolvedValue(ZERO_STATS)
})

describe('/admin index page', () => {
  it('renders a heading and links to every admin section', async () => {
    const { default: AdminIndexPage } = await import('@/app/(admin)/admin/page')
    render(await AdminIndexPage())

    expect(screen.getByRole('heading', { level: 1, name: /admin/i })).toBeInTheDocument()

    const orders = screen.getByRole('link', { name: /^orders/i })
    expect(orders).toHaveAttribute('href', '/admin/orders')

    const artists = screen.getByRole('link', { name: /artists/i })
    expect(artists).toHaveAttribute('href', '/admin/artists')

    const ipNicknames = screen.getByRole('link', { name: /ip nicknames/i })
    expect(ipNicknames).toHaveAttribute('href', '/admin/ip-nicknames')

    const smsRecipients = screen.getByRole('link', { name: /sms recipients/i })
    expect(smsRecipients).toHaveAttribute('href', '/admin/sms-recipients')
  })

  it('sets an explicit foreground/background so it survives dark mode', async () => {
    const { default: AdminIndexPage } = await import('@/app/(admin)/admin/page')
    const { container } = render(await AdminIndexPage())
    const root = container.firstElementChild as HTMLElement
    expect(root.style.color).not.toBe('')
    expect(root.style.background).not.toBe('')
  })

  it('renders the order dashboard stats strip from getOrderDashboardStats', async () => {
    mockGetStats.mockResolvedValue({
      ordersToday: 2,
      revenueTodayCents: 5000,
      orders7d: 9,
      revenue7dCents: 21000,
      orders30d: 30,
      revenue30dCents: 90000,
      refundedTotalCents: 1500,
      needsFulfillment: 4
    })
    const { default: AdminIndexPage } = await import('@/app/(admin)/admin/page')
    render(await AdminIndexPage())

    // Revenue 30d = $900.00, refunded total = $15.00.
    expect(screen.getByText('$900.00')).toBeInTheDocument()
    expect(screen.getByText('$15.00')).toBeInTheDocument()
    // Needs-fulfillment count surfaced.
    expect(screen.getByText('4')).toBeInTheDocument()
  })
})
