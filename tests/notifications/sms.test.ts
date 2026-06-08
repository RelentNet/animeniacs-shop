import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetEnabled } = vi.hoisted(() => ({ mockGetEnabled: vi.fn() }))
vi.mock('@/lib/db/queries/sms-recipients', () => ({ getEnabledRecipients: mockGetEnabled }))

import { notifyEnabledRecipients, sendOrderSms } from '@/lib/notifications/sms'

const fetchMock = vi.fn()
beforeEach(() => {
  global.fetch = fetchMock as unknown as typeof fetch
  process.env.SMSEDGE_BASE_URL = 'https://sms.example'
  process.env.SMSEDGE_TOKEN = 'test-token-abc123'
  // Clear old SMSGATE_* in case some prior test set them.
  process.env.SMSGATE_BASE_URL = undefined
  process.env.SMSGATE_USER = undefined
  process.env.SMSGATE_PASS = undefined
})
afterEach(() => {
  fetchMock.mockReset()
  mockGetEnabled.mockReset()
})

describe('sendOrderSms', () => {
  it('POSTs the sms-edge OrderAlert envelope with Bearer auth', async () => {
    fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    await sendOrderSms({
      recipient: { phone: '+14155552671', label: 'Owner' },
      orderId: 'ORDER_X',
      totalCents: 4500,
      itemCount: 2
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://sms.example/sms')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer test-token-abc123')
    const body = JSON.parse(String(init.body))
    // sms-edge contract (design spec §15): { to, type, payload }
    expect(body.to).toBe('+14155552671')
    expect(body.type).toBe('OrderAlert')
    expect(body.payload).toEqual({ orderId: 'ORDER_X', total: 4500, itemCount: 2 })
  })

  it('does not throw on network error', async () => {
    fetchMock.mockRejectedValue(new Error('boom'))
    await expect(
      sendOrderSms({
        recipient: { phone: '+1', label: null },
        orderId: 'O',
        totalCents: 100,
        itemCount: 1
      })
    ).resolves.not.toThrow()
  })
})

describe('notifyEnabledRecipients', () => {
  it('sends one SMS per enabled recipient', async () => {
    mockGetEnabled.mockResolvedValue([
      { id: 1, phone: '+14155551111', label: 'A', enabled: true, createdAt: new Date() },
      { id: 2, phone: '+14155552222', label: 'B', enabled: true, createdAt: new Date() }
    ])
    fetchMock.mockResolvedValue(new Response('', { status: 200 }))
    await notifyEnabledRecipients({ orderId: 'O', totalCents: 100, itemCount: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('one failed recipient does not block others', async () => {
    mockGetEnabled.mockResolvedValue([
      { id: 1, phone: '+1', label: null, enabled: true, createdAt: new Date() },
      { id: 2, phone: '+2', label: null, enabled: true, createdAt: new Date() }
    ])
    fetchMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(new Response('', { status: 200 }))
    await expect(
      notifyEnabledRecipients({ orderId: 'O', totalCents: 100, itemCount: 1 })
    ).resolves.not.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('no-ops when there are no enabled recipients', async () => {
    mockGetEnabled.mockResolvedValue([])
    await notifyEnabledRecipients({ orderId: 'O', totalCents: 100, itemCount: 1 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
