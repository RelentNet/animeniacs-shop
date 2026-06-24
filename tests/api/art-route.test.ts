import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockResolve } = vi.hoisted(() => ({ mockResolve: vi.fn() }))
vi.mock('@/lib/square/items', () => ({ resolveImageUrlCached: mockResolve }))
// Keep sharp out of this test — we only exercise the route's guard/resolve paths.
vi.mock('@/lib/images/downscale', () => ({ downscaleArtImage: vi.fn() }))

import { GET } from '@/app/api/art/route'

function req(query: string): Request {
  return new Request(`http://localhost/api/art${query}`)
}

describe('GET /api/art', () => {
  beforeEach(() => mockResolve.mockReset())

  it('400 when id is missing', async () => {
    const res = await GET(req(''))
    expect(res.status).toBe(400)
    expect(mockResolve).not.toHaveBeenCalled()
  })

  it('400 when id is malformed (path/url injection blocked)', async () => {
    for (const bad of ['../secret', 'a/b', 'http://evil']) {
      const res = await GET(req(`?id=${encodeURIComponent(bad)}`))
      expect(res.status).toBe(400)
    }
    expect(mockResolve).not.toHaveBeenCalled()
  })

  it('404 when a valid id resolves to no live image (degrades, never 500)', async () => {
    mockResolve.mockResolvedValueOnce(null)
    const res = await GET(req('?id=MNFM5K3QABCDEF234567XY'))
    expect(res.status).toBe(404)
    expect(mockResolve).toHaveBeenCalledWith('MNFM5K3QABCDEF234567XY')
  })
})
