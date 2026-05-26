import { afterEach, describe, expect, it, vi } from 'vitest'

const mockGetProductById = vi.fn()
vi.mock('@/lib/products/cache', () => ({
  getProductById: mockGetProductById
}))

afterEach(() => {
  mockGetProductById.mockReset()
})

function makeRequest(body: unknown, init: RequestInit = {}): Request {
  return new Request('http://localhost/api/cart/hydrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init
  })
}

describe('POST /api/cart/hydrate', () => {
  it('returns hydrated products keyed by id', async () => {
    mockGetProductById.mockImplementation(async (id: string) => ({
      id,
      name: `Item ${id}`,
      description: null,
      descriptionHtml: null,
      variations: [],
      images: [],
      categoryIds: [],
      itemOptions: [],
      updatedAt: '2026-05-24T00:00:00Z'
    }))
    const { POST } = await import('@/app/api/cart/hydrate/route')
    const res = await POST(makeRequest({ ids: ['A', 'B'] }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.products.A.name).toBe('Item A')
    expect(json.products.B.name).toBe('Item B')
  })

  it('returns empty object for empty ids', async () => {
    const { POST } = await import('@/app/api/cart/hydrate/route')
    const res = await POST(makeRequest({ ids: [] }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ products: {} })
    expect(mockGetProductById).not.toHaveBeenCalled()
  })

  it('deduplicates ids server-side', async () => {
    mockGetProductById.mockResolvedValue({
      id: 'A',
      name: 'A',
      description: null,
      descriptionHtml: null,
      variations: [],
      images: [],
      categoryIds: [],
      itemOptions: [],
      updatedAt: '2026-05-24T00:00:00Z'
    })
    const { POST } = await import('@/app/api/cart/hydrate/route')
    const res = await POST(makeRequest({ ids: ['A', 'A', 'A'] }))
    expect(res.status).toBe(200)
    expect(mockGetProductById).toHaveBeenCalledTimes(1)
  })

  it('passes through null when getProductById returns null', async () => {
    mockGetProductById.mockResolvedValue(null)
    const { POST } = await import('@/app/api/cart/hydrate/route')
    const res = await POST(makeRequest({ ids: ['MISSING'] }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.products.MISSING).toBeNull()
  })

  it('treats per-id throw as null without aborting other ids', async () => {
    mockGetProductById.mockImplementation(async (id: string) => {
      if (id === 'BAD') throw new Error('boom')
      return {
        id,
        name: id,
        description: null,
        descriptionHtml: null,
        variations: [],
        images: [],
        categoryIds: [],
        itemOptions: [],
        updatedAt: '2026-05-24T00:00:00Z'
      }
    })
    const { POST } = await import('@/app/api/cart/hydrate/route')
    const res = await POST(makeRequest({ ids: ['GOOD', 'BAD'] }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.products.GOOD.name).toBe('GOOD')
    expect(json.products.BAD).toBeNull()
  })

  it('400s on malformed JSON body', async () => {
    const { POST } = await import('@/app/api/cart/hydrate/route')
    const res = await POST(makeRequest('not valid json'))
    expect(res.status).toBe(400)
  })

  it('400s when ids is missing', async () => {
    const { POST } = await import('@/app/api/cart/hydrate/route')
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('400s when ids is not an array of strings', async () => {
    const { POST } = await import('@/app/api/cart/hydrate/route')
    const res = await POST(makeRequest({ ids: 'not-an-array' }))
    expect(res.status).toBe(400)
  })

  it('400s when ids exceeds 50 entries', async () => {
    const oversize = Array.from({ length: 51 }, (_, i) => `ID_${i}`)
    const { POST } = await import('@/app/api/cart/hydrate/route')
    const res = await POST(makeRequest({ ids: oversize }))
    expect(res.status).toBe(400)
  })

  it('does not export a GET handler (Next.js returns 405 automatically)', async () => {
    const mod = await import('@/app/api/cart/hydrate/route')
    expect((mod as Record<string, unknown>).GET).toBeUndefined()
  })
})
