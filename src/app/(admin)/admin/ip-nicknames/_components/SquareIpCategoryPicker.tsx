import {
  buildHierarchicalLabel,
  getNonArtistCategories,
  listCategoriesFromSquare
} from '@/lib/square/categories'

export interface SquareIpCategoryOption {
  id: string
  /** Hierarchical label like "Anime > Naruto". */
  label: string
}

/**
 * Server-side fetch of the dropdown options. Called from server
 * components and passed to the client form as a prop.
 *
 * `alreadyMappedCategoryIds` lets the form exclude categories that
 * already have an ip_nicknames row (so the operator can't double-map).
 * On the edit page, the current row's category id is re-included so
 * the form's pre-filled value remains selectable.
 */
export async function loadIpCategoryOptions(
  alreadyMappedCategoryIds: Set<string> = new Set()
): Promise<SquareIpCategoryOption[]> {
  const [all, nonArtist] = await Promise.all([listCategoriesFromSquare(), getNonArtistCategories()])
  const allById = new Map(all.map((c) => [c.id, c]))
  return nonArtist
    .filter((c) => !alreadyMappedCategoryIds.has(c.id))
    .map((c) => ({ id: c.id, label: buildHierarchicalLabel(c, allById) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
