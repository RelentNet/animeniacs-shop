import { ProductCard } from '@/components/product/ProductCard'
import { getArtistBySlug } from '@/lib/db/queries/artists'
import { getReviewSummariesForProducts } from '@/lib/db/queries/reviews'
import type { ReviewSummary } from '@/lib/db/queries/reviews'
import type { Artist } from '@/lib/db/schema'
import { type ArtistProduct, getItemsByCategoryId } from '@/lib/square/items'
import Image from 'next/image'
import { notFound } from 'next/navigation'

interface PageProps {
  params: { slug: string }
}

export async function generateMetadata({ params }: PageProps) {
  const artist = await getArtistBySlug(params.slug)
  if (!artist) return { title: 'Artist not found | Animeniacs' }
  return {
    title: `${artist.displayName} | Animeniacs`,
    description: artist.bio?.slice(0, 160) ?? `Drops by ${artist.displayName} on Animeniacs.`
  }
}

export default async function ArtistProfilePage({ params }: PageProps): Promise<JSX.Element> {
  const artist = await getArtistBySlug(params.slug)
  if (!artist || artist.status !== 'active') {
    notFound()
  }

  // Fetch active items in this artist's Square category. When operators
  // haven't re-categorized real items yet, the result is empty and we
  // show the design-spec empty state.
  const products = await getItemsByCategoryId(artist.squareCategoryId)
  const summaries = await getReviewSummariesForProducts(products.map((p) => p.id))

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <ArtistHeader artist={artist} />

      {products.length === 0 ? (
        <EmptyState artist={artist} />
      ) : (
        <ProductGrid products={products} summaries={summaries} />
      )}
    </div>
  )
}

function ArtistHeader({ artist }: { artist: Artist }): JSX.Element {
  return (
    <header className="mb-8 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <Avatar artist={artist} />
      <div className="flex-1">
        <h1 className="text-3xl font-bold">{artist.displayName}</h1>
        {artist.bio && <p className="mt-2 whitespace-pre-line text-gray-700">{artist.bio}</p>}
        <SocialLinks artist={artist} />
      </div>
    </header>
  )
}

function Avatar({ artist }: { artist: Artist }): JSX.Element {
  if (artist.avatarUrl) {
    return (
      <Image
        src={artist.avatarUrl}
        alt={artist.displayName}
        width={500}
        height={500}
        className="h-32 w-32 rounded-full object-cover sm:h-40 sm:w-40"
      />
    )
  }
  const initials = artist.displayName
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')
  return (
    <div
      aria-hidden="true"
      className="flex h-32 w-32 items-center justify-center rounded-full bg-gray-200 text-3xl font-bold text-gray-500 sm:h-40 sm:w-40"
    >
      {initials || '?'}
    </div>
  )
}

function SocialLinks({ artist }: { artist: Artist }): JSX.Element | null {
  const rawLinks = [
    { label: 'Instagram', url: artist.instagram },
    { label: 'Twitter / X', url: artist.twitter },
    { label: 'Facebook', url: artist.facebook },
    { label: 'YouTube', url: artist.youtube },
    { label: 'TikTok', url: artist.tiktok },
    { label: 'Website', url: artist.website }
  ]
  const links = rawLinks.filter(
    (l): l is { label: string; url: string } => typeof l.url === 'string' && l.url.length > 0
  )

  if (links.length === 0) return null

  return (
    <ul className="mt-3 flex flex-wrap gap-3 text-sm">
      {links.map((l) => (
        <li key={l.label}>
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
          >
            {l.label}
          </a>
        </li>
      ))}
    </ul>
  )
}

function ProductGrid({
  products,
  summaries
}: {
  products: ArtistProduct[]
  summaries: Map<string, ReviewSummary>
}): JSX.Element {
  return (
    <section className="mt-12">
      <h2 className="sr-only">Drops</h2>
      <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        {products.map((p) => (
          <li key={p.id}>
            <ProductCard product={p} rating={summaries.get(p.id)} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function EmptyState({ artist }: { artist: Artist }): JSX.Element {
  const instagram = artist.instagram
  return (
    <section className="mt-12 rounded-lg bg-gray-50 p-8 text-center">
      <h2 className="text-xl font-semibold">No drops yet</h2>
      <p className="mt-2 text-gray-700">
        {artist.displayName} doesn’t have any drops yet
        {instagram ? (
          <>
            {' '}
            — follow them on{' '}
            <a
              href={instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
            >
              Instagram
            </a>{' '}
            to be the first to know.
          </>
        ) : (
          <>.</>
        )}
      </p>
    </section>
  )
}
