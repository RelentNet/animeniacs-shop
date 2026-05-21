import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getActiveArtistsMock = vi.fn()
const getArtistBySlugMock = vi.fn()
vi.mock('@/lib/db/queries/artists', () => ({
  getActiveArtists: () => getActiveArtistsMock(),
  getArtistBySlug: (slug: string) => getArtistBySlugMock(slug)
}))

// Default: no items for any category. Individual tests override.
const getItemsByCategoryIdMock = vi.fn().mockResolvedValue([])
vi.mock('@/lib/square/items', () => ({
  getItemsByCategoryId: (catId: string) => getItemsByCategoryIdMock(catId)
}))

const notFoundMock = vi.fn(() => {
  throw new Error('__NOT_FOUND__')
})
vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock()
}))

// next/image renders a perfectly normal <img> in jsdom; mock to a
// plain img so we can assert on src/alt without dealing with Next's
// loader.
vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // biome-ignore lint/a11y/useAltText: test stub passes alt via props
    return <img {...props} />
  }
}))

// Same treatment for next/link — pass through with a plain anchor.
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}))

let __artistIdSeq = 0
function makeArtist(overrides: Partial<Record<string, unknown>> = {}) {
  __artistIdSeq += 1
  return {
    id: `uuid-${__artistIdSeq}`,
    slug: 'bxnny.arts',
    displayName: 'Bxnny.Arts',
    squareCategoryId: 'CAT_BXNNY',
    status: 'active',
    avatarUrl: '/images/artists/bxnny.arts.webp',
    bio: 'Painter and digital illustrator.',
    instagram: 'https://instagram.com/bxnny',
    twitter: null,
    facebook: null,
    youtube: null,
    tiktok: null,
    website: null,
    commissionRate: '0.2500',
    paymentMethod: null,
    paymentEmail: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }
}

describe('/artist gallery page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('renders a card per active artist with avatar and name', async () => {
    getActiveArtistsMock.mockResolvedValue([
      makeArtist({ slug: 'a-one', displayName: 'Artist One' }),
      makeArtist({ slug: 'a-two', displayName: 'Artist Two', avatarUrl: null })
    ])
    const mod = await import('@/app/artist/page')
    const element = await mod.default()
    const { container, getByText } = render(element)
    expect(getByText('Artist One')).toBeTruthy()
    expect(getByText('Artist Two')).toBeTruthy()
    expect(container.querySelectorAll('a[href^="/artist/"]')).toHaveLength(2)
  })

  it('falls back to initials when an artist has no avatar', async () => {
    getActiveArtistsMock.mockResolvedValue([
      makeArtist({ displayName: 'No Avatar Artist', avatarUrl: null })
    ])
    const mod = await import('@/app/artist/page')
    const element = await mod.default()
    const { container } = render(element)
    // Initials = "NA"
    expect(container.textContent).toMatch(/NA/)
  })

  it('renders empty state when there are no active artists', async () => {
    getActiveArtistsMock.mockResolvedValue([])
    const mod = await import('@/app/artist/page')
    const element = await mod.default()
    const { container } = render(element)
    expect(container.textContent).toMatch(/No artists yet/i)
  })
})

describe('/artist/[slug] profile page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('renders header with bio and social links for an active artist', async () => {
    getArtistBySlugMock.mockResolvedValue(makeArtist())
    const mod = await import('@/app/artist/[slug]/page')
    const element = await mod.default({ params: { slug: 'bxnny.arts' } })
    const { container, getByText } = render(element)
    expect(getByText('Bxnny.Arts')).toBeTruthy()
    expect(container.textContent).toMatch(/Painter and digital illustrator/)
    expect(container.querySelector('a[href^="https://instagram.com/"]')).toBeTruthy()
  })

  it('renders empty-drops placeholder pointing at Instagram when artist has no items', async () => {
    getArtistBySlugMock.mockResolvedValue(makeArtist())
    getItemsByCategoryIdMock.mockResolvedValue([])
    const mod = await import('@/app/artist/[slug]/page')
    const element = await mod.default({ params: { slug: 'bxnny.arts' } })
    const { container } = render(element)
    expect(container.textContent).toMatch(/doesn.t have any drops yet/i)
    expect(container.textContent).toMatch(/Instagram/)
  })

  it('omits the Instagram-follow CTA when no instagram URL is set', async () => {
    getArtistBySlugMock.mockResolvedValue(makeArtist({ instagram: null }))
    getItemsByCategoryIdMock.mockResolvedValue([])
    const mod = await import('@/app/artist/[slug]/page')
    const element = await mod.default({ params: { slug: 'bxnny.arts' } })
    const { container } = render(element)
    expect(container.textContent).toMatch(/doesn.t have any drops yet/i)
    expect(container.textContent).not.toMatch(/follow them on Instagram/i)
  })

  it('renders product grid when Square returns items for this artist', async () => {
    getArtistBySlugMock.mockResolvedValue(makeArtist())
    getItemsByCategoryIdMock.mockResolvedValue([
      { id: 'IT_1', name: 'Saru Naruto', imageUrl: 'https://cdn/n.png', priceCents: 7500, categoryIds: ['CAT_BXNNY'] },
      { id: 'IT_2', name: 'Saru Gaara',  imageUrl: 'https://cdn/g.png', priceCents: 2500, categoryIds: ['CAT_BXNNY'] }
    ])
    const mod = await import('@/app/artist/[slug]/page')
    const element = await mod.default({ params: { slug: 'bxnny.arts' } })
    const { container, getByText } = render(element)
    expect(getByText('Saru Naruto')).toBeTruthy()
    expect(getByText('Saru Gaara')).toBeTruthy()
    expect(getByText('$75.00')).toBeTruthy()
    expect(getByText('$25.00')).toBeTruthy()
    // Empty-state copy must NOT appear when there are products.
    expect(container.textContent).not.toMatch(/doesn.t have any drops yet/i)
    // Each product links to its PDP.
    expect(container.querySelector('a[href="/product/IT_1"]')).toBeTruthy()
    expect(container.querySelector('a[href="/product/IT_2"]')).toBeTruthy()
  })

  it('renders no-image placeholder when an item has imageUrl=null', async () => {
    getArtistBySlugMock.mockResolvedValue(makeArtist())
    getItemsByCategoryIdMock.mockResolvedValue([
      { id: 'IT_X', name: 'Imageless', imageUrl: null, priceCents: 5000, categoryIds: ['CAT_BXNNY'] }
    ])
    const mod = await import('@/app/artist/[slug]/page')
    const element = await mod.default({ params: { slug: 'bxnny.arts' } })
    const { container } = render(element)
    expect(container.textContent).toMatch(/Imageless/)
    expect(container.textContent).toMatch(/No image/)
  })

  it('404s when the artist does not exist', async () => {
    getArtistBySlugMock.mockResolvedValue(undefined)
    const mod = await import('@/app/artist/[slug]/page')
    await expect(
      mod.default({ params: { slug: 'nobody' } })
    ).rejects.toThrow('__NOT_FOUND__')
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('404s when the artist is inactive', async () => {
    getArtistBySlugMock.mockResolvedValue(makeArtist({ status: 'inactive' }))
    const mod = await import('@/app/artist/[slug]/page')
    await expect(
      mod.default({ params: { slug: 'bxnny.arts' } })
    ).rejects.toThrow('__NOT_FOUND__')
  })
})
