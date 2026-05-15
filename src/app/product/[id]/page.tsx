import { ArtistMetaLine } from '@/components/product/ArtistMetaLine'
import { notFound } from 'next/navigation'

interface PageProps {
  params: { id: string }
}

/**
 * Product detail page.
 *
 * Phase 4 scope (Task D.3): renders the artist meta line — "Designed
 * by [Artist]" linking to /artist/[slug] — for any item whose
 * categories[] contains a category id that maps to a row in the
 * local `artists` table.
 *
 * Phase 5 scope: the rest of the PDP (variants, gallery, add-to-cart,
 * description, reviews) is wired here once the product-fetch path
 * exists. For now this page is intentionally minimal — it surfaces
 * just enough to verify the artist-resolution layer end-to-end.
 *
 * Note (locked Decision 2026-05-15): IP categories are NEVER rendered
 * publicly. The PDP shows the artist meta line only — no IP pills,
 * no IP breadcrumbs, no "From [Anime > Naruto]" surface.
 *
 * Until Phase 5 wires actual product fetching, this page 404s. The
 * artist meta line is unit-tested via tests/public/artist-meta-line.test.tsx
 * with mocked category arrays so D.3's behaviour is covered without
 * a real product to render.
 */
export default async function ProductDetailPage({
  params: _params
}: PageProps): Promise<JSX.Element> {
  // Phase 4 placeholder: no product-fetch path exists yet. Phase 5
  // replaces this with `await getProductById(params.id)` + the rest
  // of the PDP layout. The <ArtistMetaLine /> import below proves
  // the binding compiles and is reachable from this route.
  void ArtistMetaLine
  notFound()
}
