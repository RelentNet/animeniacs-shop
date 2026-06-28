/**
 * Classifies a cart line into a parcel class for packing/rating.
 *
 * The catalog encodes the relevant axis two ways (surveyed from the live store):
 *   - Artworks carry a `Media` option → the buyer's chosen VARIATION is named
 *     "Acrylic Wall Art" or "Vinyl Decal Prints".
 *   - Lit Box frames live under the top-level CATEGORY "Lit Box Frame"
 *     (their variation is just "Regular").
 *
 * Mapping:
 *   - "Vinyl Decal Prints" variation → `flat` (rolls up; flat decal fee)
 *   - "Acrylic Wall Art" variation   → `acrylic` (acrylic box)
 *   - "Lit Box Frame" category       → `frame` (frame box)
 *   - everything else (stickers/slaps, posters, customs, etc.) → `flat`
 *
 * Pure module (no I/O). Callers resolve category ids → names first.
 */

export type ParcelClass = 'acrylic' | 'frame' | 'flat'

export const ACRYLIC_VARIATION_NAME = 'Acrylic Wall Art'
export const DECAL_VARIATION_NAME = 'Vinyl Decal Prints'
export const LITBOX_CATEGORY_NAME = 'Lit Box Frame'

export interface ClassifyInput {
  /** The chosen variation's name (e.g. "Acrylic Wall Art" / "Vinyl Decal Prints" / "Regular"). */
  variationName: string | null | undefined
  /** Resolved top-level / all category NAMES for the product. */
  categoryNames: string[]
}

export function classifyLine({ variationName, categoryNames }: ClassifyInput): ParcelClass {
  const variation = (variationName ?? '').trim()

  // The buyer's media choice wins for artworks: a "Vinyl Decal Prints" pick ships
  // as a decal even though the item also sits in the "Acrylic Wall Art" category.
  if (variation === DECAL_VARIATION_NAME) return 'flat'
  if (variation === ACRYLIC_VARIATION_NAME) return 'acrylic'

  // Non-media items: Lit Box frames are the only box-rated "frame" type.
  if (categoryNames.some((c) => c === LITBOX_CATEGORY_NAME)) return 'frame'

  // Stickers/slaps, posters, custom decals, acoustic panels w/o acrylic media, etc.
  return 'flat'
}
