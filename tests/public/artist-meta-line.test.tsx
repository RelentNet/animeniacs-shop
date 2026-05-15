import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getArtistByCategoryIdMock = vi.fn()
vi.mock('@/lib/db/queries/artists', () => ({
  getArtistByCategoryId: (id: string) => getArtistByCategoryIdMock(id)
}))

vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // biome-ignore lint/a11y/useAltText: test stub passes alt via props
    return <img {...props} />
  }
}))

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}))

let __id = 0
function makeArtist(overrides: Partial<Record<string, unknown>> = {}) {
  __id += 1
  return {
    id: `uuid-${__id}`,
    slug: 'bxnny.arts',
    displayName: 'Bxnny.Arts',
    squareCategoryId: 'CAT_BXNNY',
    status: 'active',
    avatarUrl: '/images/artists/bxnny.arts.webp',
    bio: null,
    instagram: 'https://instagram.com/bxnny',
    twitter: null,
    facebook: null,
    youtube: null,
    tiktok: null,
    website: null,
    commissionRate: '0.2000',
    paymentMethod: null,
    paymentEmail: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }
}

async function renderMeta(categoryIds: string[]) {
  const mod = await import('@/components/product/ArtistMetaLine')
  const el = await mod.ArtistMetaLine({ categoryIds })
  return el
}

describe('<ArtistMetaLine />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('renders nothing when categoryIds is empty', async () => {
    const el = await renderMeta([])
    expect(el).toBeNull()
  })

  it('renders nothing when no category in the array matches an artist', async () => {
    getArtistByCategoryIdMock.mockResolvedValue(undefined)
    const el = await renderMeta(['CAT_NOT_ARTIST', 'CAT_ALSO_NOT_ARTIST'])
    expect(el).toBeNull()
    // Walked every id in the list before giving up.
    expect(getArtistByCategoryIdMock).toHaveBeenCalledTimes(2)
  })

  it('renders "Designed by [Artist]" with a link to /artist/<slug>', async () => {
    getArtistByCategoryIdMock.mockResolvedValueOnce(undefined) // first cat is IP
    getArtistByCategoryIdMock.mockResolvedValueOnce(makeArtist({ slug: 'bxnny.arts' })) // second is artist

    const el = await renderMeta(['CAT_IP', 'CAT_ARTIST'])
    const { container, getByText } = render(el!)
    expect(getByText(/Designed by/i)).toBeTruthy()
    expect(getByText('Bxnny.Arts')).toBeTruthy()
    expect(container.querySelector('a[href="/artist/bxnny.arts"]')).toBeTruthy()
  })

  it('renders an Instagram icon link when the artist has an instagram url', async () => {
    getArtistByCategoryIdMock.mockResolvedValue(
      makeArtist({ instagram: 'https://instagram.com/bxnny' })
    )
    const el = await renderMeta(['CAT_ARTIST'])
    const { container } = render(el!)
    const igLink = container.querySelector('a[href="https://instagram.com/bxnny"]')
    expect(igLink).toBeTruthy()
    expect(igLink?.getAttribute('target')).toBe('_blank')
    expect(igLink?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(igLink?.getAttribute('aria-label')).toMatch(/Bxnny.Arts on Instagram/)
  })

  it('omits the Instagram icon when the artist has no instagram', async () => {
    getArtistByCategoryIdMock.mockResolvedValue(makeArtist({ instagram: null }))
    const el = await renderMeta(['CAT_ARTIST'])
    const { container } = render(el!)
    expect(container.querySelector('a[aria-label*="Instagram"]')).toBeNull()
  })

  it('falls back to initials when the artist has no avatarUrl', async () => {
    getArtistByCategoryIdMock.mockResolvedValue(
      makeArtist({ avatarUrl: null, displayName: 'No Avatar' })
    )
    const el = await renderMeta(['CAT_ARTIST'])
    const { container } = render(el!)
    expect(container.textContent).toMatch(/NA/)
  })

  it('skips an inactive artist match and keeps walking', async () => {
    getArtistByCategoryIdMock.mockResolvedValueOnce(
      makeArtist({ status: 'inactive', slug: 'retired' })
    )
    getArtistByCategoryIdMock.mockResolvedValueOnce(
      makeArtist({ status: 'active', slug: 'active-one', displayName: 'Active One' })
    )
    const el = await renderMeta(['CAT_RETIRED', 'CAT_ACTIVE'])
    const { container } = render(el!)
    expect(container.textContent).toMatch(/Active One/)
    expect(container.textContent).not.toMatch(/retired/)
  })

  it('does NOT render IP / category names anywhere in its output', async () => {
    // Locked decision: IP categories must NEVER be publicly visible.
    // This is a regression guard.
    getArtistByCategoryIdMock.mockResolvedValueOnce(undefined)
    getArtistByCategoryIdMock.mockResolvedValueOnce(makeArtist())
    const el = await renderMeta(['CAT_ANIME_NARUTO', 'CAT_BXNNY'])
    const { container } = render(el!)
    expect(container.textContent).not.toMatch(/Naruto/i)
    expect(container.textContent).not.toMatch(/Anime/i)
    expect(container.textContent).not.toMatch(/CAT_/)
  })
})
