import 'server-only'
import type { IpNickname } from '@/lib/db/schema'
import { type ArtistProduct, getItemsByCategoryId } from '@/lib/square/items'

/**
 * Thin wrapper around getItemsByCategoryId for the public IP browse page.
 * Lives here (not in `square/items`) so the public read paths can grow
 * other category-shaped helpers without polluting the Square SDK module.
 */
export async function getProductsForIpNickname(nickname: IpNickname): Promise<ArtistProduct[]> {
  return getItemsByCategoryId(nickname.squareCategoryId)
}
