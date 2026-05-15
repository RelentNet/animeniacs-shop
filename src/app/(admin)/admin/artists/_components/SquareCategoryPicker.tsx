import { getArtistSubCategories } from '@/lib/square/categories'

export interface SquareCategoryOption {
  id: string
  name: string
}

/**
 * Server-side fetch of the dropdown options. Use this in a server
 * component and pass the result down to the client form as a prop
 * (we can't run async data fetching inside a `'use client'` component).
 */
export async function loadArtistCategoryOptions(): Promise<SquareCategoryOption[]> {
  const cats = await getArtistSubCategories()
  return cats.map((c) => ({ id: c.id, name: c.name }))
}
