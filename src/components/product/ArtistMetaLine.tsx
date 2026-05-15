import { getArtistByCategoryId } from '@/lib/db/queries/artists'
import type { Artist } from '@/lib/db/schema'
import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'

interface Props {
  /** Square `categories[].id` array on a single product. */
  categoryIds: string[]
}

/**
 * Resolve the artist for a product by walking its Square `categories[]`
 * and looking up each id in the local artists table. Returns the first
 * artist match (a product only ever has one artist), or null if none of
 * the categories map to an artist.
 *
 * Lookups are independent and could be parallelized, but in practice
 * each product has <=5 categories and the DB cache makes this cheap.
 * Sequential keeps the code path simple.
 */
async function resolveArtist(categoryIds: string[]): Promise<Artist | null> {
  for (const id of categoryIds) {
    const artist = await getArtistByCategoryId(id)
    if (artist && artist.status === 'active') {
      return artist
    }
  }
  return null
}

/**
 * "Designed by [Artist]" meta line for a PDP. Renders nothing when no
 * artist match exists (e.g., an item categorized only under product-
 * type taxonomies, or an artist whose row is inactive).
 *
 * Per locked Decision (2026-05-15 session): the artist's name links
 * to /artist/[slug] (internal); the Instagram icon, if present,
 * opens the artist's Instagram in a new tab.
 *
 * Per locked Decision: IP categories are NEVER exposed in the public
 * UI. This component intentionally does NOT render category names
 * other than the artist match.
 */
export async function ArtistMetaLine({ categoryIds }: Props): Promise<JSX.Element | null> {
  const artist = await resolveArtist(categoryIds)
  if (!artist) return null

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-gray-500">Designed by</span>
      <Link
        href={`/artist/${artist.slug}` as Route}
        className="flex items-center gap-2 font-medium hover:underline"
      >
        <Avatar artist={artist} />
        <span>{artist.displayName}</span>
      </Link>
      {artist.instagram && (
        <a
          href={artist.instagram}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${artist.displayName} on Instagram`}
          className="text-gray-500 hover:text-gray-900"
        >
          <InstagramIcon />
        </a>
      )}
    </div>
  )
}

function Avatar({ artist }: { artist: Artist }): JSX.Element {
  if (artist.avatarUrl) {
    return (
      <Image
        src={artist.avatarUrl}
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 rounded-full object-cover"
      />
    )
  }
  const initials = artist.displayName
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-500"
    >
      {initials || '?'}
    </span>
  )
}

function InstagramIcon(): JSX.Element {
  // Simple inline SVG so we don't pull a heroicons/lucide dep.
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}
