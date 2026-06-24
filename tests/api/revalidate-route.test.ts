import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRevalidatePath } = vi.hoisted(() => ({ mockRevalidatePath: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))

import { POST } from '@/app/api/revalidate/route'

const orig = process.env.CRON_SECRET

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/revalidate', { method: 'POST', headers })
}

describe('POST /api/revalidate', () => {
  beforeEach(() => {
    mockRevalidatePath.mockReset()
    process.env.CRON_SECRET = 'sekret'
  })
  afterEach(() => {
    process.env.CRON_SECRET = orig ?? ''
  })

  it('401 without the secret header — and revalidates nothing', async () => {
    const res = await POST(req())
    expect(res.status).toBe(401)
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('401 with a wrong secret', async () => {
    const res = await POST(req({ 'x-cron-secret': 'wrong' }))
    expect(res.status).toBe(401)
  })

  it('revalidates the ISR surfaces with the correct secret', async () => {
    const res = await POST(req({ 'x-cron-secret': 'sekret' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.revalidated).toEqual(
      expect.arrayContaining(['/', '/shop', '/artist', '/artist/[slug]', '/category/[slug]'])
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/artist')
  })
})
