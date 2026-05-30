import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendDiscordOrderNotification } from '@/lib/notifications/discord'

const fetchMock = vi.fn()
beforeEach(() => {
  // biome-ignore lint/suspicious/noExplicitAny: stub
  global.fetch = fetchMock as any
})
afterEach(() => fetchMock.mockReset())

describe('sendDiscordOrderNotification', () => {
  it('POSTs to the webhook URL with an embed', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }))
    await sendDiscordOrderNotification({
      webhookUrl: 'https://discord.com/api/webhooks/123/abc',
      orderId: 'ORDER_X',
      totalCents: 4500,
      itemCount: 2,
      buyerEmail: 'buyer@example.com'
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://discord.com/api/webhooks/123/abc')
    expect(init.method).toBe('POST')
    const body = JSON.parse(String(init.body))
    expect(body.embeds[0].title).toMatch(/new order/i)
    expect(JSON.stringify(body)).toContain('ORDER_X')
    expect(JSON.stringify(body)).toContain('$45.00')
    expect(JSON.stringify(body)).toContain('buyer@example.com')
  })

  it('omits buyer email field when null', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }))
    await sendDiscordOrderNotification({
      webhookUrl: 'https://discord.com/api/webhooks/123/abc',
      orderId: 'ORDER_Y',
      totalCents: 1000,
      itemCount: 1,
      buyerEmail: null
    })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(JSON.stringify(body)).not.toContain('@')
  })

  it('does not throw if fetch fails (caller-handled)', async () => {
    fetchMock.mockRejectedValue(new Error('network'))
    await expect(
      sendDiscordOrderNotification({
        webhookUrl: 'https://x',
        orderId: 'O',
        totalCents: 100,
        itemCount: 1,
        buyerEmail: null
      })
    ).resolves.not.toThrow()
  })

  it('does not throw on non-2xx response', async () => {
    fetchMock.mockResolvedValue(new Response('error', { status: 500 }))
    await expect(
      sendDiscordOrderNotification({
        webhookUrl: 'https://x',
        orderId: 'O',
        totalCents: 100,
        itemCount: 1,
        buyerEmail: null
      })
    ).resolves.not.toThrow()
  })
})
