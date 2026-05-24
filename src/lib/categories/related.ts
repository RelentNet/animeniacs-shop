import 'server-only'
import { getArtistByCategoryId } from '@/lib/db/queries/artists'
import { getIpNicknameByCategoryId } from '@/lib/db/queries/ip-nicknames'
import { type ArtistProduct, getItemsByCategoryId } from '@/lib/square/items'

const MAX_RELATED = 6

export type RelatedSource =
  | { kind: 'artist'; slug: string; displayName: string }
  | { kind: 'ip'; slug: string; nickname: string }

export interface RelatedResult {
  items: ArtistProduct[]
  source: RelatedSource | null
}

/**
 * Two-tier resolver for the PDP "More from …" carousel.
 *
 *   Priority 1: any of the product's category ids maps to an artist row
 *               in the local `artists` table. Carousel = items in that
 *               artist's category (minus the current product id).
 *   Priority 2: any category id maps to an ip_nicknames row that is
 *               currently public. Carousel = items in that IP category
 *               (minus the current product id).
 *   Else: empty items + null source. The PDP omits the section.
 *
 * Public label respects the IP-never-public constraint: we expose only
 * the artist's display name OR the IP nickname — never the raw Square
 * category name.
 */
export async function getRelatedProducts(
  currentItemId: string,
  categoryIds: string[]
): Promise<RelatedResult> {
  // Priority 1: artist
  for (const id of categoryIds) {
    const artist = await getArtistByCategoryId(id)
    if (artist) {
      const items = (await getItemsByCategoryId(artist.squareCategoryId))
        .filter((it) => it.id !== currentItemId)
        .slice(0, MAX_RELATED)
      return {
        items,
        source: { kind: 'artist', slug: artist.slug, displayName: artist.displayName }
      }
    }
  }

  // Priority 2: IP nickname
  for (const id of categoryIds) {
    const nickname = await getIpNicknameByCategoryId(id)
    if (nickname && nickname.isPublic) {
      const items = (await getItemsByCategoryId(nickname.squareCategoryId))
        .filter((it) => it.id !== currentItemId)
        .slice(0, MAX_RELATED)
      return {
        items,
        source: { kind: 'ip', slug: nickname.slug, nickname: nickname.nickname }
      }
    }
  }

  return { items: [], source: null }
}
