import 'server-only'
import { getActiveArtists } from '@/lib/db/queries/artists'
import type { Artist } from '@/lib/db/schema'
import { type ArtistProduct, getItemsByCategoryId } from '@/lib/square/items'
import { getFeaturedProducts } from './featured'

export interface ArtistSpotlight {
  artist: Artist
  works: ArtistProduct[]
}

/**
 * Picks one active artist plus a few of their pieces for the homepage spotlight.
 * Their works come from Square (by category) in production; if that's empty or
 * unreachable (local/seed), we fall back to featured art so the section still
 * reads. Returns null when there are no artists or during prerender.
 */
export async function getArtistSpotlight(): Promise<ArtistSpotlight | null> {
  if (process.env.NEXT_PHASE === 'phase-production-build') return null

  let artists: Artist[] = []
  try {
    artists = await getActiveArtists()
  } catch {
    return null
  }
  const artist = artists.find((a) => a.avatarUrl) ?? artists[0]
  if (!artist) return null

  let works: ArtistProduct[] = []
  try {
    works = await getItemsByCategoryId(artist.squareCategoryId)
  } catch {
    // Square unconfigured/unreachable — fall through.
  }
  if (works.length === 0) {
    works = (await getFeaturedProducts(8)).filter((p) => p.imageUrl)
  }

  return { artist, works: works.slice(0, 4) }
}
