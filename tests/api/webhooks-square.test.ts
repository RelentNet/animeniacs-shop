import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockHandle } = vi.hoisted(() => ({ mockHandle: vi.fn() }))
vi.mock('@/lib/webhooks/handle-event', () => ({ handleSquareEvent: mockHandle }))

const KEY = 'test-signature-key'
const URL_BASE = 'https://dev.animeniacs.shop'

function sign(body: string, fullUrl: string, key: string) {
  return createHmac('sha256', key)
    .update(fullUrl + body)
    .digest('base64')
}

function makeRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request(`${URL_BASE}/api/webhooks/square`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body
  })
}

beforeEach(() => {
  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = KEY
  process.env.NEXT_PUBLIC_SITE_URL = URL_BASE
})

afterEach(() => {
  mockHandle.mockReset()
})

describe('POST /api/webhooks/square', () => {
  it('200s and calls handleSquareEvent on valid signature', async () => {
    const body = JSON.stringify({ event_id: 'E', type: 'payment.created', data: { object: {} } })
    const sig = sign(body, `${URL_BASE}/api/webhooks/square`, KEY)
    const { POST } = await import('@/app/api/webhooks/square/route')
    const res = await POST(makeRequest(body, { 'x-square-hmacsha256-signature': sig }))
    expect(res.status).toBe(200)
    expect(mockHandle).toHaveBeenCalled()
  })

  it('401 on invalid signature', async () => {
    const body = JSON.stringify({ event_id: 'E', type: 'payment.created' })
    const { POST } = await import('@/app/api/webhooks/square/route')
    const res = await POST(makeRequest(body, { 'x-square-hmacsha256-signature': 'bogus' }))
    expect(res.status).toBe(401)
    expect(mockHandle).not.toHaveBeenCalled()
  })

  it('401 when signature header missing', async () => {
    const body = JSON.stringify({ event_id: 'E', type: 'payment.created' })
    const { POST } = await import('@/app/api/webhooks/square/route')
    const res = await POST(makeRequest(body))
    expect(res.status).toBe(401)
  })

  it('400 on unparseable body', async () => {
    const body = 'not json'
    const sig = sign(body, `${URL_BASE}/api/webhooks/square`, KEY)
    const { POST } = await import('@/app/api/webhooks/square/route')
    const res = await POST(makeRequest(body, { 'x-square-hmacsha256-signature': sig }))
    expect(res.status).toBe(400)
  })

  it('500 when handler throws (Square will retry)', async () => {
    mockHandle.mockRejectedValue(new Error('db down'))
    const body = JSON.stringify({ event_id: 'E', type: 'payment.created', data: { object: {} } })
    const sig = sign(body, `${URL_BASE}/api/webhooks/square`, KEY)
    const { POST } = await import('@/app/api/webhooks/square/route')
    const res = await POST(makeRequest(body, { 'x-square-hmacsha256-signature': sig }))
    expect(res.status).toBe(500)
  })

  it('500 when SQUARE_WEBHOOK_SIGNATURE_KEY env is missing', async () => {
    process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = ''
    const body = JSON.stringify({ event_id: 'E', type: 'payment.created' })
    const { POST } = await import('@/app/api/webhooks/square/route')
    const res = await POST(makeRequest(body, { 'x-square-hmacsha256-signature': 'anything' }))
    expect(res.status).toBe(500)
  })
})
