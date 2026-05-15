import { getActiveArtists } from '@/lib/db/queries/artists'
import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'

export const metadata = {
  title: 'Artists | Animeniacs',
  description: 'Browse the artists who make every Animeniacs drop.'
}

export default async function ArtistGalleryPage(): Promise<JSX.Element> {
  const artists = await getActiveArtists()

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Artists</h1>
        <p className="mt-2 text-gray-700">
          Every Animeniacs drop is made with one of our partner artists. Browse them all.
        </p>
      </header>

      {artists.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {artists.map((a) => (
            <li key={a.id}>
              <Link
                href={`/artist/${a.slug}` as Route}
                className="block rounded-lg p-3 transition hover:bg-gray-50"
              >
                <Avatar src={a.avatarUrl} alt={a.displayName} />
                <div className="mt-3 text-center text-sm font-medium">{a.displayName}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Avatar({ src, alt }: { src: string | null; alt: string }): JSX.Element {
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={300}
        height={300}
        className="aspect-square w-full rounded-full object-cover"
      />
    )
  }
  // Initials-only placeholder for artists without an avatar yet.
  const initials = alt
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')
  return (
    <div
      aria-hidden="true"
      className="flex aspect-square w-full items-center justify-center rounded-full bg-gray-200 text-2xl font-bold text-gray-500"
    >
      {initials || '?'}
    </div>
  )
}

function EmptyState(): JSX.Element {
  return (
    <div className="rounded-lg bg-gray-50 p-8 text-center">
      <p>No artists yet — check back soon.</p>
    </div>
  )
}
