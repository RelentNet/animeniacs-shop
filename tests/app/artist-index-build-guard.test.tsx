import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Spy on the only data read the artist index performs.
const getActiveArtists = vi.fn()
vi.mock('@/lib/db/queries/artists', () => ({ getActiveArtists }))

beforeEach(() => {
  getActiveArtists.mockReset()
  // The page reads NEXT_PHASE at module-eval time, so each test needs a fresh
  // module evaluated under its own stubbed env.
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('/artist index build-phase data guard (spec §4)', () => {
  it('renders the empty state WITHOUT reading the DB during the build phase', async () => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-build')
    const { default: ArtistGalleryPage } = await import('@/app/artist/page')

    render(await ArtistGalleryPage())

    // Build tolerance: no DB call, empty-state copy renders.
    expect(getActiveArtists).not.toHaveBeenCalled()
    expect(screen.getByText(/No artists yet/i)).toBeInTheDocument()
  })

  it('reads getActiveArtists and renders the list at runtime (not build phase)', async () => {
    vi.stubEnv('NEXT_PHASE', undefined)
    getActiveArtists.mockResolvedValue([
      { id: 'a1', slug: 'bxnny', displayName: 'Bxnny Arts', avatarUrl: null }
    ])
    const { default: ArtistGalleryPage } = await import('@/app/artist/page')

    render(await ArtistGalleryPage())

    expect(getActiveArtists).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Bxnny Arts')).toBeInTheDocument()
  })
})
